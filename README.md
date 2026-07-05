# AI Resume Analyzer

An AI-powered web application that analyzes a resume against a specific target job role — similar to how a real Applicant Tracking System (ATS) and recruiter would — and generates a personalized 90-day learning and career roadmap. Built as a full-stack project with a static frontend, a Python API backend, and an LLM-powered analysis engine, deployed entirely on Vercel.

**Live demo:** _add your Vercel URL here_
**Stack:** HTML / CSS / vanilla JavaScript (frontend) · FastAPI (backend) · Google Gemini API (AI analysis) · Vercel (hosting)

---

## 1. Problem this project solves

Job seekers often have no idea how their resume actually performs when it passes through an ATS or a recruiter's first scan, and even less idea of what concrete, specific steps would improve their chances for a particular role. Generic resume advice ("add more keywords") isn't actionable. This project closes that gap: upload a resume, pick the exact role you're targeting, and get a structured, specific report — a score, a skill gap breakdown, and a day-by-day 90-day plan — all generated in one request.

## 2. What the user experiences (the 4 stages)

| Stage | Screen | What happens |
|---|---|---|
| 1. Sign in | `index.html` | Email/password form or "Sign in with Google" button, styled as a split-screen layout with an animated resume-scanning visual on the right. |
| 2. Upload & configure | `app.html` (top) | Three feature cards explain the tool's capabilities (Skill Analysis / Learning Roadmap / Project Ideas). Below that: a file picker (PDF/DOCX/TXT), a role dropdown, and an "Analyze Resume" button. |
| 3. ATS report | `app.html` (results, part 1) | An animated ATS score bar (0–100), an employability badge (e.g. "High Employability"), and three side-by-side cards: Strengths, Weaknesses, Improvements. |
| 4. Roadmap | `app.html` (results, part 2) | Three concrete project ideas to close skill gaps, followed by a full "Official Learning & Career Roadmap": curated learning platforms, practice platforms, documentation, professional channels, a weekly study schedule (weekdays/Saturday/Sunday), and a 3-phase 90-day execution timeline. |

Everything after "Analyze Resume" renders on the same page — no reload, no separate results page. The JSON returned by the backend is used directly to build the DOM.

## 3. System architecture
### Why this architecture?

- **Static frontend + one serverless function**: the whole project runs on Vercel's free tier, with no separate server process to provision, patch, or scale. Vercel auto-detects `api/index.py` as a Python ASGI function and serves everything else (`index.html`, `app.html`, `css/`, `js/`) as static files.
- **Structured JSON output from the LLM, not free text**: instead of parsing a paragraph of AI-generated prose, the model is instructed to return a specific JSON shape. This turns the AI's output into a predictable API contract, exactly like a normal backend endpoint — the frontend never has to guess how to parse anything.
- **Pydantic validation as a safety net**: even though the AI is asked for strict JSON, LLMs occasionally deviate. Pydantic models catch any structural mismatch before it reaches the user, converting a potential broken-UI bug into a clean, understandable `502` error instead.
- **Server-side file parsing**: text extraction happens entirely inside the backend, so the raw resume file and the AI API key never need to be exposed to, or processed by, the browser.

## 4. Tech stack, and why each piece was chosen

| Layer | Technology | Reasoning |
|---|---|---|
| Frontend | HTML5, hand-written CSS (custom design system, no framework), vanilla JavaScript | Zero build step, loads fast, trivial to deploy as static files, and easy to explain line-by-line in an interview since there's no framework "magic" hiding behavior. |
| Backend | FastAPI (Python) | Async request handling, automatic request/response validation via Pydantic, and it runs cleanly as an ASGI serverless function on Vercel. |
| Resume parsing | `pdfplumber` (PDF), `python-docx` (DOCX) | Both are reliable, widely used libraries for extracting plain text from real-world resume files without needing a heavier OCR pipeline for standard, text-based documents. |
| AI analysis | Google Gemini API (`gemini-1.5-flash`, JSON mode) | Free tier with no billing requirement, which keeps a portfolio project runnable at zero cost, while still reliably returning structured JSON via `response_mime_type="application/json"`. |
| Hosting | Vercel | One `git push` deploys both the static frontend and the Python function together; free tier is sufficient for a demo/portfolio project. |

## 5. Project structure
## 6. Backend API reference

### `GET /api/health`
Liveness check. Returns `{ "status": "ok", "service": "ai-resume-analyzer-api" }`.

### `GET /api/roles`
Returns the list of supported target roles used to populate the dropdown (e.g. Frontend Developer, Backend Developer, Full Stack Developer, Data Analyst, Data Scientist, Machine Learning Engineer, DevOps Engineer, UI/UX Designer, Product Manager, QA/Test Engineer).

### `POST /api/analyze`
Accepts `multipart/form-data`:
- `file` — the resume file (`.pdf`, `.docx`, or `.txt`; max 5MB)
- `role` — one of the roles returned by `/api/roles`

Returns a JSON object shaped like:

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

Errors follow FastAPI's standard `{ "detail": "message" }` shape:
- `400` — invalid role, unsupported file type, or file too large
- `422` — the file couldn't be read as text (e.g. a scanned/image-only PDF)
- `502` — the AI call itself failed, or the AI's response didn't match the expected schema
- `500` — server misconfiguration (e.g. missing API key in environment variables)

## 7. How the AI analysis actually works

`api/index.py` constructs a single request made up of two parts:

- **A system prompt** that instructs the model to act as an ATS auditor and technical career coach, to return strict JSON only (no prose, no markdown fences, no commentary), and to stay grounded in the actual resume content — explicitly told never to invent companies, dates, or employers that aren't present in the text.
- **A user prompt** containing the extracted resume text (truncated to roughly 12,000 characters to stay within context limits), the target role, and an explicit JSON schema the model must populate exactly.

The request sets `response_mime_type="application/json"` (Gemini's JSON mode), which constrains the model to emit valid JSON rather than freeform text. The raw response is parsed with `json.loads`, with a defensive fallback that strips stray markdown code fences if the model ever wraps its output in them. The parsed dictionary is then validated against a tree of Pydantic models (`AnalysisResult`, `PlatformGroup`, `WeeklySchedule`, `CareerTimeline`, etc.) before being returned to the frontend — this is the single point where "AI output" becomes "trustworthy API response."

**Why Gemini instead of OpenAI:** Google's Gemini API has a genuinely free tier (via Google AI Studio) with no billing setup required, which keeps the whole project runnable at zero cost. The AI provider is isolated entirely inside the `call_llm()` function, so switching to OpenAI, Anthropic, or any other JSON-mode-capable LLM later only requires changing that one function.

## 8. Authentication — read this before your interview

The sign-in screen is intentionally a **client-side demo gate**, not real authentication. `js/auth.js` accepts any email address plus a password of 4 or more characters (or the "Sign in with Google" button, which is also just a demo trigger), and stores a session object in the browser's `localStorage`. `app.html` checks for that session on load and redirects back to the sign-in page if it's missing.

This was a deliberate scope decision: the project's complexity and interest is in the AI analysis pipeline, not in building an identity system. Be upfront about this in an interview rather than letting it be discovered — it reads as more senior, not less, to say so directly:

> "Auth is currently a client-side demo layer so the full user flow is complete end-to-end. The natural next step for production would be swapping it for a real provider — Firebase Auth, Auth0, or Supabase Auth — or a `/api/login` endpoint backed by a database. Because the rest of the app only depends on a single `isLoggedIn()` check, that swap is a contained, well-isolated change."

## 9. Local development

**Backend:**
```bash
cd ai-resume-analyzer
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # then fill in GEMINI_API_KEY
uvicorn api.index:app --reload --port 8000
```

**Frontend:** serve it with a local server (not `file://`, so `fetch` calls work correctly):
```bash
npx serve .
# or: python -m http.server 5500
```

When running frontend and backend on separate local ports, set the `API_BASE` constant at the top of `js/app.js` to `http://localhost:8000`. On Vercel, `API_BASE` stays empty since both frontend and backend share the same domain.

## 10. Deploying to Vercel

1. Push the project to a GitHub repository.
2. In Vercel: **Add New → Project → Import** the repository.
3. Framework preset: **Other** (there is no build step — it's static files plus one Python function).
4. Add an environment variable in the project's settings: `GEMINI_API_KEY` = a free key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Optionally add `GEMINI_MODEL` (defaults to `gemini-1.5-flash` if omitted).
5. Deploy. Vercel serves `index.html`, `app.html`, `css/`, `js/` as static assets, and builds `api/index.py` into a Python serverless function reachable at `/api/*` (using `requirements.txt` for dependencies and `vercel.json` for routing).
6. Visit the deployed URL — `index.html` is the entry point.

Any time an environment variable is added or changed, a **redeploy** is required for it to take effect — saving the variable alone does not update a live deployment.

## 11. Design decisions worth mentioning in an interview

- **Structured output over free text** — asking the LLM to fill a fixed JSON schema, rather than parsing paragraphs of generated prose, turns the AI's output into a deterministic contract the frontend can always rely on.
- **Server-side file parsing** — resumes are parsed with `pdfplumber` / `python-docx` entirely on the backend, so the API key and the (potentially large) raw file never touch client-exposed code beyond the initial upload.
- **Validation as a safety net** — Pydantic models catch any malformed AI output before it reaches the user, converting an unpredictable LLM failure mode into a clean, explicit HTTP error.
- **Serverless-first hosting** — the entire app (static frontend plus one Python function) deploys as a single Vercel project, with nothing to patch or scale manually.
- **Provider-agnostic AI integration** — the LLM call is isolated in a single function (`call_llm`), which is exactly what made it possible to switch this project from OpenAI to Gemini without touching the rest of the codebase.

## 12. Known limitations & natural next steps

- Scanned or image-only PDFs aren't supported yet, since there's no OCR step — adding `pytesseract` would extend support to those.
- Authentication is a client-side demo (see §8) — a production version would need a real auth provider and a database to persist analysis history per user.
- Only one resume is analyzed per request; a "compare resume versions over time" feature would be a natural v2.
- There's currently no rate limiting on `/api/analyze` — worth adding before making the tool fully public, since the AI provider's free tier has request limits per minute/day.

## 13. Interview cheat sheet — explaining this project end-to-end

**"Walk me through this project."**

1. **The problem:** job seekers don't know how their resume performs against ATS systems, or what specific, actionable steps would improve it for a role they're targeting.
2. **The solution:** upload a resume, pick a target role, and get back an ATS-style score, a skill-gap breakdown, and a concrete 90-day roadmap — generated by prompting an LLM to return structured JSON rather than free text.
3. **The flow:** static HTML/CSS/JS frontend → a `FormData` POST to a FastAPI serverless function → server-side text extraction → prompt construction → a Gemini API call in JSON mode → Pydantic validation of the response → JSON sent back to the browser → rendered into score bars, bullet lists, and card grids with vanilla JavaScript.
4. **Why these technologies:** FastAPI for fast, typed request handling; Pydantic to enforce a strict contract on both the request and the AI's response; Vercel for zero-ops deployment of the static site and the Python function together; vanilla JS on the frontend to keep the project dependency-free and easy to reason about end-to-end; Gemini for a free, JSON-mode-capable LLM that keeps the whole thing runnable at no cost.
5. **What's next:** real authentication and a database for analysis history, OCR support for scanned resumes, and rate limiting on the AI endpoint before any public launch.

**Anticipated follow-up questions and how to answer them:**

- *"What happens if the AI returns bad data?"* → Pydantic validation catches it and the API returns a clean `502` instead of passing broken data to the frontend.
- *"Why not use a database?"* → the project's scope was the AI analysis pipeline itself; persistence (saving analysis history per user) is a listed next step, not an oversight.
- *"How would you scale this?"* → add rate limiting per user/IP on `/api/analyze`, cache repeated (resume, role) pairs, and move to a queued/async job model if analysis latency became a bottleneck under load.
- *"Why Gemini and not OpenAI?"* → free tier with no billing requirement; the integration is isolated in one function, so the provider is swappable.

That's the whole project — every layer of it is explainable, and every simplification (auth, single-resume analysis, no rate limiting) was a deliberate, defensible scope decision rather than something overlooked.
