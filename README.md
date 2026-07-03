# AI Resume Analyzer

An AI-powered resume analyzer that scores a resume against a target job role,
like an ATS (Applicant Tracking System) would, and generates a personalized
90-day learning and career roadmap.

**Live demo:** _add your Vercel URL here after deploying_
**Stack:** HTML / CSS / vanilla JS (frontend) · FastAPI (backend) · OpenAI API (AI analysis) · Vercel (hosting)

---

## 1. What this project does

A user signs in, uploads their resume (PDF, DOCX or TXT), and picks a target
job role (e.g. "Frontend Developer"). The backend extracts the resume text,
sends it to an LLM with a carefully structured prompt, and gets back a JSON
report that the frontend renders as:

1. **ATS Score** — a 0–100 score with an employability label (e.g. "High
   Employability"), shown as an animated progress bar.
2. **Strengths / Weaknesses / Improvements** — three focused lists grounded
   in the actual resume content, specific to the chosen role.
3. **Professional Project Roadmap** — 3 concrete project ideas the candidate
   could build to close their skill gaps and strengthen the resume.
4. **Official Learning & Career Roadmap** — curated learning platforms,
   practice platforms, documentation, and channels; a weekly study schedule
   (weekdays / Saturday / Sunday); and a 3-phase, 90-day career execution
   timeline.

## 2. Screens / user flow

| Step | Screen | What happens |
|---|---|---|
| 1 | **Sign in** (`index.html`) | Email/password or "Sign in with Google" button. Split layout: form on the left, an animated "resume scan" visual on the right. |
| 2 | **Upload & configure** (`app.html`, top) | Three feature cards explain what the tool does (Skill Analysis / Learning Roadmap / Project Ideas), then a file picker + role dropdown + "Analyze Resume" button. |
| 3 | **ATS report** (`app.html`, results) | ATS score bar, employability badge, and Strengths / Weaknesses / Improvements cards. |
| 4 | **Roadmap** (`app.html`, results) | Project roadmap cards, then the full learning & career roadmap (resources, weekly schedule, 3-phase timeline). |

All four results sections render on a single page after clicking **Analyze
Resume** — there's no page reload, the JSON response is rendered directly
into the DOM.

## 3. Architecture

```
Browser (index.html / app.html)
   │  fetch("/api/analyze", { file, role })
   ▼
FastAPI serverless function (api/index.py) — runs on Vercel
   │  1. Validate file type/size and role
   │  2. Extract text  → pdfplumber (PDF) / python-docx (DOCX)
   │  3. Build a structured prompt with the resume text + role
   │  4. Call OpenAI Chat Completions API (JSON mode)
   │  5. Parse + validate the JSON with Pydantic
   ▼
JSON response → rendered by js/app.js into the results section
```

**Why this shape?**
- **Static frontend + one serverless function** keeps the whole app on
  Vercel's free tier with no separate server to manage.
- **JSON-mode LLM output + Pydantic validation** means the frontend can
  always assume a fixed schema instead of parsing free-form text — this is
  the same "structured extraction" pattern used in production AI features.
- **Text extraction happens server-side** so the OpenAI API key is never
  exposed to the browser.

## 4. Tech stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | HTML5, CSS3 (custom, no framework), vanilla JavaScript | Fast to load, zero build step, easy to deploy as static files on Vercel. |
| Backend | FastAPI (Python) | Async, automatic request validation via Pydantic, easy to run as an ASGI serverless function. |
| Resume parsing | `pdfplumber`, `python-docx` | Reliable text extraction from PDF and DOCX resumes. |
| AI analysis | OpenAI Chat Completions API (`gpt-4o-mini`, JSON mode) | Cost-efficient model that reliably returns structured JSON when given `response_format={"type": "json_object"}`. |
| Hosting | Vercel | Static hosting for the frontend + Python serverless function for `/api/*`, one `git push` to deploy. |

## 5. Project structure

```
ai-resume-analyzer/
├── api/
│   └── index.py          # FastAPI app — all backend logic lives here
├── css/
│   └── style.css         # Design tokens + all page styling
├── js/
│   ├── auth.js           # Client-side demo auth (see §7)
│   └── app.js            # Upload flow, API calls, result rendering
├── index.html             # Sign-in page
├── app.html                # Upload + results page
├── requirements.txt       # Python dependencies for the serverless function
├── vercel.json            # Vercel routing / function config
├── .env.example           # Environment variable template
└── README.md
```

## 6. Backend API

### `GET /api/health`
Simple liveness check → `{ "status": "ok" }`

### `GET /api/roles`
Returns the list of supported target roles for the dropdown.

### `POST /api/analyze`
`multipart/form-data` with:
- `file` — the resume (`.pdf`, `.docx`, or `.txt`, max 5MB)
- `role` — one of the roles returned by `/api/roles`

Returns:

```jsonc
{
  "candidate_name": "Jane Doe",
  "ats_score": 87,
  "employability_label": "High Employability",
  "skill_analysis": {
    "technical_skills_found": ["Python", "React", "..."],
    "soft_skills_found": ["Communication", "..."],
    "missing_skills_for_role": ["System design", "..."]
  },
  "strengths": ["...", "...", "..."],
  "weaknesses": ["...", "...", "..."],
  "improvements": ["...", "...", "..."],
  "project_roadmap": [
    { "title": "AI Resume Platform", "description": "..." }
  ],
  "learning_roadmap": {
    "resources": {
      "learning_platforms": ["..."],
      "practice_platforms": ["..."],
      "documentation": ["..."],
      "professional_channels": ["..."]
    },
    "weekly_schedule": {
      "weekdays": ["..."], "saturday": ["..."], "sunday": ["..."]
    },
    "career_timeline": {
      "phase_1": { "title": "Phase 1 (0-30 Days)", "description": "..." },
      "phase_2": { "title": "Phase 2 (30-60 Days)", "description": "..." },
      "phase_3": { "title": "Phase 3 (60-90 Days)", "description": "..." }
    }
  },
  "target_role": "Full Stack Developer"
}
```

Error responses use FastAPI's standard `{ "detail": "message" }` shape with
an appropriate HTTP status (`400` bad input, `422` unreadable resume, `502`
if the AI call fails or returns malformed JSON).

## 7. Authentication (read this before your interview)

The sign-in screen is a **client-side demo gate**, built with
`localStorage`, on purpose — this project's core focus and complexity is
the AI analysis pipeline, not identity management. `js/auth.js` accepts any
email + a 4+ character password (or the "Sign in with Google" button) and
stores a session object in `localStorage`; `app.html` redirects back to the
login page if that session is missing.

Be upfront about this in an interview: *"Auth is currently a client-side
demo layer so the flow is complete end-to-end; the natural next step is
swapping it for a real provider like Firebase Auth, Auth0, or Supabase Auth,
or a `/api/login` endpoint backed by a database — the rest of the app
only depends on `isLoggedIn()`, so that's a contained change."* That's an
honest, senior-sounding answer and shows you understand the tradeoff you made.

## 8. Local development

**Backend:**
```bash
cd ai-resume-analyzer
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # then fill in OPENAI_API_KEY
uvicorn api.index:app --reload --port 8000
```

**Frontend:** open `index.html` with a local server (not `file://`, so
`fetch` works), e.g.:
```bash
npx serve .
# or: python -m http.server 5500
```
Since the frontend calls relative paths like `/api/analyze`, when running
frontend and backend separately in local dev, set `API_BASE` at the top of
`js/app.js` to `http://localhost:8000`.

## 9. Deploying to Vercel

1. Push this project to a GitHub repository.
2. In Vercel: **New Project → Import** your repo.
3. Framework preset: **Other** (no build step needed).
4. Add an environment variable: `OPENAI_API_KEY` = your OpenAI key
   (Project Settings → Environment Variables). Optionally set
   `OPENAI_MODEL` (defaults to `gpt-4o-mini`).
5. Deploy. Vercel will:
   - Serve `index.html`, `app.html`, `css/`, `js/` as static files.
   - Build `api/index.py` as a Python serverless function (via
     `requirements.txt` + `vercel.json`), reachable at `/api/*`.
6. Visit the deployed URL — `index.html` is the entry point.

**CLI alternative:**
```bash
npm i -g vercel
vercel login
vercel        # first deploy (follow prompts)
vercel --prod # promote to production
```

## 10. How the AI analysis actually works

`api/index.py` builds a single prompt containing:
- A **system prompt** instructing the model to act as an ATS auditor +
  career coach and return *strict JSON only*, grounded in the resume (no
  invented employers/dates).
- A **user prompt** with the extracted resume text (truncated to ~12k
  characters to stay within context limits) and the target role, plus an
  explicit JSON schema the model must fill in.

The request uses `response_format={"type": "json_object"}` (OpenAI's JSON
mode), which constrains the model's output to valid JSON. The response is
then parsed and validated against Pydantic models (`AnalysisResult` and its
nested models) — if the AI ever returns something that doesn't match the
schema, the API fails loudly with a `502` instead of silently sending broken
data to the frontend.

## 11. Design decisions worth mentioning in an interview

- **Structured output over free text:** asking the LLM to fill a JSON
  schema (rather than parsing a paragraph of prose) makes the AI's output a
  reliable API contract the frontend can render deterministically.
- **Server-side file parsing:** resumes are parsed with `pdfplumber` /
  `python-docx` on the backend, so the API key and the (potentially large)
  raw file never need to touch client-exposed code beyond the initial
  upload.
- **Validation as a safety net:** Pydantic models catch malformed AI output
  before it reaches the user — a small but important reliability pattern
  for any product built on top of an LLM.
- **Serverless-first hosting:** the whole app (static frontend + one Python
  function) deploys as a single Vercel project with no server to patch or
  scale manually.

## 12. Known limitations & possible extensions

- Scanned/image-only PDFs aren't supported yet (no OCR) — a natural
  extension is adding `pytesseract` for scanned resumes.
- Auth is a client-side demo (see §7) — swap in a real provider + database
  for production use, and persist analysis history per user.
- Only one resume is analyzed per request; a "compare versions" or
  "resume history" feature would be a good v2.
- Add rate limiting / a usage cap on `/api/analyze` before making this
  fully public, since each call spends OpenAI API credits.

## 13. Explaining this project end-to-end (interview cheat sheet)

If asked "walk me through this project":

1. **Problem:** Job seekers don't know how their resume performs against
   ATS systems or what to do next for a specific role.
2. **Solution:** Upload a resume + pick a role → get an ATS-style score,
   a skill gap analysis, and an actionable 90-day roadmap, powered by an
   LLM prompted to return structured JSON.
3. **Flow:** Static HTML/CSS/JS frontend → `FormData` POST to a FastAPI
   serverless function → text extraction → prompt construction → OpenAI
   JSON-mode call → Pydantic validation → JSON back to the browser →
   rendered into cards/lists/grids with vanilla JS.
4. **Why these technologies:** FastAPI for fast, typed request handling;
   Pydantic for a strict I/O contract on both the request and the AI's
   response; Vercel for zero-ops deployment of both the static site and the
   Python function; vanilla JS on the frontend to keep the project
   dependency-free and easy to reason about end-to-end.
5. **What you'd improve next:** real authentication + a database to store
   analysis history, OCR for scanned resumes, and rate limiting on the
   AI endpoint.

That's the whole story — you built and can explain every layer.
