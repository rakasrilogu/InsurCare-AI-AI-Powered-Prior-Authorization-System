from sqlalchemy.orm import Session
from ..models.audit_log import AuditLog


def log_action(
    db: Session,
    *,
    user_id: int | None = None,
    user_email: str | None = None,
    user_role: str | None = None,
    action: str,
    resource_type: str,
    resource_id: int | None = None,
    detail: str | None = None,
    ip_address: str | None = None,
):
    entry = AuditLog(
        user_id=user_id,
        user_email=user_email,
        user_role=user_role,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail,
        ip_address=ip_address,
    )
    db.add(entry)
    db.flush()
    return entry
