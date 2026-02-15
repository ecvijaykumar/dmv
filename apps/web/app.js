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
    list.innerHTML = "<li>No sessions yet.</li>";
    return;
  }

  sessions
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach((session) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <div>
          <strong>${session.date}</strong> ${session.startTime} • ${session.durationMinutes} min • ${session.timeOfDay} • ${session.weather}
          <div>Profile: ${session.profileId}</div>
          <div>${session.notes || "No notes"}</div>
        </div>
      `;

      const delButton = document.createElement("button");
      delButton.textContent = "Delete";
      delButton.className = "delete";
      delButton.onclick = async () => {
        const headers = await authHeaders();
        await fetch(`/api/sessions/${session.id}`, {
          method: "DELETE",
          headers: { Authorization: headers.Authorization }
        });
        await refresh();
      };

      li.appendChild(delButton);
      list.appendChild(li);
    });
}

function renderStats(summary) {
  stats.innerHTML = `
    <p>Total sessions: <strong>${summary.sessionCount}</strong></p>
    <p>Total hours: <strong>${summary.totalHours}</strong></p>
    <p>Day hours: <strong>${summary.dayHours}</strong></p>
    <p>Night hours: <strong>${summary.nightHours}</strong></p>
  `;
}

async function refresh() {
  if (!currentUser) {
    list.innerHTML = "<li>Sign in to view sessions.</li>";
    stats.innerHTML = "Sign in to view summary.";
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
    form.classList.add("hidden");
    signOutBtn.classList.add("hidden");
    await refresh();
    return;
  }

  authStatus.textContent = `Signed in as ${user.email || user.phoneNumber || user.uid}`;
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
