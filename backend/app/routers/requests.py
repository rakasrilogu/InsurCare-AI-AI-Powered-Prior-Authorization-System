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
