from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Date
from ..database import get_db
from ..models.pa_request import PARequest
from ..models.user import User
from ..security import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _role_filter(q, user, db):
    """Apply role-based visibility filter to a PARequest query."""
    if user.role == "hospital":
        if user.hospital:
            hospital_user_ids = [
                u.id for u in db.query(User).filter(
                    User.role == "hospital",
                    User.hospital == user.hospital
                ).all()
            ]
            return q.filter(PARequest.user_id.in_(hospital_user_ids)) if hospital_user_ids else q.filter(False)
        return q.filter(False)
    elif user.role == "insurer":
        if user.company_name:
            return q.filter(PARequest.insurance_provider == user.company_name)
        return q.filter(False)
    return q.filter(False)


@router.get("/summary")
def summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = _role_filter(db.query(PARequest), user, db)

    total     = q.count()
    by_status = dict(q.with_entities(PARequest.status, func.count()).group_by(PARequest.status).all())
    avg_conf  = q.with_entities(func.avg(PARequest.confidence_score)).scalar() or 0
    avg_risk  = q.with_entities(func.avg(PARequest.risk_score)).scalar() or 0

    return {
        "total_requests": total,
        "by_status":      by_status,
        "avg_confidence": round(float(avg_conf), 2),
        "avg_risk":       round(float(avg_risk), 2),
    }


@router.get("/weekly")
def weekly(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Returns per-day decision counts for the past 7 days (today inclusive).
    Shape: [{ day: "Mon", approved: N, denied: N, review: N }, ...]
    """
    now   = datetime.now(timezone.utc)
    start = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)

    q = _role_filter(db.query(PARequest), user, db)
    rows = (
        q
        .filter(PARequest.created_at >= start)
        .with_entities(
            func.date(PARequest.created_at).label("day"),
            PARequest.status,
            func.count().label("cnt"),
        )
        .group_by("day", PARequest.status)
        .all()
    )

    # Build a dict keyed by date string
    counts: dict[str, dict] = {}
    for row in rows:
        d = str(row.day)
        if d not in counts:
            counts[d] = {"approved": 0, "denied": 0, "review": 0}
        status = row.status
        if status == "approved":
            counts[d]["approved"] += row.cnt
        elif status in ("rejected", "denied"):
            counts[d]["denied"] += row.cnt
        elif status in ("escalated", "processing", "pending"):
            counts[d]["review"] += row.cnt

    # Fill in all 7 days so the chart always shows a full week
    DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    result = []
    for i in range(7):
        date = (start + timedelta(days=i)).date()
        key  = str(date)
        day_label = DAY_ABBR[date.weekday()]
        entry = counts.get(key, {"approved": 0, "denied": 0, "review": 0})
        result.append({"day": day_label, **entry})

    return result
