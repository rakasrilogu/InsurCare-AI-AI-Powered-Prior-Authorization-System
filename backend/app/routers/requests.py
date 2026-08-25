import uuid
import time
from collections import defaultdict
from threading import Lock
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db, SessionLocal
from ..models.user import User
from ..models.pa_request import PARequest
from ..schemas.pa_request import PARequestCreate, PARequestOut
from ..security import get_current_user
from ..agents.orchestrator import run_pipeline
from ..services.audit import log_action

router = APIRouter(prefix="/api/requests", tags=["requests"])

# ── Per-user rate limiting (Redis-backed) ────────────────────────────────────
# Uses Redis sorted sets for sliding-window rate limiting.
# Falls back to in-memory dict if Redis is unavailable.
RATE_LIMIT_WINDOW = 60   # seconds
RATE_LIMIT_MAX    = 5    # submissions per window

_redis_client = None
_rate_store: dict[int, list[float]] = defaultdict(list)
_rate_lock = Lock()

def _get_redis():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        from ..config import settings
        import redis
        _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=2)
        _redis_client.ping()
        return _redis_client
    except Exception:
        _redis_client = False  # sentinel: Redis unavailable
        return None

def _check_rate_limit(user_id: int):
    now = time.time()
    r = _get_redis()
    if r and r is not False:
        # Redis sorted-set sliding window
        key = f"rate_limit:{user_id}"
        now = time.time()
        pipe = r.pipeline()
        pipe.zremrangebyscore(key, 0, now - RATE_LIMIT_WINDOW)
        pipe.zadd(key, {str(now): now})
        pipe.expire(key, RATE_LIMIT_WINDOW)
        count = pipe.execute()[1]
        if count > RATE_LIMIT_MAX:
            r.zrem(key, str(now))
            raise HTTPException(
                429,
                f"Rate limit exceeded: max {RATE_LIMIT_MAX} submissions per "
                f"{RATE_LIMIT_WINDOW}s. Please wait before submitting again."
            )
    else:
        # Fallback: in-memory dict
        with _rate_lock:
            timestamps = _rate_store[user_id]
            _rate_store[user_id] = [t for t in timestamps if now - t < RATE_LIMIT_WINDOW]
            if len(_rate_store[user_id]) >= RATE_LIMIT_MAX:
                raise HTTPException(
                    429,
                    f"Rate limit exceeded: max {RATE_LIMIT_MAX} submissions per "
                    f"{RATE_LIMIT_WINDOW}s. Please wait before submitting again."
                )
            _rate_store[user_id].append(now)


# ── Input sanitization ────────────────────────────────────────────────────────
# Fields that are interpolated directly into LLM prompts must be length-limited
# and stripped of control characters to prevent prompt injection.
_MAX_LENGTHS = {
    "patient_name":           200,
    "patient_id":             100,
    "diagnosis":              500,
    "diagnosis_code_icd10":   20,
    "procedure_code_cpt":     20,
    "clinical_justification": 2000,
    "procedure_name":         300,
    "procedure_code":         50,
    "insurance_provider":     200,
    "policy_number":          100,
    "plan_name":              200,
}

def _sanitize(data: PARequestCreate) -> PARequestCreate:
    d = data.model_dump()
    for field, max_len in _MAX_LENGTHS.items():
        val = d.get(field)
        if val is None:
            continue
        # Strip null bytes and common prompt-injection separators
        val = val.replace("\x00", "").replace("\r", " ")
        # Truncate
        if len(val) > max_len:
            val = val[:max_len]
        d[field] = val
    return PARequestCreate(**d)


def _process_in_bg(request_id: int):
    db = SessionLocal()
    try:
        req = db.get(PARequest, request_id)
        if req:
            run_pipeline(db, req)
    finally:
        db.close()


def _scope_response(req, user) -> PARequestOut:
    """Scope API response fields based on user role.

    Hospital users should NOT see:
      - policy_clauses_cited (insurer audit trail)
      - agent_run output / details (risk severity/delay/age breakdown, raw LLM output)

    Insurers see the full response.
    """
    out = PARequestOut.model_validate(req)
    if user.role == "hospital":
        out.policy_clauses_cited = []
        for run in out.agent_runs:
            run.output = None
            run.details = None
    return out


@router.post("", response_model=PARequestOut, status_code=201)
def create_request(
    data: PARequestCreate,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Only hospital users with can_submit permission can submit PA requests
    if user.role != "hospital" or not user.can_submit:
        raise HTTPException(403, "Only hospital users with submit permission can submit PA requests")

    _check_rate_limit(user.id)
    data = _sanitize(data)

    code = f"PA-{uuid.uuid4().hex[:8].upper()}"
    req = PARequest(request_code=code, user_id=user.id, **data.model_dump())
    db.add(req); db.commit(); db.refresh(req)

    log_action(db, user_id=user.id, user_email=user.email, user_role=user.role,
               action="create", resource_type="pa_request", resource_id=req.id,
               detail=f"Created PA request {code} for {data.patient_name}")

    # Only auto-start pipeline if no documents to upload (upload triggers pipeline via verify_documents)
    if not data.documents:
        bg.add_task(_process_in_bg, req.id)
    return req


@router.get("", response_model=list[PARequestOut])
def list_requests(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(PARequest)

    if user.role == "hospital":
        # Hospital users see all requests from their hospital
        if user.hospital:
            hospital_user_ids = [
                u.id for u in db.query(User).filter(
                    User.role == "hospital",
                    User.hospital == user.hospital
                ).all()
            ]
            q = q.filter(PARequest.user_id.in_(hospital_user_ids)) if hospital_user_ids else q.filter(False)
        else:
            q = q.filter(False)

    elif user.role == "insurer":
        if user.company_name:
            q = q.filter(PARequest.insurance_provider == user.company_name)
        else:
            q = q.filter(False)

    else:
        q = q.filter(False)

    return [_scope_response(r, user) for r in q.order_by(PARequest.created_at.desc()).limit(200).all()]


@router.get("/{request_id}", response_model=PARequestOut)
def get_request(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    req = db.get(PARequest, request_id)
    if not req:
        raise HTTPException(404, "Not found")

    if user.role == "hospital":
        # Hospital users can only see requests from their hospital
        if user.hospital:
            hospital_user_ids = [
                u.id for u in db.query(User).filter(
                    User.role == "hospital",
                    User.hospital == user.hospital
                ).all()
            ]
            if req.user_id not in hospital_user_ids:
                raise HTTPException(403, "Access denied")
        else:
            raise HTTPException(403, "Access denied")

    elif user.role == "insurer":
        if req.insurance_provider != user.company_name:
            raise HTTPException(403, "Access denied")

    else:
        raise HTTPException(403, "Access denied")

    return _scope_response(req, user)


class DisputeIn(BaseModel):
    reason: str


class HumanReviewIn(BaseModel):
    decision: str  # approved | denied | partially_approved
    notes: str = ""
    approved_amount_inr: float | None = None  # optional override


@router.post("/{request_id}/human-review", response_model=PARequestOut)
def human_review_decision(
    request_id: int,
    body: HumanReviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "insurer":
        raise HTTPException(403, "Only insurers can perform human review")
    if not user.is_verified:
        raise HTTPException(403, "Account pending verification")

    req = db.get(PARequest, request_id)
    if not req:
        raise HTTPException(404, "Not found")
    if req.insurance_provider != user.company_name:
        raise HTTPException(403, "Access denied")

    valid_decisions = {"approved", "denied", "partially_approved"}
    if body.decision not in valid_decisions:
        raise HTTPException(400, f"Decision must be one of: {', '.join(valid_decisions)}")

    # Update with human review
    req.human_reviewer_id = user.id
    req.human_review_notes = body.notes
    req.human_review_decision = body.decision
    req.human_reviewed_at = datetime.now(timezone.utc)
    req.decision = body.decision
    req.human_review_requested = False

    # Apply override amount if provided
    if body.approved_amount_inr is not None and body.decision in ("approved", "partially_approved"):
        req.approved_amount_inr = body.approved_amount_inr

    # Set status
    status_map = {
        "approved": "approved",
        "denied": "rejected",
        "partially_approved": "partially_approved",
    }
    req.status = status_map.get(body.decision, "escalated")

    db.commit()
    db.refresh(req)

    log_action(db, user_id=user.id, user_email=user.email, user_role=user.role,
               action="human_review", resource_type="pa_request", resource_id=req.id,
               detail=f"Human review: {body.decision}. Notes: {body.notes[:200]}")

    return req


@router.get("/{request_id}/decision-trace")
def get_decision_trace(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    req = db.get(PARequest, request_id)
    if not req:
        raise HTTPException(404, "Not found")

    # RBAC check
    if user.role == "hospital":
        if user.hospital:
            hospital_user_ids = [
                u.id for u in db.query(User).filter(
                    User.role == "hospital",
                    User.hospital == user.hospital
                ).all()
            ]
            if req.user_id not in hospital_user_ids:
                raise HTTPException(403, "Access denied")
        else:
            raise HTTPException(403, "Access denied")
    elif user.role == "insurer":
        if req.insurance_provider != user.company_name:
            raise HTTPException(403, "Access denied")
    else:
        raise HTTPException(403, "Access denied")

    # Strip insurer-only fields for hospital users
    result = {
        "request_id": req.id,
        "request_code": req.request_code,
        "decision": req.decision,
        "human_review_requested": req.human_review_requested,
        "human_review_reasons": req.human_review_reasons,
        "missing_information": req.missing_information,
    }

    if user.role == "insurer":
        result["decision_evidence"] = req.decision_evidence
        result["decision_trace"] = req.decision_trace
        result["human_reviewer_id"] = req.human_reviewer_id
        result["human_review_notes"] = req.human_review_notes
        result["human_review_decision"] = req.human_review_decision
        result["human_reviewed_at"] = req.human_reviewed_at
        result["validation_results"] = (req.decision_evidence or {}).get("validation_results", [])

    return result


@router.post("/{request_id}/approve-payment", response_model=PARequestOut)
def approve_payment(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "insurer":
        raise HTTPException(403, "Only insurers can approve payments")
    if not user.is_verified:
        raise HTTPException(403, "Account pending verification")

    req = db.get(PARequest, request_id)
    if not req:
        raise HTTPException(404, "Not found")
    if req.insurance_provider != user.company_name:
        raise HTTPException(403, "Access denied")
    if req.status != "approved":
        raise HTTPException(400, "Request must be in approved status")
    if req.payment_status == "paid":
        raise HTTPException(400, "Payment already disbursed")
    if req.payment_status != "pending_insurer_approval":
        raise HTTPException(400, "Payment is not pending insurer approval")
    if req.disputed:
        raise HTTPException(400, "Cannot approve payment on a disputed claim — resolve dispute first")

    tx_id = f"TXN-{uuid.uuid4().hex[:10].upper()}"
    req.payment_status = "paid"
    req.transaction_id = tx_id
    req.disbursed_amount_inr = req.approved_amount_inr
    req.paid_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)

    log_action(db, user_id=user.id, user_email=user.email, user_role=user.role,
               action="approve_payment", resource_type="pa_request", resource_id=req.id,
               detail=f"Approved payment {tx_id} for Rs {req.approved_amount_inr}")

    return req


@router.post("/{request_id}/dispute", response_model=PARequestOut)
def dispute_request(
    request_id: int,
    body: DisputeIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "insurer":
        raise HTTPException(403, "Only insurers can dispute decisions")
    if not user.is_verified:
        raise HTTPException(403, "Account pending verification")

    req = db.get(PARequest, request_id)
    if not req:
        raise HTTPException(404, "Not found")
    if req.insurance_provider != user.company_name:
        raise HTTPException(403, "Access denied")

    req.disputed = True
    req.dispute_reason = body.reason
    db.commit()
    db.refresh(req)

    log_action(db, user_id=user.id, user_email=user.email, user_role=user.role,
               action="dispute", resource_type="pa_request", resource_id=req.id,
               detail=f"Disputed claim: {body.reason[:200]}")

    return req


# ── Request More Information ─────────────────────────────────────────────────

class RequestInfoIn(BaseModel):
    message: str
    missing_documents: list[str] = []


@router.post("/{request_id}/request-info", response_model=PARequestOut)
def request_more_information(
    request_id: int,
    body: RequestInfoIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "insurer":
        raise HTTPException(403, "Only insurers can request more information")
    if not user.is_verified:
        raise HTTPException(403, "Account pending verification")

    req = db.get(PARequest, request_id)
    if not req:
        raise HTTPException(404, "Not found")
    if req.insurance_provider != user.company_name:
        raise HTTPException(403, "Access denied")

    req.status = "requires_information"
    req.info_request_message = body.message
    req.info_request_details = body.missing_documents
    req.info_request_submitted_at = datetime.now(timezone.utc)
    req.human_review_requested = False
    db.commit()
    db.refresh(req)

    log_action(db, user_id=user.id, user_email=user.email, user_role=user.role,
               action="request_info", resource_type="pa_request", resource_id=req.id,
               detail=f"Requested info: {body.message[:200]}. Missing: {', '.join(body.missing_documents)}")

    from ..models.user import User as UserModel
    from .notifications import create_notification
    hospital_user = db.query(UserModel).filter(UserModel.id == req.user_id).first()
    if hospital_user and hospital_user.hospital:
        hospital_users = db.query(UserModel).filter(
            UserModel.role == "hospital", UserModel.hospital == hospital_user.hospital,
        ).all()
        for h in hospital_users:
            create_notification(db, h.id,
                title="Additional Information Requested",
                message=f"Insurer requested information for {req.request_code}: {body.message[:200]}",
                notification_type="info_requested", request_id=req.id)
    db.commit()
    return req


# ── Resubmit (Hospital responds to info request) ─────────────────────────────

@router.post("/{request_id}/resubmit", response_model=PARequestOut)
def resubmit_request(
    request_id: int,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "hospital" or not user.can_submit:
        raise HTTPException(403, "Only hospital users with submit permission can resubmit")

    req = db.get(PARequest, request_id)
    if not req:
        raise HTTPException(404, "Not found")

    if user.hospital:
        hospital_user_ids = [
            u.id for u in db.query(User).filter(
                User.role == "hospital", User.hospital == user.hospital
            ).all()
        ]
        if req.user_id not in hospital_user_ids:
            raise HTTPException(403, "Access denied")
    else:
        raise HTTPException(403, "Access denied")

    if req.status != "requires_information":
        raise HTTPException(400, "Request is not in requires_information status")

    req.status = "resubmitted"
    req.resubmitted_at = datetime.now(timezone.utc)
    req.info_request_message = None
    req.info_request_details = []
    db.commit()
    db.refresh(req)

    log_action(db, user_id=user.id, user_email=user.email, user_role=user.role,
               action="resubmit", resource_type="pa_request", resource_id=req.id,
               detail=f"Resubmitted PA request {req.request_code}")

    bg.add_task(_process_in_bg, req.id)

    from ..models.user import User as UserModel
    from .notifications import create_notification
    insurer_users = db.query(UserModel).filter(
        UserModel.role == "insurer", UserModel.company_name == req.insurance_provider,
    ).all()
    for ins in insurer_users:
        create_notification(db, ins.id,
            title="Request Resubmitted",
            message=f"Hospital resubmitted {req.request_code} with additional information.",
            notification_type="decision", request_id=req.id)
    db.commit()
    return req


# ── Appeal ───────────────────────────────────────────────────────────────────

class AppealIn(BaseModel):
    reason: str
    additional_explanation: str = ""


@router.post("/{request_id}/appeal", response_model=PARequestOut)
def submit_appeal(
    request_id: int,
    body: AppealIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "hospital" or not user.can_submit:
        raise HTTPException(403, "Only hospital users with submit permission can appeal")

    req = db.get(PARequest, request_id)
    if not req:
        raise HTTPException(404, "Not found")

    if user.hospital:
        hospital_user_ids = [
            u.id for u in db.query(User).filter(
                User.role == "hospital", User.hospital == user.hospital
            ).all()
        ]
        if req.user_id not in hospital_user_ids:
            raise HTTPException(403, "Access denied")
    else:
        raise HTTPException(403, "Access denied")

    if req.status not in ("rejected", "denied"):
        raise HTTPException(400, "Can only appeal denied requests")

    req.appeal_status = "submitted"
    req.appeal_reason = body.reason
    req.appeal_additional_explanation = body.additional_explanation
    req.appeal_submitted_at = datetime.now(timezone.utc)
    req.status = "appeal_submitted"
    db.commit()
    db.refresh(req)

    log_action(db, user_id=user.id, user_email=user.email, user_role=user.role,
               action="appeal", resource_type="pa_request", resource_id=req.id,
               detail=f"Appeal submitted: {body.reason[:200]}")

    from ..models.user import User as UserModel
    from .notifications import create_notification
    insurer_users = db.query(UserModel).filter(
        UserModel.role == "insurer", UserModel.company_name == req.insurance_provider,
    ).all()
    for ins in insurer_users:
        create_notification(db, ins.id,
            title="Appeal Submitted",
            message=f"Appeal for {req.request_code}: {body.reason[:200]}",
            notification_type="appeal", request_id=req.id)
    db.commit()
    return req


# ── Review Appeal (Insurer) ─────────────────────────────────────────────────

class AppealReviewIn(BaseModel):
    decision: str  # appeal_approved | appeal_rejected
    notes: str = ""


@router.post("/{request_id}/review-appeal", response_model=PARequestOut)
def review_appeal(
    request_id: int,
    body: AppealReviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "insurer":
        raise HTTPException(403, "Only insurers can review appeals")
    if not user.is_verified:
        raise HTTPException(403, "Account pending verification")

    req = db.get(PARequest, request_id)
    if not req:
        raise HTTPException(404, "Not found")
    if req.insurance_provider != user.company_name:
        raise HTTPException(403, "Access denied")

    if req.appeal_status != "submitted":
        raise HTTPException(400, "No pending appeal for this request")

    valid = {"appeal_approved", "appeal_rejected"}
    if body.decision not in valid:
        raise HTTPException(400, f"Decision must be one of: {', '.join(valid)}")

    req.appeal_status = body.decision.replace("appeal_", "")
    req.appeal_reviewer_id = user.id
    req.appeal_reviewer_notes = body.notes
    req.appeal_reviewed_at = datetime.now(timezone.utc)

    if body.decision == "appeal_approved":
        req.status = "approved"
        req.decision = "approved"
    else:
        req.status = "appeal_rejected"

    db.commit()
    db.refresh(req)

    log_action(db, user_id=user.id, user_email=user.email, user_role=user.role,
               action="review_appeal", resource_type="pa_request", resource_id=req.id,
               detail=f"Appeal {body.decision}: {body.notes[:200]}")

    from ..models.user import User as UserModel
    from .notifications import create_notification
    hospital_user = db.query(UserModel).filter(UserModel.id == req.user_id).first()
    if hospital_user and hospital_user.hospital:
        hospital_users = db.query(UserModel).filter(
            UserModel.role == "hospital", UserModel.hospital == hospital_user.hospital,
        ).all()
        for h in hospital_users:
            create_notification(db, h.id,
                title=f"Appeal {body.decision.replace('appeal_', '').title()}",
                message=f"Your appeal for {req.request_code} has been {body.decision.replace('appeal_', '')}.",
                notification_type="appeal", request_id=req.id)
    db.commit()
    return req


# ── Insurer Decision (Approve/Deny/Partial) ─────────────────────────────────

class InsurerDecisionIn(BaseModel):
    decision: str  # approved | denied | partially_approved
    reason: str = ""
    approved_amount_inr: float | None = None


@router.post("/{request_id}/insurer-decision", response_model=PARequestOut)
def insurer_decision(
    request_id: int,
    body: InsurerDecisionIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "insurer":
        raise HTTPException(403, "Only insurers can make decisions")
    if not user.is_verified:
        raise HTTPException(403, "Account pending verification")

    req = db.get(PARequest, request_id)
    if not req:
        raise HTTPException(404, "Not found")
    if req.insurance_provider != user.company_name:
        raise HTTPException(403, "Access denied")

    valid = {"approved", "denied", "partially_approved"}
    if body.decision not in valid:
        raise HTTPException(400, f"Decision must be one of: {', '.join(valid)}")

    req.decision = body.decision
    req.human_reviewer_id = user.id
    req.human_review_notes = body.reason
    req.human_review_decision = body.decision
    req.human_reviewed_at = datetime.now(timezone.utc)
    req.human_review_requested = False

    if body.decision == "approved":
        req.status = "approved"
        req.approval_reasons = [body.reason] if body.reason else req.approval_reasons
        req.payment_status = "pending_insurer_approval"
    elif body.decision == "denied":
        req.status = "rejected"
        req.denial_reasons = [body.reason] if body.reason else req.denial_reasons
    elif body.decision == "partially_approved":
        req.status = "partially_approved"
        if body.approved_amount_inr is not None:
            req.approved_amount_inr = body.approved_amount_inr
        req.approval_reasons = [body.reason] if body.reason else req.approval_reasons
        req.payment_status = "pending_insurer_approval"

    db.commit()
    db.refresh(req)

    log_action(db, user_id=user.id, user_email=user.email, user_role=user.role,
               action="insurer_decision", resource_type="pa_request", resource_id=req.id,
               detail=f"Insurer decision: {body.decision}. Reason: {body.reason[:200]}")

    from ..models.user import User as UserModel
    from .notifications import create_notification
    hospital_user = db.query(UserModel).filter(UserModel.id == req.user_id).first()
    if hospital_user and hospital_user.hospital:
        hospital_users = db.query(UserModel).filter(
            UserModel.role == "hospital", UserModel.hospital == hospital_user.hospital,
        ).all()
        for h in hospital_users:
            create_notification(db, h.id,
                title=f"PA Request {body.decision.replace('_', ' ').title()}",
                message=f"Your PA request {req.request_code} has been {body.decision.replace('_', ' ')}.",
                notification_type="decision", request_id=req.id)
    db.commit()
    return req
