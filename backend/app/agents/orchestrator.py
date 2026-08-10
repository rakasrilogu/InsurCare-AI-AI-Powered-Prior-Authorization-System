"""
InsurCare AI — 6-Agent Pipeline with Explainable AI

Model split:
  Flash → Intake, Communication           (structured, fast)
  Pro   → Eligibility, Policy, Risk, Decision  (reasoning, accuracy)

Every decision produces:
  - approved_amount_inr
  - coverage_percentage
  - approval_reasons / denial_reasons (plain English)
  - policy_clauses_cited
  - next_steps
  - appeal_pathway
  - doctor_recommendation
  - plain_english_summary
"""

import time, json, re, os
from datetime import datetime, timezone
from sqlalchemy.orm import Session
import httpx

from ..models.pa_request import PARequest
from ..models.agent_run import AgentRun

HAIKU  = "gemini-2.5-flash"
SONNET = "gemini-2.5-flash"
API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

from .policy_rag import retrieve_policy_clauses, build_grounded_context, extract_financial_facts


# ── Gemini API call with retry ─────────────────────────────────────────────────
def _call_claude(model: str, system: str, user_msg: str, max_tokens: int = 1500,
                 db: Session = None, request_id: int = None, agent_id: str = None) -> str:
    from ..config import settings
    key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")
    if db and request_id and agent_id:
        _log_progress(db, request_id, agent_id, f"Calling Gemini API ({model})...")

    url = f"{API_BASE}/{model}:generateContent"

    for attempt in range(3):
        try:
            if db and request_id and agent_id and attempt > 0:
                _log_progress(db, request_id, agent_id, f"Retry attempt {attempt+1}...")
            with httpx.Client(timeout=120) as c:
                r = c.post(url, params={"key": key}, json={
                    "system_instruction": {"parts": [{"text": system}]},
                    "contents": [{"role": "user", "parts": [{"text": user_msg}]}],
                    "generationConfig": {"maxOutputTokens": max_tokens},
                }, headers={
                    "content-type": "application/json",
                })
                r.raise_for_status()
                data = r.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]
        except Exception as e:
            last_error = e
            if attempt < 2:
                time.sleep((2 ** attempt) + 2)
            continue
    raise RuntimeError(f"Gemini API failed after 3 retries: {last_error}")



def _parse_json(text: str) -> dict:
    """Robustly extract JSON — strips fences, finds outermost { }."""
    t = text.strip()
    t = re.sub(r'^```(?:json)?\s*', '', t)
    t = re.sub(r'\s*```$', '', t)
    t = t.strip()
    start, end = t.find('{'), t.rfind('}')
    if start != -1 and end != -1:
        t = t[start:end+1]
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        # Try to repair truncated JSON — close any open braces
        open_b = t.count('{')
        close_b = t.count('}')
        if open_b > close_b:
            t += '}' * (open_b - close_b)
        # Trim trailing garbage after last valid JSON value
        for trim in range(len(t), 0, -1):
            try:
                return json.loads(t[:trim])
            except json.JSONDecodeError:
                continue
        raise


# ── DB helpers ─────────────────────────────────────────────────────────────────
_LOG_CACHE: dict = {}  # {(request_id, agent_id): [log_entries]}

def _log_progress(db: Session, request_id: int, agent_id: str, message: str):
    """Append a timestamped log entry — uses in-memory cache + DB backup."""
    entry = {"t": datetime.now(timezone.utc).isoformat(), "msg": message}
    key = (request_id, agent_id)
    if key not in _LOG_CACHE:
        _LOG_CACHE[key] = []
    _LOG_CACHE[key].append(entry)

    # Also try DB backup (silent if fails)
    try:
        run = db.query(AgentRun).filter_by(
            request_id=request_id, agent_id=agent_id, status="active"
        ).first()
        if run:
            details = dict(run.details or {})
            logs = details.get("logs", [])
            logs.append(entry)
            details["logs"] = logs
            run.details = details
            db.commit()
    except Exception:
        pass

def _mark_active(db: Session, request_id: int, agent_id: str):
    run = AgentRun(request_id=request_id, agent_id=agent_id, status="active", details={"logs": [{"t": datetime.now(timezone.utc).isoformat(), "msg": f"{agent_id} agent started"}]})
    db.add(run); db.commit()

def _save_run(db: Session, request_id: int, agent_id: str, status: str,
              output: str = "", details: dict = None,
              confidence: float = None, duration_ms: int = None):
    # Read logs from cache (most reliable) + DB backup
    key = (request_id, agent_id)
    active_logs = _LOG_CACHE.pop(key, [])

    # Also try to get logs from DB active run (backup)
    existing = db.query(AgentRun).filter_by(
        request_id=request_id, agent_id=agent_id, status="active"
    ).first()
    if existing:
        if not active_logs and existing.details and "logs" in existing.details:
            active_logs = existing.details["logs"]
        db.delete(existing)
        db.flush()

    # Preserve logs
    if details is None:
        details = {}
    if "logs" not in details and active_logs:
        details["logs"] = active_logs
        details["logs"].append({"t": datetime.now(timezone.utc).isoformat(), "msg": f"{agent_id} agent completed"})

    run = AgentRun(
        request_id=request_id, agent_id=agent_id, status=status,
        output=(output or "")[:2000],
        details=details or {},
        confidence=confidence,
        duration_ms=duration_ms,
        completed_at=datetime.now(timezone.utc) if status in ("completed","error") else None,
    )
    db.add(run); db.commit(); db.refresh(run)
    return run


# ══════════════════════════════════════════════════════════════════════════════
# AGENT 1 — Intake (Haiku) — Validate & extract fields
# ══════════════════════════════════════════════════════════════════════════════
def run_intake(db, req, ctx):
    t0 = time.time()
    _mark_active(db, req.id, "intake")

    SYSTEM = """You are the Intake Agent for InsurCare AI.
Your job: validate the PA request form and extract structured fields.
Rules:
- completeness_score = percentage of required fields present and non-empty
- valid = true only if completeness_score >= 70
- List any missing or suspicious fields in missing_fields
Respond with ONLY valid JSON, no markdown, no explanation.
Schema:
{
  "valid": bool,
  "completeness_score": int,
  "missing_fields": [str],
  "extracted": {
    "patient_name": str,
    "patient_age": int,
    "patient_gender": str,
    "diagnosis_code": str,
    "procedure_name": str,
    "procedure_code": str,
    "insurer": str,
    "policy_number": str
  },
  "data_quality_notes": str,
  "confidence": float
}"""

    # Build document verification context
    doc_verification = ""
    docs = req.documents or []
    verified_docs = [d for d in docs if isinstance(d, dict) and d.get("verification")]
    if verified_docs:
        doc_lines = []
        for d in verified_docs:
            v = d["verification"]
            status = v.get("status", "unknown")
            issues = v.get("issues", [])
            doc_lines.append(f"  - {d.get('filename','?')}: {status}" + (f" ({'; '.join(issues)})" if issues else ""))
        doc_verification = "\nDocument verification results:\n" + "\n".join(doc_lines)

    prompt = f"""Validate this PA request:
Patient Name: {req.patient_name}
Patient ID: {req.patient_id}
Age: {req.patient_age}
Gender: {req.patient_gender}
Insurer: {req.insurance_provider}
Policy #: {req.policy_number}
Procedure: {req.procedure_name}
CPT Code: {req.procedure_code}
Diagnosis: {req.diagnosis or 'Not provided'}
Clinical Justification: {req.clinical_justification}
Documents uploaded: {len(docs)}{doc_verification}"""

    _log_progress(db, req.id, "intake", "Validating PA request fields...")
    try:
        result = _parse_json(_call_claude(HAIKU, SYSTEM, prompt, db=db, request_id=req.id, agent_id="intake"))
    except Exception as e:
        dur = int((time.time()-t0)*1000)
        _save_run(db, req.id, "intake", "error",
            output=f"Intake agent failed: {e}",
            details={"error": str(e)}, duration_ms=dur)
        raise RuntimeError(f"Intake agent failed — pipeline halted: {e}") from e

    dur = int((time.time()-t0)*1000)
    _log_progress(db, req.id, "intake", "Intake complete — processing results...")
    _save_run(db, req.id, "intake", "completed",
        output=f"Completeness: {result.get('completeness_score',0)}%. Valid: {result.get('valid')}. {result.get('data_quality_notes','')}",
        details=result, confidence=result.get("confidence",0.90), duration_ms=dur)
    ctx["intake"] = result


# ══════════════════════════════════════════════════════════════════════════════
# AGENT 2 — Eligibility (Sonnet) — Is this patient covered?
# ══════════════════════════════════════════════════════════════════════════════
def run_eligibility(db, req, ctx):
    t0 = time.time()
    _mark_active(db, req.id, "eligibility")

    # Retrieve waiting-period and eligibility-relevant clauses from RAG
    elig_clauses = retrieve_policy_clauses(
        insurer=req.insurance_provider,
        procedure_name=req.procedure_name,
        diagnosis=req.diagnosis or "",
        clinical_justification=req.clinical_justification,
        n_results=4,
    )
    elig_context = build_grounded_context(elig_clauses)

    SYSTEM = f"""You are the Eligibility Agent for InsurCare AI.
Your job: determine if this patient is eligible for insurance coverage.
Use ONLY the policy clauses provided below — do not use prior knowledge.
{elig_context}

Be accurate. If a waiting period clause applies, mark eligible=false.
Respond with ONLY valid JSON, no markdown.
Schema:
{{
  "eligible": bool,
  "policy_active": bool,
  "ineligibility_reasons": [str],
  "coverage_type": "full" | "partial" | "none",
  "coverage_percentage": int,
  "sum_insured_inr": int,
  "waiting_period_applicable": bool,
  "waiting_period_reason": str,
  "network_hospital": bool,
  "eligibility_summary": str,
  "confidence": float
}}"""

    prompt = f"""Check eligibility:
Patient: {req.patient_name}, Age {req.patient_age}, Gender {req.patient_gender}
Insurer: {req.insurance_provider}
Policy Number: {req.policy_number}
Procedure: {req.procedure_name} ({req.procedure_code})
Diagnosis: {req.diagnosis or 'Not specified'}
Clinical justification: {req.clinical_justification}"""

    _log_progress(db, req.id, "eligibility", "Retrieving policy clauses for eligibility check...")
    try:
        result = _parse_json(_call_claude(SONNET, SYSTEM, prompt, max_tokens=3072, db=db, request_id=req.id, agent_id="eligibility"))
    except Exception as e:
        dur = int((time.time()-t0)*1000)
        _save_run(db, req.id, "eligibility", "error",
            output=f"Eligibility agent failed: {e}",
            details={"error": str(e)}, duration_ms=dur)
        raise RuntimeError(f"Eligibility agent failed — pipeline halted: {e}") from e

    dur = int((time.time()-t0)*1000)
    eligible = result.get("eligible", True)
    _log_progress(db, req.id, "eligibility", f"Eligibility check complete: {'ELIGIBLE' if eligible else 'NOT ELIGIBLE'}")
    _save_run(db, req.id, "eligibility", "completed",
        output=f"{'ELIGIBLE' if eligible else 'NOT ELIGIBLE'}. "
               f"Coverage: {result.get('coverage_type')} ({result.get('coverage_percentage')}%). "
               f"{result.get('eligibility_summary','')}",
        details=result, confidence=result.get("confidence",0.88), duration_ms=dur)
    ctx["eligibility"] = result


# ══════════════════════════════════════════════════════════════════════════════
# AGENT 3 — Policy (Sonnet + RAG) — Does this procedure qualify under policy?
#
# Anti-hallucination contract
# ───────────────────────────
# Phase 1 (deterministic): ChromaDB retrieves the top-k most semantically
#   similar clauses for this insurer+procedure.  No LLM involved.
# Phase 2 (LLM, grounded): Claude sees ONLY the retrieved clause texts and
#   is instructed to cite only those.  It returns which clause IDs matched and
#   whether medical necessity criteria are satisfied.
# Phase 3 (deterministic): coverage_pct, deductible, waiting_days etc. are
#   read from the corpus metadata of the cited clauses — the LLM cannot write
#   those fields.  Financial amounts are then computed from actual policy
#   fields on the request (sum_insured, deductible, coverage_pct).
# ══════════════════════════════════════════════════════════════════════════════
def run_policy(db, req, ctx):
    t0 = time.time()
    _mark_active(db, req.id, "policy")

    # ── Phase 1: Retrieve relevant clauses (no LLM) ───────────────────────────
    _log_progress(db, req.id, "policy", "Retrieving policy clauses from RAG...")
    clauses = retrieve_policy_clauses(
        insurer=req.insurance_provider,
        procedure_name=req.procedure_name,
        diagnosis=req.diagnosis or "",
        clinical_justification=req.clinical_justification,
        n_results=6,
    )
    grounded_context = build_grounded_context(clauses)
    clause_ids_available = [c["clause_id"] for c in clauses]
    _log_progress(db, req.id, "policy", f"Retrieved {len(clauses)} clauses: {', '.join(clause_ids_available)}")

    # ── Phase 2: LLM reasons over retrieved clauses only ─────────────────────
    SYSTEM = f"""You are the Policy Agent for InsurCare AI.
Your ONLY job: determine which of the RETRIEVED CLAUSES below apply to this
prior-authorisation request, and whether medical necessity criteria are met.

STRICT RULES — violation will cause incorrect patient outcomes:
1. Cite ONLY clause IDs from the list: {clause_ids_available}
2. Do NOT invent clause IDs or reference policy knowledge not in the retrieved text.
3. Do NOT write any monetary amounts — leave approved_amount_inr and
   uncovered_amount_inr as 0; they will be computed deterministically.
4. For covered/medical_necessity_met: reason strictly from the retrieved text.
5. If no retrieved clause covers the procedure, set covered=false.

{grounded_context}

Respond with ONLY valid JSON, no markdown.
Schema:
{{
  "covered": bool,
  "coverage_basis": str,
  "matched_clauses": [str],
  "exclusions_triggered": [str],
  "medical_necessity_met": bool,
  "medical_necessity_evidence": str,
  "conservative_treatment_required": bool,
  "conservative_treatment_documented": bool,
  "approved_amount_inr": 0,
  "coverage_limit_inr": 0,
  "uncovered_amount_inr": 0,
  "policy_notes": str,
  "confidence": float
}}"""

    prompt = f"""Analyse policy coverage for this PA request:
Patient: {req.patient_name}, Age {req.patient_age}
Insurer: {req.insurance_provider}, Policy: {req.policy_number}
Procedure: {req.procedure_name} (CPT: {req.procedure_code})
Diagnosis: {req.diagnosis or 'Not specified'}
Clinical Justification: {req.clinical_justification}
Documents submitted: {len(req.documents or [])}
Eligibility result: {json.dumps(ctx.get('eligibility', {}))}

Based ONLY on the retrieved clauses above, determine coverage.
List every clause ID that is relevant in matched_clauses or exclusions_triggered."""

    try:
        _log_progress(db, req.id, "policy", "Analyzing clause coverage with Gemini...")
        result = _parse_json(_call_claude(SONNET, SYSTEM, prompt, max_tokens=4096, db=db, request_id=req.id, agent_id="policy"))
    except Exception as e:
        _log_progress(db, req.id, "policy", f"LLM analysis failed, falling back to RAG metadata: {e}")
        # Fallback: derive from RAG metadata directly without LLM
        any_coverage = next((c for c in clauses if c["covered"]), None)
        any_exclusion = next((c for c in clauses if c["clause_type"] == "exclusion"), None)
        result = {
            "covered": bool(any_coverage) and not any_exclusion,
            "coverage_basis": any_coverage["text"][:200] if any_coverage else "No matching coverage clause",
            "matched_clauses": [c["clause_id"] for c in clauses if c["covered"]],
            "exclusions_triggered": [c["clause_id"] for c in clauses if c["clause_type"] == "exclusion"],
            "medical_necessity_met": bool(any_coverage),
            "medical_necessity_evidence": "Derived from retrieved clauses (LLM fallback)",
            "conservative_treatment_required": False, "conservative_treatment_documented": False,
            "approved_amount_inr": 0, "coverage_limit_inr": 0, "uncovered_amount_inr": 0,
            "policy_notes": f"LLM call failed; coverage derived from RAG metadata. {e}",
            "confidence": 0.65,
        }

    # Validate cited clause IDs — strip any the LLM hallucinated
    valid_ids = set(clause_ids_available)
    result["matched_clauses"]      = [c for c in result.get("matched_clauses", [])      if c in valid_ids]
    result["exclusions_triggered"] = [c for c in result.get("exclusions_triggered", []) if c in valid_ids]

    # ── Phase 3: Deterministic financial computation ───────────────────────────
    # Read coverage facts from corpus metadata (not from LLM output).
    all_cited = result["matched_clauses"] + result["exclusions_triggered"]
    financial_facts = extract_financial_facts(all_cited, clauses)

    # If RAG says excluded/waiting, override LLM covered=True
    if not financial_facts["covered"]:
        result["covered"] = False
        if financial_facts["blocking_type"] == "exclusion":
            excl_id = financial_facts["blocking_clause"]
            if excl_id and excl_id not in result["exclusions_triggered"]:
                result["exclusions_triggered"].append(excl_id)

    # ── Compute approved amount from authoritative sources (no LLM) ─────────────
    # Procedure cost: CPT-code lookup table → keyword fallback → default.
    # This replaces the previous "llm_cost_proxy = sum_insured" which caused
    # systematic over-approval whenever procedure cost < sum insured.
    from .policy_rag import lookup_procedure_cost
    procedure_cost = lookup_procedure_cost(req.procedure_code, req.procedure_name)

    sum_insured   = float(req.sum_insured  or 0)
    deductible    = float(req.deductible   or 0)
    cov_pct_req   = float(req.coverage_pct or 0) / 100.0
    cov_pct_rag   = financial_facts["coverage_pct"]   # from corpus metadata, e.g. 0.80
    cov_pct_elig  = float(ctx.get("eligibility", {}).get("coverage_percentage", 0)) / 100.0
    # Priority: explicit request field > corpus clause > eligibility agent > hardcoded fallback
    cov_pct_final = cov_pct_req or cov_pct_rag or cov_pct_elig or 0.80
    cov_pct_source = "request" if cov_pct_req else "corpus" if cov_pct_rag else "eligibility"

    if result["covered"] and sum_insured > 0:
        # admissible = actual procedure cost, capped at sum insured
        admissible     = min(sum_insured, procedure_cost)
        approved       = max(0, round(admissible * cov_pct_final - deductible))
        uncovered      = max(0, procedure_cost - approved)
        coverage_limit = int(sum_insured)
    else:
        approved = uncovered = coverage_limit = 0

    result["approved_amount_inr"]  = approved
    result["coverage_limit_inr"]   = coverage_limit
    result["uncovered_amount_inr"] = uncovered
    result["policy_notes"] = (
        f"{result.get('policy_notes', '')} "
        f"[RAG: {len(clauses)} clauses retrieved; "
        f"{len(result['matched_clauses'])} matched; "
        f"procedure_cost=₹{procedure_cost:,}; "
        f"coverage_pct={cov_pct_final*100:.0f}% from {cov_pct_source}; "
        f"approved=₹{approved:,}]"
    ).strip()

    dur = int((time.time()-t0)*1000)
    _save_run(db, req.id, "policy", "completed",
        output=f"{'COVERED' if result.get('covered') else 'NOT COVERED'}. "
               f"Approved: ₹{result.get('approved_amount_inr',0):,}. "
               f"Clauses: {', '.join(result.get('matched_clauses',[])[:3])}. "
               f"{result.get('policy_notes','')[:200]}",
        details=result, confidence=result.get("confidence", 0.88), duration_ms=dur)
    ctx["policy"] = result


# ══════════════════════════════════════════════════════════════════════════════
# AGENT 4 — Risk════════════
# AGENT 4 — Risk (Sonnet) — How risky is this patient?
# ══════════════════════════════════════════════════════════════════════════════
def run_risk(db, req, ctx):
    t0 = time.time()
    _mark_active(db, req.id, "risk")

    SYSTEM = """You are the Risk Assessment Agent for InsurCare AI.
Your job: compute a patient risk score using this EXACT formula:
  RiskScore = (SeverityScore * 0.4) + (DelayFactorScore * 0.35) + (AgeFactorScore * 0.25)
Where each component is 0-100.
- SeverityScore: how severe is the diagnosis/procedure (0=mild, 100=life-threatening)
- DelayFactorScore: how much does delaying this procedure worsen outcomes (0=no urgency, 100=immediate)
- AgeFactorScore: age-related risk (age 0-20=10, 20-40=25, 40-60=50, 60-75=70, 75+=90)

Respond with ONLY valid JSON, no markdown.
Schema:
{
  "severity_score": int,
  "delay_factor_score": int,
  "age_factor_score": int,
  "risk_score": float,
  "risk_level": "low" | "moderate" | "elevated" | "high",
  "comorbidity_flags": [str],
  "priority": "routine" | "expedited" | "urgent",
  "risk_reasoning": str,
  "confidence": float
}"""

    prompt = f"""Assess risk:
Patient: {req.patient_name}, Age {req.patient_age}, Gender {req.patient_gender}
Diagnosis: {req.diagnosis or 'Not specified'}
Procedure: {req.procedure_name} ({req.procedure_code})
Clinical Justification: {req.clinical_justification}
Policy coverage: covered={ctx.get('policy',{}).get('covered', True)}"""

    _log_progress(db, req.id, "risk", "Calculating patient risk score...")
    try:
        result = _parse_json(_call_claude(SONNET, SYSTEM, prompt, db=db, request_id=req.id, agent_id="risk"))
        # Always recalculate risk_score from components to ensure formula accuracy
        sev = max(0, min(100, int(result.get("severity_score", 50))))
        delay = max(0, min(100, int(result.get("delay_factor_score", 40))))
        age_f = max(0, min(100, int(result.get("age_factor_score", 30))))
        computed = round((sev * 0.4) + (delay * 0.35) + (age_f * 0.25), 1)
        result["risk_score"] = computed
        result["severity_score"] = sev
        result["delay_factor_score"] = delay
        result["age_factor_score"] = age_f
    except Exception as e:
        dur = int((time.time()-t0)*1000)
        _save_run(db, req.id, "risk", "error",
            output=f"Risk agent failed: {e}",
            details={"error": str(e)}, duration_ms=dur)
        raise RuntimeError(f"Risk agent failed — pipeline halted: {e}") from e

    req.risk_score = result["risk_score"]
    db.commit()

    dur = int((time.time()-t0)*1000)
    _save_run(db, req.id, "risk", "completed",
        output=f"Risk Score: {result['risk_score']} ({result.get('risk_level','').upper()}). "
               f"Priority: {result.get('priority')}. "
               f"Components: Severity={result['severity_score']}, Delay={result['delay_factor_score']}, Age={result['age_factor_score']}. "
               f"{result.get('risk_reasoning','')[:200]}",
        details=result, confidence=result.get("confidence",0.90), duration_ms=dur)
    ctx["risk"] = result


# ══════════════════════════════════════════════════════════════════════════════
# AGENT 5 — Decision (Sonnet) — Final approve/deny with full explanation
# ══════════════════════════════════════════════════════════════════════════════
def run_decision(db, req, ctx):
    t0 = time.time()
    _mark_active(db, req.id, "decision")

    eligibility = ctx.get("eligibility", {})
    policy      = ctx.get("policy", {})
    risk        = ctx.get("risk", {})

    # Hard business rules — these override LLM output
    is_eligible = eligibility.get("eligible", True)
    is_covered  = policy.get("covered", True)

    SYSTEM = """You are the Decision Agent for InsurCare AI — the final clinical decision-maker.
Your decision MUST be consistent with the evidence provided.
Rules you must follow:
1. If eligible=false → decision MUST be "denied"
2. If covered=false → decision MUST be "denied"  
3. If medical_necessity_met=false → decision should be "denied" unless risk is high (then "escalated")
4. If risk_level is "high" or "elevated" AND there is any doubt → decision should be "escalated"
5. Otherwise, if eligible=true AND covered=true AND medical_necessity_met=true → "approved"

Your output must include:
- Exact insurance amount approved in INR (0 if denied)
- Plain English reasons (one sentence each) for approval or denial
- Specific policy clauses cited
- Practical next steps for doctor and patient

Respond with ONLY valid JSON, no markdown.
Schema:
{
  "decision": "approved" | "denied" | "escalated",
  "confidence": int,
  "approved_amount_inr": int,
  "coverage_percentage": int,
  "approval_reasons": [str],
  "denial_reasons": [str],
  "policy_clauses_cited": [str],
  "next_steps": [str],
  "appeal_pathway": str,
  "doctor_recommendation": str,
  "clinical_reasoning": str
}"""

    prompt = f"""Make the final PA decision:

PATIENT: {req.patient_name}, Age {req.patient_age}, Gender {req.patient_gender}
PROCEDURE: {req.procedure_name} ({req.procedure_code})
DIAGNOSIS: {req.diagnosis or 'Not specified'}
INSURER: {req.insurance_provider} | POLICY: {req.policy_number}
JUSTIFICATION: {req.clinical_justification}

ELIGIBILITY RESULT:
- Eligible: {is_eligible}
- Coverage: {eligibility.get('coverage_type')} ({eligibility.get('coverage_percentage')}%)
- Ineligibility reasons: {eligibility.get('ineligibility_reasons', [])}
- Waiting period: {eligibility.get('waiting_period_applicable')} — {eligibility.get('waiting_period_reason','')}

POLICY RESULT:
- Covered: {is_covered}
- Matched clauses: {policy.get('matched_clauses',[])}
- Exclusions triggered: {policy.get('exclusions_triggered',[])}
- Medical necessity met: {policy.get('medical_necessity_met')}
- Approved amount: ₹{policy.get('approved_amount_inr',0):,}
- Coverage limit: ₹{policy.get('coverage_limit_inr',0):,}

RISK RESULT:
- Risk score: {risk.get('risk_score')} ({risk.get('risk_level')})
- Priority: {risk.get('priority')}
- Comorbidity flags: {risk.get('comorbidity_flags',[])}

Apply the decision rules strictly. Produce a decision that is fully explainable."""

    _log_progress(db, req.id, "decision", "Synthesizing final decision from all agent outputs...")
    try:
        result = _parse_json(_call_claude(SONNET, SYSTEM, prompt, max_tokens=4096, db=db, request_id=req.id, agent_id="decision"))

        # Enforce hard business rules
        if not is_eligible:
            result["decision"] = "denied"
            if not result.get("denial_reasons"):
                result["denial_reasons"] = eligibility.get("ineligibility_reasons", ["Patient not eligible under this policy"])
        if not is_covered:
            result["decision"] = "denied"
            excl = policy.get("exclusions_triggered", [])
            if excl and not any(e in str(result.get("denial_reasons",[])) for e in excl):
                result.setdefault("denial_reasons", []).extend(excl)

        # Normalize
        decision_val = str(result.get("decision","escalated")).lower()
        if decision_val not in {"approved","denied","escalated"}:
            decision_val = "escalated"
        result["decision"] = decision_val

        # Enforce approved_amount from policy agent's deterministic calculation.
        # The LLM decides approved/denied/escalated but MUST NOT override the
        # amount already computed from real policy fields (sum_insured, deductible,
        # coverage_pct).  Denied = ₹0; approved/escalated = policy agent figure.
        if decision_val == "denied":
            result["approved_amount_inr"] = 0
        else:
            result["approved_amount_inr"] = int(policy.get("approved_amount_inr", 0))
        result["coverage_percentage"] = int(eligibility.get("coverage_percentage", 80))

        confidence_pct = max(0, min(100, int(result.get("confidence", 75))))
        result["confidence"] = confidence_pct

    except Exception as e:
        # On LLM error: deny or escalate only — never silently approve
        if not is_eligible or not is_covered:
            decision_val = "denied"
            denial_reasons = (eligibility.get("ineligibility_reasons",[]) +
                              policy.get("exclusions_triggered",[]) or
                              ["Not eligible or not covered under current policy"])
            approved_amt = 0
        else:
            # Cannot confirm approval without LLM reasoning — escalate for human review
            decision_val = "escalated"
            denial_reasons = []
            approved_amt = 0

        result = {
            "decision": decision_val,
            "confidence": 0,
            "approved_amount_inr": approved_amt,
            "coverage_percentage": int(eligibility.get("coverage_percentage", 0)),
            "approval_reasons": [],
            "denial_reasons": denial_reasons,
            "policy_clauses_cited": policy.get("matched_clauses",[]),
            "next_steps": ["Manual review required — contact insurer for further information"],
            "appeal_pathway": f"Appeal to {req.insurance_provider} grievance cell within 30 days.",
            "doctor_recommendation": "Await manual review before proceeding.",
            "clinical_reasoning": f"Decision agent error — escalated for manual review. {e}"
        }

    # Persist to request
    req.decision = result["decision"]
    req.confidence_score = result["confidence"] / 100.0
    req.approved_amount_inr = float(result.get("approved_amount_inr") or 0)
    req.coverage_percentage = float(result.get("coverage_percentage") or 0)
    req.approval_reasons = result.get("approval_reasons") or []
    req.denial_reasons = result.get("denial_reasons") or []
    req.policy_clauses_cited = result.get("policy_clauses_cited") or []
    req.next_steps = result.get("next_steps") or []
    req.appeal_pathway = result.get("appeal_pathway","")
    req.doctor_recommendation = result.get("doctor_recommendation","")
    db.commit()

    dur = int((time.time()-t0)*1000)
    dec = result["decision"].upper()
    amt = result.get("approved_amount_inr",0)
    _save_run(db, req.id, "decision", "completed",
        output=f"DECISION: {dec}. "
               + (f"Approved Amount: ₹{amt:,}. " if dec=="APPROVED" else "")
               + f"Confidence: {result['confidence']}%. "
               + f"{result.get('clinical_reasoning','')[:200]}",
        details=result, confidence=result["confidence"]/100.0, duration_ms=dur)
    ctx["decision"] = result
    ctx["final_status"] = {"approved":"approved","denied":"rejected"}.get(result["decision"],"escalated")


# ══════════════════════════════════════════════════════════════════════════════
# AGENT 6 — Communication (Haiku) — Plain English explanation for the screen
# ══════════════════════════════════════════════════════════════════════════════
def run_communication(db, req, ctx):
    t0 = time.time()
    _mark_active(db, req.id, "communication")

    decision_data = ctx.get("decision", {})
    risk_data     = ctx.get("risk", {})
    decision_str  = decision_data.get("decision","escalated").upper()
    approved_amt  = decision_data.get("approved_amount_inr", 0)

    SYSTEM = """You are the Communication Agent for InsurCare AI.
Your job: generate a plain-English two-sentence summary of the PA decision for the patient and doctor to read on screen.
The summary must be clear, human, and mention the key outcome and reason.
Respond with ONLY valid JSON, no markdown.
Schema:
{
  "plain_english_summary": str,
  "doctor_message": str,
  "patient_message": str,
  "insurer_summary": str,
  "channels_notified": [str],
  "sla_met": bool,
  "confidence": float
}"""

    reasons = (decision_data.get("approval_reasons") or decision_data.get("denial_reasons") or [])
    prompt = f"""Generate communications:
Patient: {req.patient_name}, Age {req.patient_age}
Request: {req.request_code}
Procedure: {req.procedure_name}
Insurer: {req.insurance_provider}
Decision: {decision_str}
{"Approved Amount: ₹" + f"{approved_amt:,}" if decision_str == "APPROVED" else ""}
Key reasons: {reasons[:3]}
Risk Level: {risk_data.get('risk_level','moderate')}
Doctor recommendation: {decision_data.get('doctor_recommendation','')}
Appeal pathway: {decision_data.get('appeal_pathway','')}"""

    _log_progress(db, req.id, "communication", "Generating plain-English summaries...")
    try:
        result = _parse_json(_call_claude(HAIKU, SYSTEM, prompt, max_tokens=1000, db=db, request_id=req.id, agent_id="communication"))
    except Exception as e:
        _log_progress(db, req.id, "communication", f"LLM summary failed, using fallback: {e}")
        if decision_str == "APPROVED":
            summary = f"Your prior authorization for {req.procedure_name} has been APPROVED with ₹{approved_amt:,} coverage. Please proceed with scheduling as per your doctor's recommendation."
        else:
            top_reason = reasons[0] if reasons else "the procedure does not meet current policy coverage criteria"
            summary = f"Your prior authorization for {req.procedure_name} has been {decision_str} because {top_reason}. Please contact {req.insurance_provider} within 30 days if you wish to appeal."

        result = {
            "plain_english_summary": summary,
            "doctor_message": f"PA {req.request_code}: {decision_str}. {decision_data.get('doctor_recommendation','')}",
            "patient_message": summary,
            "insurer_summary": f"PA {req.request_code} processed. Decision: {decision_str}.",
            "channels_notified": ["email","portal"],
            "sla_met": True,
            "confidence": 0.90
        }

    # Save plain English summary to request
    req.plain_english_summary = result.get("plain_english_summary","")
    req.status = ctx.get("final_status","escalated")
    req.final_summary = (
        f"PA {req.request_code} | {req.patient_name} | {req.procedure_name} | "
        f"{decision_str}" +
        (f" | ₹{approved_amt:,} approved" if decision_str=="APPROVED" else "") +
        f" | Risk: {risk_data.get('risk_level','N/A')}"
    )
    db.commit()

    dur = int((time.time()-t0)*1000)
    _save_run(db, req.id, "communication", "completed",
        output=result.get("plain_english_summary",""),
        details=result, confidence=result.get("confidence",0.95), duration_ms=dur)
    ctx["communication"] = result


# ══════════════════════════════════════════════════════════════════════════════
# AGENT 7 — Payment (auto-disburse or flag for insurer approval)
# ══════════════════════════════════════════════════════════════════════════════
import uuid as _uuid

def run_payment(db: Session, req: PARequest, ctx: dict):
    t0 = time.time()
    _mark_active(db, req.id, "payment")

    decision_data = ctx.get("decision", {})
    decision_str = decision_data.get("decision", "escalated").lower()

    _log_progress(db, req.id, "payment", "Checking payment eligibility...")

    if decision_str != "approved" or req.approved_amount_inr is None or req.approved_amount_inr <= 0:
        req.payment_status = "not_applicable"
        db.commit()
        dur = int((time.time() - t0) * 1000)
        _log_progress(db, req.id, "payment", f"Payment not applicable — decision={decision_str}, amount={req.approved_amount_inr}")
        _save_run(db, req.id, "payment", "completed",
                  output="Payment not applicable — request not approved",
                  details={"payment_status": "not_applicable"}, duration_ms=dur)
        return

    confidence = decision_data.get("confidence", 0)
    risk_score = ctx.get("risk", {}).get("risk_score", 100)

    _log_progress(db, req.id, "payment", f"Decision confidence={confidence}%, risk_score={risk_score}")

    if confidence >= 85 and risk_score <= 40:
        tx_id = f"TXN-{_uuid.uuid4().hex[:10].upper()}"
        req.payment_status = "paid"
        req.transaction_id = tx_id
        req.disbursed_amount_inr = req.approved_amount_inr
        req.paid_at = datetime.now(timezone.utc)
        db.commit()
        dur = int((time.time() - t0) * 1000)
        _log_progress(db, req.id, "payment", f"Auto-paid: ₹{req.approved_amount_inr:,.0f} via {tx_id}")
        _save_run(db, req.id, "payment", "completed",
                  output=f"Auto-paid ₹{req.approved_amount_inr:,.0f} | TXN: {tx_id}",
                  details={"payment_status": "paid", "transaction_id": tx_id,
                           "disbursed_amount_inr": req.approved_amount_inr,
                           "confidence": confidence, "risk_score": risk_score},
                  duration_ms=dur)
    else:
        req.payment_status = "pending_insurer_approval"
        db.commit()
        dur = int((time.time() - t0) * 1000)
        reason = f"confidence={confidence} (need >=85) or risk={risk_score} (need <=40)"
        _log_progress(db, req.id, "payment", f"Pending insurer approval — {reason}")
        _save_run(db, req.id, "payment", "completed",
                  output=f"Payment pending insurer approval — {reason}",
                  details={"payment_status": "pending_insurer_approval",
                           "confidence": confidence, "risk_score": risk_score},
                  duration_ms=dur)


# ══════════════════════════════════════════════════════════════════════════════
# Main pipeline runner
# ══════════════════════════════════════════════════════════════════════════════
def run_pipeline(db: Session, req: PARequest):
    req.status = "processing"
    db.commit()

    _mark_active(db, req.id, "orchestrator")
    _log_progress(db, req.id, "orchestrator", "Pipeline started — processing PA request")

    ctx: dict = {}
    t_start = time.time()
    try:
        _log_progress(db, req.id, "orchestrator", "Routing to Intake Agent")
        run_intake(db, req, ctx); time.sleep(1)

        _log_progress(db, req.id, "orchestrator", "Intake complete — routing to Eligibility Agent")
        run_eligibility(db, req, ctx); time.sleep(1)

        _log_progress(db, req.id, "orchestrator", "Eligibility complete — routing to Policy Agent")
        run_policy(db, req, ctx); time.sleep(1)

        _log_progress(db, req.id, "orchestrator", "Policy complete — routing to Risk Agent")
        run_risk(db, req, ctx); time.sleep(1)

        _log_progress(db, req.id, "orchestrator", "Risk complete — routing to Decision Agent")
        run_decision(db, req, ctx); time.sleep(1)

        _log_progress(db, req.id, "orchestrator", "Decision complete — routing to Communication Agent")
        run_communication(db, req, ctx)

        _log_progress(db, req.id, "orchestrator", "Communication complete — routing to Payment Agent")
        run_payment(db, req, ctx)

        _log_progress(db, req.id, "orchestrator", "Pipeline complete — all agents finished")
        dur = int((time.time() - t_start) * 1000)
        _save_run(db, req.id, "orchestrator", "completed",
                  output="Pipeline completed successfully",
                  confidence=1.0, duration_ms=dur)
    except Exception as e:
        _log_progress(db, req.id, "orchestrator", f"Pipeline error: {str(e)[:200]}")
        dur = int((time.time() - t_start) * 1000)
        _save_run(db, req.id, "orchestrator", "error",
                  output=f"Pipeline failed: {str(e)[:500]}", duration_ms=dur)
        req.status = "escalated"
        req.final_summary = f"Pipeline error — escalated for manual review: {str(e)[:300]}"
        req.plain_english_summary = "Your request has been escalated for manual review due to a processing issue. Our team will contact you within 24 hours."
        db.commit()
    finally:
        # Clean up any "active" placeholder rows that were never resolved.
        # This happens when the process crashes between _mark_active and
        # _save_run, leaving orphan rows that show an agent as perpetually
        # running in the UI.
        orphans = db.query(AgentRun).filter(
            AgentRun.request_id == req.id,
            AgentRun.status == "active",
        ).all()
        for orphan in orphans:
            orphan.status = "error"
            orphan.output = "Pipeline interrupted before agent completed."
            orphan.completed_at = datetime.now(timezone.utc)
        if orphans:
            db.commit()

    db.refresh(req)
    return req
