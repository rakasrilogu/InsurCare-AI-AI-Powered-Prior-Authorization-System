from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from ..database import get_db
from ..models.user import User
from ..models.audit_log import AuditLog
from ..models.pa_request import PARequest
from ..security import get_current_user
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

router = APIRouter(prefix="/api/audit", tags=["audit"])


class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int]
    user_email: Optional[str]
    user_role: Optional[str]
    action: str
    resource_type: str
    resource_id: Optional[int]
    detail: Optional[str]
    ip_address: Optional[str]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


@router.get("", response_model=list[AuditLogOut])
def list_audit_logs(
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("insurer", "hospital"):
        raise HTTPException(403, "Only insurers and hospitals can view audit logs")

    q = db.query(AuditLog)

    if user.role == "hospital":
        # Hospital users only see their own actions
        q = q.filter(AuditLog.user_id == user.id)

    elif user.role == "insurer":
        # Insurers only see logs for PA requests that match their company
        my_request_ids = db.query(PARequest.id).filter(
            PARequest.insurance_provider == user.company_name
        ).subquery()
        q = q.filter(
            (AuditLog.resource_type == "pa_request") &
            (AuditLog.resource_id.in_(db.query(my_request_ids)))
        )

    if action:
        q = q.filter(AuditLog.action == action)
    if resource_type:
        q = q.filter(AuditLog.resource_type == resource_type)

    return q.order_by(desc(AuditLog.created_at)).limit(limit).all()
