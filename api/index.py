"""
AI Resume Analyzer - Backend API
=================================
FastAPI application that:
  1. Accepts a resume file (PDF or DOCX) + a target job role
  2. Extracts raw text from the resume
  3. Sends the text to an LLM (Google Gemini) with a structured prompt
  4. Returns a structured JSON payload the frontend renders as:
       - ATS Score
       - Strengths / Weaknesses / Improvements
       - Professional Project Roadmap
       - Official Learning & Career Roadmap

Deployed on Vercel as a single serverless function (ASGI app).
"""

import io
import json
import os
import re
from typing import List, Optional

import pdfplumber
from docx import Document
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="AI Resume Analyzer API",
    description="Analyzes resumes against a target job role using an LLM and returns an ATS-style report.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_ROLES = [
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
]

MAX_FILE_SIZE_MB = 5


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------

class ProjectIdea(BaseModel):
    title: str
    description: str


class PlatformGroup(BaseModel):
    learning_platforms: List[str]
    practice_platforms: List[str]
    documentation: List[str]
    professional_channels: List[str]


class WeeklySchedule(BaseModel):
    weekdays: List[str]
    saturday: List[str]
    sunday: List[str]


class CareerPhase(BaseModel):
    title: str
    description: str


class CareerTimeline(BaseModel):
    phase_1: CareerPhase
    phase_2: CareerPhase
    phase_3: CareerPhase


class LearningRoadmap(BaseModel):
    resources: PlatformGroup
    weekly_schedule: WeeklySchedule
    career_timeline: CareerTimeline


class AnalysisResult(BaseModel):
    ats_score: int = Field(ge=0, le=100)
    employability_label: str
    skill_analysis: dict
    strengths: List[str]
    weaknesses: List[str]
    improvements: List[str]
    project_roadmap: List[ProjectIdea]
    learning_roadmap: LearningRoadmap
    candidate_name: Optional[str] = None
    target_role: str


# ---------------------------------------------------------------------------
# Resume text extraction
# ---------------------------------------------------------------------------

def extract_text_from_pdf(file_bytes: bytes) -> str:
    text_chunks = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            text_chunks.append(page_text)
    return "\n".join(text_chunks).strip()


def extract_text_from_docx(file_bytes: bytes) -> str:
    document = Document(io.BytesIO(file_bytes))
    return "\n".join(p.text for p in document.paragraphs).strip()


def extract_resume_text(filename: str, file_bytes: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        text = extract_text_from_pdf(file_bytes)
    elif lower.endswith(".docx"):
        text = extract_text_from_docx(file_bytes)
    elif lower.endswith(".txt"):
        text = file_bytes.decode("utf-8", errors="ignore")
    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload a PDF, DOCX, or TXT resume.",
        )

    if not text or len(text.strip()) < 40:
        raise HTTPException(
            status_code=422,
            detail="Could not extract readable text from this file. "
            "If it's a scanned/image-based PDF, please upload a text-based resume.",
        )
    return text


# ---------------------------------------------------------------------------
# LLM analysis (Google Gemini — free tier, no billing required)
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are an expert Applicant Tracking System (ATS) auditor and technical career coach.
You analyze resumes against a specific target job role and return STRICT JSON only, matching the
exact schema you are given. No prose, no markdown fences, no commentary outside the JSON object.
Be honest and specific: base every point on the actual resume content and the target role,
never invent companies, dates, or employers that are not in the resume."""


def build_user_prompt(resume_text: str, role: str) -> str:
    return f"""
TARGET ROLE: {role}

RESUME TEXT:
\"\"\"
{resume_text[:12000]}
\"\"\"

Analyze this resume for the target role above and return a single JSON object with EXACTLY
this shape (fill every field, arrays should have 3-5 concise items each unless noted):

{{
  "candidate_name": "string or null if not found",
  "ats_score": <integer 0-100, how well this resume would score in an ATS + recruiter screen for the target role>,
  "employability_label": "one of: Low Employability | Moderate Employability | High Employability | Excellent Employability",
  "skill_analysis": {{
    "technical_skills_found": ["skills already on the resume relevant to the role"],
    "soft_skills_found": ["soft skills evidenced by the resume"],
    "missing_skills_for_role": ["important skills for the target role NOT found on the resume"]
  }},
  "strengths": ["3-5 concrete strengths, grounded in resume content"],
  "weaknesses": ["3-5 concrete gaps or weaknesses relative to the target role"],
  "improvements": ["3-5 specific, actionable improvements the candidate should make"],
  "project_roadmap": [
    {{"title": "Project name", "description": "One-sentence description of what to build and what it demonstrates"}},
    {{"title": "Project name", "description": "..."}},
    {{"title": "Project name", "description": "..."}}
  ],
  "learning_roadmap": {{
    "resources": {{
      "learning_platforms": ["4 real, well-known learning platforms suited to the role"],
      "practice_platforms": ["4 real coding/practice platforms suited to the role"],
      "documentation": ["4 real official docs/reference sites suited to the role"],
      "professional_channels": ["4 real YouTube channels / communities suited to the role"]
    }},
    "weekly_schedule": {{
      "weekdays": ["3 short daily study blocks, Mon-Fri"],
      "saturday": ["3 short Saturday activities"],
      "sunday": ["3 short Sunday activities"]
    }},
    "career_timeline": {{
      "phase_1": {{"title": "Phase 1 (0-30 Days)", "description": "one sentence"}},
      "phase_2": {{"title": "Phase 2 (30-60 Days)", "description": "one sentence"}},
      "phase_3": {{"title": "Phase 3 (60-90 Days)", "description": "one sentence"}}
    }}
  }}
}}

Return ONLY the JSON object, nothing else.
"""


def parse_json_safely(raw: str) -> dict:
    """Parse the model's JSON output, tolerating common minor formatting
    slips (trailing commas, stray markdown fences)."""
    candidates = [raw]

    # Strip stray markdown code fences if present.
    cleaned = re.sub(r"^```(json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    candidates.append(cleaned)

    # Remove trailing commas before a closing ] or } — a common minor
    # JSON mistake models make (valid in JS, invalid in strict JSON).
    no_trailing_commas = re.sub(r",(\s*[}\]])", r"\1", cleaned)
    candidates.append(no_trailing_commas)

    last_error: Optional[Exception] = None
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as exc:
            last_error = exc
            continue

    raise HTTPException(
        status_code=502,
        detail=f"AI analysis failed: the model's response could not be parsed as valid JSON ({last_error}). Please try analyzing again.",
    )


def call_llm(resume_text: str, role: str) -> dict:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="Server misconfiguration: GEMINI_API_KEY is not set in the environment.",
        )

    import google.generativeai as genai

    genai.configure(api_key=api_key)
    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

    model = genai.GenerativeModel(
        model_name=model_name,
        system_instruction=SYSTEM_PROMPT,
    )

    response = model.generate_content(
        build_user_prompt(resume_text, role),
        generation_config=genai.types.GenerationConfig(
            temperature=0.4,
            response_mime_type="application/json",
            max_output_tokens=8192,
        ),
    )

    raw = response.text
    return parse_json_safely(raw)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "ai-resume-analyzer-api"}


@app.get("/api/roles")
def get_roles():
    return {"roles": ALLOWED_ROLES}


@app.post("/api/analyze", response_model=AnalysisResult)
async def analyze_resume(
    file: UploadFile = File(...),
    role: str = Form(...),
):
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {', '.join(ALLOWED_ROLES)}")

    file_bytes = await file.read()
    size_mb = len(file_bytes) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(status_code=400, detail=f"File too large. Max size is {MAX_FILE_SIZE_MB}MB.")

    resume_text = extract_resume_text(file.filename, file_bytes)

    try:
        result = call_llm(resume_text, role)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {exc}") from exc

    result["target_role"] = role

    try:
        validated = AnalysisResult(**result)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"AI returned an unexpected format: {exc}",
        ) from exc

    return validated


# Local dev entrypoint: `uvicorn api.index:app --reload`
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
