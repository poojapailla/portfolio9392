const byId = (id) => document.getElementById(id);
const authPanel = byId("auth-panel");
const dashboard = byId("dashboard");
let csrfToken = "";
let setupRequired = false;
let currentContent = null;
let editingProjectIndex = null;

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
    ? "Your admin ID is pooja9392. Choose a password for the owner dashboard."
    : "Enter your admin ID and password to update your portfolio content and uploads.";
  byId("password-label").textContent = needsSetup ? "Create owner password" : "Owner password";
  byId("admin-password").autocomplete = needsSetup ? "new-password" : "current-password";
  byId("password-hint").textContent = "";
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
    renderProjects();
  } catch (error) {
    byId("save-message").textContent = error.message;
  }
}

function renderProjects() {
  const list = byId("admin-project-list");
  list.replaceChildren();
  const projects = currentContent?.projects || [];
  if (!projects.length) {
    list.append(Object.assign(document.createElement("p"), {
      className: "project-empty",
      textContent: "No projects yet. Select “Add project” to create your first one.",
    }));
    return;
  }
  projects.forEach((project, index) => {
    const card = document.createElement("article");
    card.className = "admin-project-card";
    const details = document.createElement("div");
    details.className = "admin-project-details";
    const name = document.createElement("h3");
    name.textContent = project.name || "Untitled project";
    const description = document.createElement("p");
    description.textContent = project.description || "";
    details.append(name, description);
    const features = document.createElement("div");
    features.className = "admin-project-features";
    (project.features || []).forEach((feature) => {
      const tag = document.createElement("span");
      tag.textContent = feature;
      features.append(tag);
    });
    details.append(features);
    const actions = document.createElement("div");
    actions.className = "admin-project-actions";
    const edit = document.createElement("button");
    edit.className = "button button-outline";
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => openProjectForm(index));
    const remove = document.createElement("button");
    remove.className = "button button-outline project-delete-button";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => deleteProject(index));
    actions.append(edit, remove);
    card.append(details, actions);
    list.append(card);
  });
}

function openProjectForm(index = null) {
  editingProjectIndex = index;
  const project = index === null ? {} : currentContent.projects[index];
  byId("project-form").reset();
  byId("project-name").value = project.name || "";
  byId("project-link").value = project.link || "";
  byId("project-description").value = project.description || "";
  byId("project-features").value = (project.features || []).join("\n");
  byId("project-image").value = project.image || "";
  byId("project-form-heading").textContent = index === null ? "Add a project" : "Edit project";
  byId("project-save-button").textContent = index === null ? "Save project" : "Save changes";
  byId("project-form").classList.remove("hidden");
  byId("project-form").scrollIntoView({ behavior: "smooth", block: "center" });
  byId("project-name").focus({ preventScroll: true });
}

function closeProjectForm() {
  byId("project-form").classList.add("hidden");
  byId("project-form").reset();
  editingProjectIndex = null;
}

async function saveProjectList(projects) {
  const draft = JSON.parse(byId("content-editor").value);
  if (!draft || Array.isArray(draft) || typeof draft !== "object") {
    throw new Error("Portfolio content must be a JSON object.");
  }
  if (JSON.stringify(draft.projects || []) !== JSON.stringify(currentContent.projects || [])) {
    throw new Error("Save your project edits in the JSON editor first, then use the project manager.");
  }
  draft.projects = projects;
  await api("/api/content", { method: "PUT", body: JSON.stringify(draft) });
  currentContent = draft;
  byId("content-editor").value = JSON.stringify(currentContent, null, 2);
  renderProjects();
}

async function deleteProject(index) {
  const project = currentContent?.projects?.[index];
  if (!project || !window.confirm(`Delete “${project.name || "Untitled project"}”?`)) return;
  byId("projects-message").textContent = "";
  try {
    const draft = JSON.parse(byId("content-editor").value);
    if (!Array.isArray(draft.projects)) throw new Error("Projects must be a list in the portfolio content.");
    if (JSON.stringify(draft.projects) !== JSON.stringify(currentContent.projects || [])) {
      throw new Error("Save your project edits in the JSON editor first, then use the project manager.");
    }
    draft.projects.splice(index, 1);
    await api("/api/content", { method: "PUT", body: JSON.stringify(draft) });
    currentContent = draft;
    byId("content-editor").value = JSON.stringify(currentContent, null, 2);
    renderProjects();
    byId("projects-message").style.color = "#a9e9cf";
    byId("projects-message").textContent = "Project deleted.";
  } catch (error) {
    byId("projects-message").style.color = "";
    byId("projects-message").textContent = error instanceof SyntaxError
      ? `Save or fix your portfolio JSON changes first: ${error.message}`
      : error.message;
  }
}

byId("add-project-button").addEventListener("click", () => openProjectForm());
byId("project-cancel-button").addEventListener("click", closeProjectForm);
byId("project-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  byId("projects-message").textContent = "";
  const project = {
    name: byId("project-name").value.trim(),
    description: byId("project-description").value.trim(),
    features: byId("project-features").value.split(/\r?\n/).map((feature) => feature.trim()).filter(Boolean),
    image: byId("project-image").value.trim(),
    link: byId("project-link").value.trim(),
  };
  if (!project.name || !project.description) {
    byId("projects-message").textContent = "Project name and description are required.";
    return;
  }
  const saveButton = byId("project-save-button");
  saveButton.disabled = true;
  const isEditing = editingProjectIndex !== null;
  try {
    const projects = [...(currentContent?.projects || [])];
    if (editingProjectIndex === null) projects.push(project);
    else projects[editingProjectIndex] = project;
    await saveProjectList(projects);
    closeProjectForm();
    byId("projects-message").style.color = "#a9e9cf";
    byId("projects-message").textContent = isEditing ? "Project updated." : "Project added.";
  } catch (error) {
    byId("projects-message").style.color = "";
    byId("projects-message").textContent = error instanceof SyntaxError
      ? `Save or fix your portfolio JSON changes first: ${error.message}`
      : error.message;
  } finally {
    saveButton.disabled = false;
  }
});

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
    renderProjects();
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
