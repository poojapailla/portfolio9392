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
    fillTextEditor();
    renderProjects();
  } catch (error) {
    byId("save-message").textContent = error.message;
  }
}

function fillTextEditor() {
  const profile = currentContent.profile || {};
  const profileFields = {
    "edit-name": profile.name,
    "edit-initials": profile.initials,
    "edit-title": profile.title,
    "edit-availability": profile.availability,
    "edit-email": profile.email,
    "edit-phone": profile.phone,
    "edit-location": profile.location,
    "edit-image": profile.image,
    "edit-linkedin": profile.linkedin,
    "edit-github": profile.github,
    "edit-summary": currentContent.summary,
    "edit-education": (currentContent.education || []).map((item) => [
      item.institution, item.degree || item.qualification, item.duration, item.result,
      item.location, item.branch, (item.coursework || []).join(", "),
    ].join(" | ")).join("\n"),
    "edit-experience": (currentContent.experience || []).map((item) => [
      `${item.company || ""} | ${item.role || ""} | ${item.dates || ""}`,
      ...(item.responsibilities || []).map((duty) => `- ${duty}`),
    ].join("\n")).join("\n\n"),
    "edit-skills": Object.entries(currentContent.skills || {}).map(([category, skills]) => (
      `${category}: ${(Array.isArray(skills) ? skills : []).join(", ")}`
    )).join("\n"),
    "edit-certifications": (currentContent.certifications || []).map((item) => [
      item.name || "", item.certification || "", item.file || "",
    ].join(" | ")).join("\n"),
    "edit-resume": currentContent.resume?.file || "",
  };
  Object.entries(profileFields).forEach(([id, value]) => {
    byId(id).value = value || "";
  });
}

function splitFields(line) {
  return line.split("|").map((field) => field.trim());
}

function existingBy(items, predicate) {
  return items.find((item) => predicate(item)) || {};
}

function copyContent() {
  return JSON.parse(JSON.stringify(currentContent));
}

function parseEducation(text) {
  return text.split(/\r?\n/).map((line, index) => {
    if (!line.trim()) return null;
    const [institution, degree, duration, result, location, branch, coursework = ""] = splitFields(line);
    if (!institution || !degree) {
      throw new Error(`Education line ${index + 1} needs a school and qualification, separated by |.`);
    }
    const previous = existingBy(currentContent.education || [], (item) => item.institution === institution);
    return {
      ...previous,
      institution,
      degree,
      duration,
      result,
      location,
      branch,
      coursework: coursework ? coursework.split(",").map((item) => item.trim()).filter(Boolean) : [],
    };
  }).filter(Boolean);
}

function parseExperience(text) {
  return text.split(/\r?\n\s*\r?\n/).map((block, index) => {
    if (!block.trim()) return null;
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const [company, role, dates = ""] = splitFields(lines.shift() || "");
    if (!company || !role) {
      throw new Error(`Experience block ${index + 1} needs a company and role on its first line, separated by |.`);
    }
    const previous = existingBy(currentContent.experience || [], (item) => item.company === company && item.role === role);
    return {
      ...previous,
      company,
      role,
      dates,
      responsibilities: lines.map((line) => line.replace(/^[-*•]\s*/, "")).filter(Boolean),
    };
  }).filter(Boolean);
}

function parseSkills(text) {
  const skills = {};
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error(`Skills line ${index + 1} needs a category followed by a colon.`);
    const category = line.slice(0, separator).trim();
    const items = line.slice(separator + 1).split(",").map((item) => item.trim()).filter(Boolean);
    if (!category || !items.length) throw new Error(`Skills line ${index + 1} needs a category and at least one skill.`);
    skills[category] = items;
  });
  return skills;
}

function parseCertifications(text) {
  return text.split(/\r?\n/).map((line, index) => {
    if (!line.trim()) return null;
    const [name, certification, file = ""] = splitFields(line);
    if (!name || !certification) {
      throw new Error(`Certificate line ${index + 1} needs a provider and certification name, separated by |.`);
    }
    const previous = existingBy(currentContent.certifications || [], (item) => (
      item.name === name && item.certification === certification
    ));
    return { ...previous, name, certification, file };
  }).filter(Boolean);
}

byId("text-content-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  byId("save-message").style.color = "";
  byId("save-message").textContent = "";
  const saveButton = byId("save-button");
  saveButton.disabled = true;
  try {
    const draft = copyContent();
    draft.profile = {
      ...draft.profile,
      name: byId("edit-name").value.trim(),
      initials: byId("edit-initials").value.trim() || "PP",
      title: byId("edit-title").value.trim(),
      availability: byId("edit-availability").value.trim(),
      email: byId("edit-email").value.trim(),
      phone: byId("edit-phone").value.trim(),
      location: byId("edit-location").value.trim(),
      image: byId("edit-image").value.trim(),
      linkedin: byId("edit-linkedin").value.trim(),
      github: byId("edit-github").value.trim(),
    };
    draft.summary = byId("edit-summary").value.trim();
    draft.education = parseEducation(byId("edit-education").value);
    draft.experience = parseExperience(byId("edit-experience").value);
    draft.skills = parseSkills(byId("edit-skills").value);
    draft.certifications = parseCertifications(byId("edit-certifications").value);
    draft.resume = { ...draft.resume, file: byId("edit-resume").value.trim() };
    await api("/api/content", { method: "PUT", body: JSON.stringify(draft) });
    currentContent = draft;
    fillTextEditor();
    renderProjects();
    byId("save-message").style.color = "#a9e9cf";
    byId("save-message").textContent = "Your portfolio text has been saved.";
  } catch (error) {
    byId("save-message").textContent = error instanceof SyntaxError
      ? "Could not read the portfolio content. Refresh and try again."
      : error.message;
  } finally {
    saveButton.disabled = false;
  }
});

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
  const draft = copyContent();
  draft.projects = projects;
  await api("/api/content", { method: "PUT", body: JSON.stringify(draft) });
  currentContent = draft;
  renderProjects();
}

async function deleteProject(index) {
  const project = currentContent?.projects?.[index];
  if (!project || !window.confirm(`Delete “${project.name || "Untitled project"}”?`)) return;
  byId("projects-message").textContent = "";
  try {
    const draft = copyContent();
    draft.projects.splice(index, 1);
    await api("/api/content", { method: "PUT", body: JSON.stringify(draft) });
    currentContent = draft;
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
