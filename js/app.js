/**
 * AI Resume Analyzer — frontend controller.
 * Talks to the FastAPI backend at /api/* and renders the JSON
 * analysis result into the results section defined in app.html.
 */

const API_BASE = ""; // same-origin on Vercel; e.g. "http://localhost:8000" for local dev

const FALLBACK_ROLES = [
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "Data Analyst",
  "Data Scientist",
  "Machine Learning Engineer",
  "DevOps Engineer",
  "UI/UX Designer",
  "Product Manager",
  "QA / Test Engineer",
];

const roleSelect = document.getElementById("roleSelect");
const fileInput = document.getElementById("resumeFile");
const fileDrop = document.getElementById("fileDrop");
const fileLabel = document.getElementById("fileLabel");
const analyzeForm = document.getElementById("analyzeForm");
const analyzeBtn = document.getElementById("analyzeBtn");
const formError = document.getElementById("formError");
const loadingState = document.getElementById("loadingState");
const loadingText = document.getElementById("loadingText");
const resultsSection = document.getElementById("resultsSection");
const analyzeAnotherBtn = document.getElementById("analyzeAnotherBtn");

/* ---------------- Populate role dropdown ---------------- */

async function loadRoles() {
  let roles = FALLBACK_ROLES;
  try {
    const res = await fetch(`${API_BASE}/api/roles`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.roles) && data.roles.length) roles = data.roles;
    }
  } catch {
    /* backend not reachable yet — use fallback list */
  }
  roles.forEach((role) => {
    const opt = document.createElement("option");
    opt.value = role;
    opt.textContent = role;
    roleSelect.appendChild(opt);
  });
}
loadRoles();

/* ---------------- File input UX ---------------- */

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) {
    fileLabel.textContent = fileInput.files[0].name;
    fileDrop.classList.add("has-file");
  } else {
    fileLabel.textContent = "Choose file — PDF, DOCX or TXT";
    fileDrop.classList.remove("has-file");
  }
});

/* ---------------- Submit / analyze ---------------- */

const loadingMessages = [
  "Reading your resume…",
  "Matching skills to the target role…",
  "Scoring against ATS criteria…",
  "Building your learning roadmap…",
];

let loadingInterval;

function startLoadingCycle() {
  let i = 0;
  loadingText.textContent = loadingMessages[0];
  loadingInterval = setInterval(() => {
    i = (i + 1) % loadingMessages.length;
    loadingText.textContent = loadingMessages[i];
  }, 1600);
}
function stopLoadingCycle() {
  clearInterval(loadingInterval);
}

analyzeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.hidden = true;

  if (!fileInput.files.length) {
    showFormError("Please choose a resume file.");
    return;
  }
  if (!roleSelect.value) {
    showFormError("Please select a target role.");
    return;
  }

  const formData = new FormData();
  formData.append("file", fileInput.files[0]);
  formData.append("role", roleSelect.value);

  setBusy(true);
  resultsSection.hidden = true;
  loadingState.hidden = false;
  startLoadingCycle();

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const errBody = await safeJson(res);
      throw new Error(errBody?.detail || `Analysis failed (HTTP ${res.status})`);
    }

    const data = await res.json();
    renderResults(data);
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showFormError(err.message || "Something went wrong. Please try again.");
  } finally {
    stopLoadingCycle();
    loadingState.hidden = true;
    setBusy(false);
  }
});

analyzeAnotherBtn.addEventListener("click", () => {
  resultsSection.hidden = true;
  analyzeForm.reset();
  fileLabel.textContent = "Choose file — PDF, DOCX or TXT";
  fileDrop.classList.remove("has-file");
  analyzeForm.scrollIntoView({ behavior: "smooth", block: "start" });
});

function setBusy(isBusy) {
  analyzeBtn.disabled = isBusy;
  analyzeBtn.querySelector(".btn-text").textContent = isBusy ? "Analyzing…" : "Analyze Resume";
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/* ---------------- Render results ---------------- */

function renderResults(data) {
  renderScore(data.ats_score, data.employability_label);
  renderList("strengthsList", data.strengths);
  renderList("weaknessesList", data.weaknesses);
  renderList("improvementsList", data.improvements);
  renderProjectRoadmap(data.project_roadmap);
  renderResources(data.learning_roadmap.resources);
  renderSchedule(data.learning_roadmap.weekly_schedule);
  renderTimeline(data.learning_roadmap.career_timeline);
}

function renderScore(score, label) {
  const fill = document.getElementById("scoreBarFill");
  const scoreLabel = document.getElementById("scoreLabel");
  const badge = document.getElementById("employabilityBadge");

  requestAnimationFrame(() => {
    fill.style.width = `${Math.max(0, Math.min(100, score))}%`;
  });
  scoreLabel.textContent = `${score}/100`;
  badge.textContent = label;

  badge.classList.remove("moderate", "low");
  if (/low/i.test(label)) badge.classList.add("low");
  else if (/moderate/i.test(label)) badge.classList.add("moderate");
}

function renderList(elementId, items) {
  const el = document.getElementById(elementId);
  el.innerHTML = "";
  (items || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    el.appendChild(li);
  });
}

function renderProjectRoadmap(projects) {
  const grid = document.getElementById("projectRoadmap");
  grid.innerHTML = "";
  (projects || []).forEach((p) => {
    grid.appendChild(
      buildMiniCard(p.title, `<p>${escapeHtml(p.description)}</p>`)
    );
  });
}

function renderResources(resources) {
  const grid = document.getElementById("resourceGrid");
  grid.innerHTML = "";
  const groups = [
    ["Learning Platforms", resources.learning_platforms],
    ["Practice Platforms", resources.practice_platforms],
    ["Documentation", resources.documentation],
    ["Professional Channels", resources.professional_channels],
  ];
  groups.forEach(([title, items]) => {
    grid.appendChild(buildMiniCard(title, listHtml(items)));
  });
}

function renderSchedule(schedule) {
  const grid = document.getElementById("scheduleGrid");
  grid.innerHTML = "";
  const groups = [
    ["Weekdays (Mon–Fri)", schedule.weekdays],
    ["Saturday", schedule.saturday],
    ["Sunday", schedule.sunday],
  ];
  groups.forEach(([title, items]) => {
    grid.appendChild(buildMiniCard(title, listHtml(items)));
  });
}

function renderTimeline(timeline) {
  const grid = document.getElementById("timelineGrid");
  grid.innerHTML = "";
  [timeline.phase_1, timeline.phase_2, timeline.phase_3].forEach((phase) => {
    grid.appendChild(buildMiniCard(phase.title, `<p>${escapeHtml(phase.description)}</p>`));
  });
}

function buildMiniCard(title, innerHtml) {
  const card = document.createElement("div");
  card.className = "mini-card";
  card.innerHTML = `<h4>${escapeHtml(title)}</h4>${innerHtml}`;
  return card;
}

function listHtml(items) {
  return `<ul>${(items || []).map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
