"""
Admin endpoints — insurer verification.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User
from ..security import get_current_user

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/verify-insurer/{user_id}")
def verify_insurer(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark an insurer account as verified. Requires authenticated user with hospital admin or insurer role."""
    if current_user.role != "hospital" or not current_user.can_submit:
        raise HTTPException(403, "Only hospital administrators can verify insurer accounts")

    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if target.role != "insurer":
        raise HTTPException(400, "User is not an insurer")
    if target.is_verified:
        return {"message": "Already verified", "user_id": user_id}

    target.is_verified = True
    db.commit()
    return {"message": "Insurer verified", "user_id": user_id, "company_name": target.company_name}
