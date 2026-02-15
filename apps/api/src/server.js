import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyBearerToken } from "./auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../..");
const webDir = path.resolve(rootDir, "apps/web");
const dataFile = path.resolve(__dirname, "../data/sessions.json");
const PORT = Number(process.env.PORT || 4000);

function getPublicFirebaseConfig() {
  const config = {
    apiKey: process.env.FIREBASE_WEB_API_KEY,
    authDomain: process.env.FIREBASE_WEB_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_WEB_PROJECT_ID,
    storageBucket: process.env.FIREBASE_WEB_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_WEB_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_WEB_APP_ID
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    config,
    missing
  };
}

async function readSessions() {
  const raw = await fs.readFile(dataFile, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeSessions(sessions) {
  await fs.writeFile(dataFile, JSON.stringify(sessions, null, 2));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  });
  res.end(JSON.stringify(payload));
}

function computeStats(sessions, ownerUserId, profileId) {
  const filtered = sessions.filter((s) => {
    if (s.ownerUserId !== ownerUserId) return false;
    if (!profileId) return true;
    return s.profileId === profileId;
  });

  const totalMinutes = filtered.reduce((sum, s) => sum + Number(s.durationMinutes || 0), 0);
  const nightMinutes = filtered
    .filter((s) => s.timeOfDay === "night")
    .reduce((sum, s) => sum + Number(s.durationMinutes || 0), 0);

  return {
    profileId: profileId || "all",
    sessionCount: filtered.length,
    totalHours: Number((totalMinutes / 60).toFixed(2)),
    dayHours: Number(((totalMinutes - nightMinutes) / 60).toFixed(2)),
    nightHours: Number((nightMinutes / 60).toFixed(2))
  };
}

function validateSession(input) {
  const required = ["profileId", "date", "startTime", "durationMinutes", "timeOfDay", "weather"];
  for (const key of required) {
    if (!input[key]) {
      return `${key} is required`;
    }
  }
  const minutes = Number(input.durationMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "durationMinutes must be a positive number";
  }
  if (!["day", "night"].includes(input.timeOfDay)) {
    return "timeOfDay must be 'day' or 'night'";
  }
  return null;
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : {};
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  return "text/plain; charset=utf-8";
}

async function serveWebAsset(req, res) {
  let filePath = req.url === "/" ? "/index.html" : req.url;
  if (filePath.includes("..")) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  const resolved = path.join(webDir, filePath);
  try {
    const content = await fs.readFile(resolved);
    res.writeHead(200, { "Content-Type": contentTypeFor(resolved) });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

async function requireAuth(req, res) {
  const auth = await verifyBearerToken(req.headers);
  if (!auth.ok) {
    sendJson(res, auth.status || 401, { error: auth.error });
    return null;
  }
  return auth.user;
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (req.method === "GET" && req.url === "/api/public-config") {
    const { config, missing } = getPublicFirebaseConfig();
    if (missing.length > 0) {
      sendJson(res, 500, {
        error: "Missing Firebase web config env vars",
        missing
      });
      return;
    }
    sendJson(res, 200, { firebase: config });
    return;
  }

  if (req.method === "GET" && req.url === "/api/me") {
    const user = await requireAuth(req, res);
    if (!user) return;
    sendJson(res, 200, { user });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/sessions")) {
    const user = await requireAuth(req, res);
    if (!user) return;

    const url = new URL(req.url, `http://${req.headers.host}`);
    const profileId = url.searchParams.get("profileId");
    const sessions = await readSessions();
    const filtered = sessions.filter((s) => {
      if (s.ownerUserId !== user.uid) return false;
      if (!profileId) return true;
      return s.profileId === profileId;
    });
    sendJson(res, 200, { sessions: filtered });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/stats")) {
    const user = await requireAuth(req, res);
    if (!user) return;

    const url = new URL(req.url, `http://${req.headers.host}`);
    const profileId = url.searchParams.get("profileId");
    const sessions = await readSessions();
    sendJson(res, 200, computeStats(sessions, user.uid, profileId));
    return;
  }

  if (req.method === "POST" && req.url === "/api/sessions") {
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
      const payload = await parseBody(req);
      const validationError = validateSession(payload);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      const sessions = await readSessions();
      const session = {
        id: `s_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        ownerUserId: user.uid,
        ownerEmail: user.email,
        ownerPhone: user.phoneNumber,
        profileId: payload.profileId,
        date: payload.date,
        startTime: payload.startTime,
        durationMinutes: Number(payload.durationMinutes),
        timeOfDay: payload.timeOfDay,
        weather: payload.weather,
        notes: payload.notes || "",
        createdAt: new Date().toISOString()
      };
      sessions.push(session);
      await writeSessions(sessions);
      sendJson(res, 201, { session });
    } catch {
      sendJson(res, 400, { error: "Invalid JSON payload" });
    }
    return;
  }

  if (req.method === "DELETE" && req.url.startsWith("/api/sessions/")) {
    const user = await requireAuth(req, res);
    if (!user) return;

    const id = req.url.replace("/api/sessions/", "").trim();
    const sessions = await readSessions();
    const target = sessions.find((s) => s.id === id);
    if (!target) {
      sendJson(res, 404, { error: "Session not found" });
      return;
    }
    if (target.ownerUserId !== user.uid) {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }
    const next = sessions.filter((s) => s.id !== id);
    await writeSessions(next);
    sendJson(res, 200, { deleted: true });
    return;
  }

  if (
    req.method === "GET" &&
    (req.url === "/" ||
      req.url.startsWith("/index") ||
      req.url.startsWith("/assets/") ||
      req.url.endsWith(".css") ||
      req.url.endsWith(".js") ||
      req.url.endsWith(".json") ||
      req.url.endsWith(".svg") ||
      req.url.endsWith(".png"))
  ) {
    await serveWebAsset(req, res);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`T-Drive API listening on http://localhost:${PORT}`);
});
