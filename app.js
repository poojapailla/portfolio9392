const $ = (id) => document.getElementById(id);
const text = (element, value) => { if (element) element.textContent = value ?? ""; };
const link = (element, value, href) => { if (element) { element.textContent = value ?? ""; element.href = href ?? "#"; } };
const safeUrl = (value) => {
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
};
const make = (tag, className, content) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
};

async function loadPortfolio() {
  try {
    const response = await fetch("/api/content", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load portfolio content.");
    renderPortfolio(await response.json());
  } catch (error) {
    console.error(error);
    $("hero-summary").textContent = "Portfolio content is temporarily unavailable.";
  }
}

function renderPortfolio(data) {
  const profile = data.profile || {};
  const nameParts = (profile.name || "Pailla Pooja").trim().split(/\s+/);
  const firstName = nameParts.shift() || "Pailla";
  const restName = nameParts.join(" ") || "Pooja";
  const initials = profile.initials || "PP";
  document.title = `${profile.name || "Pailla Pooja"} — AI & ML Student`;
  ["brand-name", "footer-name", "copyright-name"].forEach((id) => text($(id), profile.name || "Pailla Pooja"));
  ["brand-initials", "footer-initials", "portrait-initials"].forEach((id) => text($(id), initials));
  const heroName = $("hero-name");
  heroName.replaceChildren(document.createTextNode(`${firstName} `), make("span", "gradient-text", `${restName}.`));
  text($("hero-title"), profile.title);
  text($("availability"), profile.availability);
  text($("hero-summary"), data.summary);
  text($("about-summary"), data.summary);
  text($("location"), profile.location);
  link($("email-link"), "Email ↗", profile.email ? `mailto:${profile.email}` : "");
  link($("contact-email"), profile.email, profile.email ? `mailto:${profile.email}` : "");
  link($("contact-email-large"), profile.email, profile.email ? `mailto:${profile.email}` : "");
  link($("contact-phone"), profile.phone, profile.phone ? `tel:${profile.phone}` : "");
  link($("contact-phone-link"), profile.phone ? `${profile.phone} ↗` : "", profile.phone ? `tel:${profile.phone}` : "");
  link($("github-link"), "GitHub ↗", safeUrl(profile.github));
  link($("contact-github"), "GitHub ↗", safeUrl(profile.github));
  link($("linkedin-link"), "LinkedIn ↗", safeUrl(profile.linkedin));
  link($("contact-linkedin"), "LinkedIn ↗", safeUrl(profile.linkedin));
  text($("year"), new Date().getFullYear());
  const portrait = $("portrait");
  if (profile.image && profile.image.startsWith("/uploads/")) {
    const image = document.createElement("img");
    image.src = profile.image;
    image.alt = `Portrait of ${profile.name || "Pailla Pooja"}`;
    portrait.replaceChildren(image);
  } else {
    text($("portrait-initials"), initials);
  }
  renderExperience(data.experience || []);
  renderProjects(data.projects || []);
  renderSkills(data.skills || {});
  renderEducation(data.education || []);
  renderCertifications(data.certifications || []);
  const resume = data.resume?.file;
  const resumeLink = $("resume-download");
  if (resume && resume.startsWith("/uploads/") && resume.toLowerCase().endsWith(".pdf")) {
    resumeLink.href = resume;
    resumeLink.target = "_blank";
    resumeLink.rel = "noreferrer";
    resumeLink.innerHTML = "View / download resume <span>↗</span>";
    $("hero-resume").href = resume;
    $("hero-resume").target = "_blank";
    $("hero-resume").rel = "noreferrer";
    $("hero-resume").innerHTML = "View resume <span>↗</span>";
  }
}

function renderExperience(items) {
  const list = $("experience-list");
  list.replaceChildren();
  items.forEach((item) => {
    const card = make("article", "timeline-card");
    const top = make("div", "timeline-top");
    const heading = document.createElement("div");
    heading.append(make("h3", "", item.company), make("div", "role", item.role));
    top.append(heading, make("span", "timeline-date", item.dates || ""));
    card.append(top);
    if (item.responsibilities?.length) {
      const ul = document.createElement("ul");
      item.responsibilities.forEach((duty) => ul.append(make("li", "", duty)));
      card.append(ul);
    }
    list.append(card);
  });
}

function renderProjects(items) {
  const list = $("project-list");
  list.replaceChildren();
  const icons = ["⌘", "✳", "◇", "↗"];
  items.forEach((item, index) => {
    const card = make("article", "project-card");
    if (item.image?.startsWith("/uploads/")) {
      const image = document.createElement("img");
      image.src = item.image;
      image.alt = `${item.name || "Project"} preview`;
      card.append(image);
    } else card.append(make("span", "project-icon", icons[index % icons.length]));
    card.append(make("h3", "", item.name), make("p", "", item.description));
    if (item.features?.length) {
      const ul = document.createElement("ul");
      item.features.forEach((feature) => ul.append(make("li", "", feature)));
      card.append(ul);
    }
    const projectUrl = safeUrl(item.link);
    if (projectUrl) {
      const anchor = make("a", "project-link", "Explore project ↗");
      anchor.href = projectUrl;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      card.append(anchor);
    }
    list.append(card);
  });
}

function renderSkills(groups) {
  const list = $("skills-list");
  list.replaceChildren();
  Object.entries(groups).forEach(([category, skills]) => {
    const card = make("article", "skill-card");
    card.append(make("h3", "", category));
    const tags = make("div", "tag-list");
    (Array.isArray(skills) ? skills : []).forEach((skill) => tags.append(make("span", "skill-tag", skill)));
    card.append(tags);
    list.append(card);
  });
}

function renderEducation(items) {
  const list = $("education-list");
  list.replaceChildren();
  items.forEach((item) => {
    const card = make("article", "education-card");
    card.append(make("h4", "", item.institution));
    const meta = make("p", "education-meta");
    meta.append(make("span", "", item.degree || item.qualification || ""), make("span", "", item.duration || ""));
    card.append(meta);
    if (item.branch) card.append(make("p", "", item.branch));
    if (item.location) card.append(make("p", "", item.location));
    if (item.result) card.append(make("p", "", item.result));
    if (item.coursework?.length) card.append(make("p", "", `Coursework: ${item.coursework.join(" · ")}`));
    list.append(card);
  });
}

function renderCertifications(items) {
  const list = $("certification-list");
  list.replaceChildren();
  items.forEach((item) => {
    const card = make("article", "cert-card");
    card.append(make("span", "cert-mark", "✦"));
    const content = document.createElement("div");
    content.append(make("h4", "", item.name), make("p", "", item.certification));
    if (item.file?.startsWith("/uploads/")) {
      const anchor = make("a", "", "View certificate ↗");
      anchor.href = item.file;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      content.append(anchor);
    }
    card.append(content);
    list.append(card);
  });
}

$("menu-toggle").addEventListener("click", () => {
  const expanded = $("menu-toggle").getAttribute("aria-expanded") !== "true";
  $("menu-toggle").setAttribute("aria-expanded", String(expanded));
  $("navigation").classList.toggle("open", expanded);
});
$("navigation").addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    $("navigation").classList.remove("open");
    $("menu-toggle").setAttribute("aria-expanded", "false");
  }
});
loadPortfolio();
