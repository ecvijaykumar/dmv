import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  getAuth,
  onAuthStateChanged,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { firebaseConfig } from "/firebase-config.js";

const form = document.getElementById("sessionForm");
const list = document.getElementById("sessionList");
const stats = document.getElementById("stats");
const authStatus = document.getElementById("authStatus");
const googleBtn = document.getElementById("googleLoginBtn");
const phoneInput = document.getElementById("phoneNumber");
const sendOtpBtn = document.getElementById("sendOtpBtn");
const otpInput = document.getElementById("otpCode");
const verifyOtpBtn = document.getElementById("verifyOtpBtn");
const signOutBtn = document.getElementById("signOutBtn");
const profileInput = document.getElementById("profileId");

let currentUser = null;
let confirmation = null;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
  size: "normal"
});

async function authHeaders() {
  if (!currentUser) throw new Error("Sign in required");
  const token = await currentUser.getIdToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

async function fetchSessions() {
  const profileId = profileInput.value.trim();
  const res = await fetch(`/api/sessions?profileId=${encodeURIComponent(profileId)}`, {
    headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` }
  });
  if (!res.ok) throw new Error("Failed to fetch sessions");
  const data = await res.json();
  return data.sessions || [];
}

async function fetchStats() {
  const profileId = profileInput.value.trim();
  const res = await fetch(`/api/stats?profileId=${encodeURIComponent(profileId)}`, {
    headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` }
  });
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

function renderList(sessions) {
  list.innerHTML = "";
  if (!sessions.length) {
    list.innerHTML = `
      <li class="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
        No sessions yet for this profile.
      </li>
    `;
    return;
  }

  sessions
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach((session) => {
      const li = document.createElement("li");
      li.className = "rounded-xl border border-slate-700 bg-slate-900/60 p-4";
      li.innerHTML = `
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="space-y-1">
            <p class="text-sm font-semibold text-slate-100">
              ${session.date} at ${session.startTime}
            </p>
            <p class="text-sm text-slate-300">
              ${session.durationMinutes} min • <span class="capitalize">${session.timeOfDay}</span> • <span class="capitalize">${session.weather}</span>
            </p>
            <p class="text-xs text-cyan-200">Profile: ${session.profileId}</p>
            <p class="text-sm text-slate-400">${session.notes || "No notes"}</p>
          </div>
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "mt-3 flex justify-end";

      const delButton = document.createElement("button");
      delButton.textContent = "Delete";
      delButton.className = "rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-sm font-medium text-rose-100 transition hover:bg-rose-500/20";
      delButton.onclick = async () => {
        const headers = await authHeaders();
        await fetch(`/api/sessions/${session.id}`, {
          method: "DELETE",
          headers: { Authorization: headers.Authorization }
        });
        await refresh();
      };

      actions.appendChild(delButton);
      li.appendChild(actions);
      list.appendChild(li);
    });
}

function statCard(label, value) {
  return `
    <div class="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
      <p class="text-xs uppercase tracking-wide text-slate-400">${label}</p>
      <p class="mt-1 text-xl font-bold text-cyan-100">${value}</p>
    </div>
  `;
}

function renderStats(summary) {
  stats.innerHTML = `
    <div class="grid gap-3 sm:grid-cols-2">
      ${statCard("Total Sessions", summary.sessionCount)}
      ${statCard("Total Hours", summary.totalHours)}
      ${statCard("Day Hours", summary.dayHours)}
      ${statCard("Night Hours", summary.nightHours)}
    </div>
  `;
}

async function refresh() {
  if (!currentUser) {
    list.innerHTML = `
      <li class="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
        Sign in to view sessions.
      </li>
    `;
    stats.innerHTML = '<p class="text-sm text-slate-400">Sign in to view summary.</p>';
    return;
  }
  const [sessions, summary] = await Promise.all([fetchSessions(), fetchStats()]);
  renderList(sessions);
  renderStats(summary);
}

googleBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    alert(error.message || "Google sign-in failed");
  }
});

sendOtpBtn.addEventListener("click", async () => {
  const phone = phoneInput.value.trim();
  if (!phone) {
    alert("Enter phone number in E.164 format, e.g. +14085551234");
    return;
  }
  try {
    confirmation = await signInWithPhoneNumber(auth, phone, recaptchaVerifier);
    alert("OTP sent. Enter the code.");
  } catch (error) {
    alert(error.message || "Failed to send OTP");
  }
});

verifyOtpBtn.addEventListener("click", async () => {
  if (!confirmation) {
    alert("Request OTP first.");
    return;
  }
  try {
    await confirmation.confirm(otpInput.value.trim());
  } catch (error) {
    alert(error.message || "Invalid OTP");
  }
});

signOutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (!user) {
    authStatus.textContent = "Not signed in";
    authStatus.className = "mb-4 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-300";
    form.classList.add("hidden");
    signOutBtn.classList.add("hidden");
    await refresh();
    return;
  }

  authStatus.textContent = `Signed in as ${user.email || user.phoneNumber || user.uid}`;
  authStatus.className = "mb-4 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100";
  form.classList.remove("hidden");
  signOutBtn.classList.remove("hidden");
  await refresh();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    profileId: profileInput.value.trim(),
    date: form.date.value,
    startTime: form.startTime.value,
    durationMinutes: Number(form.durationMinutes.value),
    timeOfDay: form.timeOfDay.value,
    weather: form.weather.value,
    notes: form.notes.value
  };

  const headers = await authHeaders();
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const error = await res.json();
    alert(error.error || "Unable to save session");
    return;
  }

  form.reset();
  profileInput.value = payload.profileId;
  await refresh();
});

profileInput.addEventListener("change", refresh);
refresh();
