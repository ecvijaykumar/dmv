import admin from "firebase-admin";

let initialized = false;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function initFirebaseAdmin() {
  if (initialized) return;

  const projectId = requiredEnv("FIREBASE_PROJECT_ID");
  const clientEmail = requiredEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = requiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });

  initialized = true;
}

export async function verifyBearerToken(headers) {
  const authHeader = headers.authorization || headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing Bearer token" };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return { ok: false, status: 401, error: "Empty token" };
  }

  try {
    initFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(token);
    return {
      ok: true,
      user: {
        uid: decoded.uid,
        email: decoded.email || null,
        phoneNumber: decoded.phone_number || null,
        name: decoded.name || null
      }
    };
  } catch (error) {
    return { ok: false, status: 401, error: `Invalid token: ${error.message}` };
  }
}
