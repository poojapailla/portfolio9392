const byId = (id) => document.getElementById(id);
const authPanel = byId("auth-panel");
const dashboard = byId("dashboard");
let csrfToken = "";
let setupRequired = false;
let currentContent = null;

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (csrfToken && options.method && options.method !== "GET") headers.set("X-CSRF-Token", csrfToken);
  const response = await fetch(url, { ...options, headers, cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}

function showAuth(needsSetup) {
  setupRequired = needsSetup;
  authPanel.classList.remove("hidden");
  dashboard.classList.add("hidden");
  byId("admin-username").value = "pooja9392";
  byId("auth-title").textContent = needsSetup ? "Set up your dashboard." : "Welcome back.";
  byId("auth-description").textContent = needsSetup
    ? "Your admin ID is pooja9392. Create a strong password to secure the owner dashboard."
    : "Enter your admin ID and password to update your portfolio content and uploads.";
  byId("password-label").textContent = needsSetup ? "Create owner password" : "Owner password";
  byId("admin-password").autocomplete = needsSetup ? "new-password" : "current-password";
  byId("password-hint").textContent = needsSetup ? "Use at least 12 characters. Store it somewhere safe; it cannot be recovered." : "";
  byId("auth-submit").innerHTML = needsSetup ? "Create password <span>↗</span>" : "Sign in <span>↗</span>";
}

async function initialize() {
  try {
    const session = await api("/api/session");
    if (session.authenticated) {
      csrfToken = session.csrf;
      await showDashboard();
      return;
    }
    const status = await api("/api/status");
    showAuth(status.setupRequired);
  } catch (error) {
    byId("auth-message").textContent = error.message;
  }
}

async function showDashboard() {
  authPanel.classList.add("hidden");
  dashboard.classList.remove("hidden");
  try {
    currentContent = await api("/api/content");
    byId("content-editor").value = JSON.stringify(currentContent, null, 2);
  } catch (error) {
    byId("save-message").textContent = error.message;
  }
}

byId("auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  byId("auth-message").textContent = "";
  const password = byId("admin-password").value;
  try {
    const session = await api(setupRequired ? "/api/setup" : "/api/login", {
      method: "POST",
      body: JSON.stringify({ username: byId("admin-username").value, password }),
    });
    csrfToken = session.csrf;
    await showDashboard();
  } catch (error) {
    byId("auth-message").textContent = error.message;
  }
});

byId("save-button").addEventListener("click", async () => {
  byId("save-message").textContent = "";
  try {
    const content = JSON.parse(byId("content-editor").value);
    if (!content || Array.isArray(content) || typeof content !== "object") throw new Error("Content must be a JSON object.");
    await api("/api/content", { method: "PUT", body: JSON.stringify(content) });
    currentContent = content;
    byId("content-editor").value = JSON.stringify(content, null, 2);
    byId("save-message").style.color = "#a9e9cf";
    byId("save-message").textContent = "Saved. The public portfolio now reflects your changes.";
  } catch (error) {
    byId("save-message").style.color = "";
    byId("save-message").textContent = error instanceof SyntaxError ? `Invalid JSON: ${error.message}` : error.message;
  }
});

byId("upload-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  byId("upload-message").textContent = "";
  byId("upload-result").classList.add("hidden");
  const file = byId("asset-file").files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    byId("upload-message").textContent = "Files must be 10 MB or smaller.";
    return;
  }
  const form = new FormData();
  form.append("file", file);
  byId("upload-button").disabled = true;
  try {
    const result = await api("/api/upload", { method: "POST", body: form });
    byId("upload-path").textContent = result.url;
    byId("upload-result").classList.remove("hidden");
    byId("upload-message").style.color = "#a9e9cf";
    byId("upload-message").textContent = "Upload complete.";
  } catch (error) {
    byId("upload-message").style.color = "";
    byId("upload-message").textContent = error.message;
  } finally {
    byId("upload-button").disabled = false;
  }
});

byId("copy-path").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(byId("upload-path").textContent);
    byId("copy-path").textContent = "Copied";
    setTimeout(() => { byId("copy-path").textContent = "Copy path"; }, 1500);
  } catch {
    byId("upload-message").textContent = "Copy is unavailable. Select and copy the path above.";
  }
});

byId("logout-button").addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
    csrfToken = "";
    byId("admin-password").value = "";
    showAuth(false);
  } catch (error) {
    byId("save-message").textContent = error.message;
  }
});

initialize();
