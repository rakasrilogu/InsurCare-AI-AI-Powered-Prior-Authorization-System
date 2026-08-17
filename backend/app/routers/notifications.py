"""
InsurCare AI — Notification API
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User
from ..models.notification import Notification
from ..security import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def list_notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Notification).filter(Notification.user_id == user.id)
    if unread_only:
        q = q.filter(Notification.is_read == False)
    return [
        {
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "notification_type": n.notification_type,
            "request_id": n.request_id,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in q.order_by(Notification.created_at.desc()).limit(50).all()
    ]


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    count = db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.is_read == False,
    ).count()
    return {"count": count}


@router.post("/{notification_id}/read")
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    n = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == user.id,
    ).first()
    if not n:
        raise HTTPException(404, "Notification not found")
    n.is_read = True
    db.commit()
    return {"ok": True}


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return {"ok": True}


def create_notification(db: Session, user_id: int, title: str, message: str,
                        notification_type: str, request_id: int = None):
    """Helper to create a notification. Called from other endpoints."""
    n = Notification(
        user_id=user_id,
        request_id=request_id,
        title=title,
        message=message,
        notification_type=notification_type,
    )
    db.add(n)
    db.flush()
    return n
