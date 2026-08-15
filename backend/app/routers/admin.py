"""
Admin endpoints — insurer verification.

TODO: Add admin-role protection (check user.role == "admin" via get_current_user)
once admin users are implemented. Currently unauthenticated for demo purposes.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/verify-insurer/{user_id}")
def verify_insurer(user_id: int, db: Session = Depends(get_db)):
    """Mark an insurer account as verified, enabling payment/dispute actions."""
    # TODO: Protect with admin-role check once admin users exist
    # user: User = Depends(get_current_user)
    # if user.role != "admin":
    #     raise HTTPException(403, "Admin access required")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.role != "insurer":
        raise HTTPException(400, "User is not an insurer")
    if user.is_verified:
        return {"message": "Already verified", "user_id": user_id}

    user.is_verified = True
    db.commit()
    return {"message": "Insurer verified", "user_id": user_id, "company_name": user.company_name}
