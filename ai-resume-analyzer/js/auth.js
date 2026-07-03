/**
 * Demo authentication layer.
 *
 * This project's focus is the AI resume-analysis pipeline, not a full
 * identity system. To keep the login screen functional in a static
 * deploy (no database), sign-in is handled entirely client-side:
 * any email + a password of 4+ characters creates a local session
 * token in localStorage. Swap `fakeSignIn()` for a real auth
 * provider (Firebase Auth, Auth0, Supabase Auth, or your own
 * /api/login endpoint) to make this production-ready — the rest of
 * the app only depends on `isLoggedIn()` / `getSession()`, so that
 * swap does not require touching app.js.
 */

const SESSION_KEY = "ara_session";

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function isLoggedIn() {
  return !!getSession();
}

function fakeSignIn(email) {
  const session = { email, signedInAt: Date.now() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function signOut() {
  localStorage.removeItem(SESSION_KEY);
  window.location.href = "index.html";
}

/* ---------------- Login page wiring ---------------- */

const loginForm = document.getElementById("loginForm");
if (loginForm) {
  // Already signed in? Skip the login screen.
  if (isLoggedIn()) window.location.href = "app.html";

  const errorEl = document.getElementById("authError");

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || password.length < 4) {
      errorEl.textContent = "Enter a valid email and a password of at least 4 characters.";
      errorEl.hidden = false;
      return;
    }

    errorEl.hidden = true;
    fakeSignIn(email);
    window.location.href = "app.html";
  });

  const googleBtn = document.getElementById("googleBtn");
  if (googleBtn) {
    googleBtn.addEventListener("click", () => {
      // Placeholder: wire up real Google OAuth (e.g. Google Identity
      // Services) here. For the demo we just start a local session.
      fakeSignIn("guest@google.demo");
      window.location.href = "app.html";
    });
  }
}

/* ---------------- App page wiring ---------------- */

const userEmailEl = document.getElementById("userEmail");
if (userEmailEl) {
  const session = getSession();
  if (!session) {
    window.location.href = "index.html";
  } else {
    userEmailEl.textContent = session.email;
  }
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", signOut);
}
