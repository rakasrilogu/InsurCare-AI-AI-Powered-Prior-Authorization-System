from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User
from ..models.refresh_token import RefreshToken
from ..schemas.auth import SignupIn, LoginIn, RefreshTokenIn, TokenOut, UserOut, VALID_INSURERS
from ..security import hash_password, verify_password, create_access_token, get_current_user
from datetime import datetime, timezone
import time
from collections import defaultdict
from threading import Lock

router = APIRouter(prefix="/api/auth", tags=["auth"])

VALID_ROLES = {"hospital", "insurer"}

# ── Auth endpoint rate limiting ────────────────────────────────────────────────
AUTH_RATE_LIMIT_WINDOW = 60
AUTH_RATE_LIMIT_MAX = 10
_auth_rate_store: dict[str, list[float]] = defaultdict(list)
_auth_rate_lock = Lock()

def _check_auth_rate_limit(key: str):
    now = time.time()
    with _auth_rate_lock:
        timestamps = _auth_rate_store[key]
        _auth_rate_store[key] = [t for t in timestamps if now - t < AUTH_RATE_LIMIT_WINDOW]
        if len(_auth_rate_store[key]) >= AUTH_RATE_LIMIT_MAX:
            raise HTTPException(429, "Too many requests. Please try again later.")
        _auth_rate_store[key].append(now)

def _issue_tokens(user: User, db: Session) -> dict:
    access = create_access_token(str(user.id), {"role": user.role, "can_submit": user.can_submit})
    refresh_token_str = RefreshToken.generate(user.id)
    db.add(RefreshToken(
        user_id=user.id, token=refresh_token_str,
        expires_at=RefreshToken.expires(),
    ))
    db.commit()
    return {"access_token": access, "refresh_token": refresh_token_str, "token_type": "bearer"}

@router.post("/signup", response_model=TokenOut, status_code=201)
def signup(data: SignupIn, db: Session = Depends(get_db)):
    _check_auth_rate_limit(f"signup:{data.email}")
    if data.password != data.confirm_password:
        raise HTTPException(400, "Passwords do not match")
    if len(data.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if data.role not in VALID_ROLES:
        raise HTTPException(400, f"Role must be one of: {', '.join(VALID_ROLES)}")

    if data.role == "insurer" and not data.company_name:
        raise HTTPException(400, "Insurance company name is required for insurer role")
    if data.role == "insurer" and data.company_name not in VALID_INSURERS:
        raise HTTPException(400, f"Invalid insurance company. Must be one of: {', '.join(sorted(VALID_INSURERS))}")
    if data.role == "hospital" and not data.hospital:
        raise HTTPException(400, "Hospital name is required for hospital role")

    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(400, "Email already registered")

    user = User(
        email=data.email,
        full_name=data.full_name,
        role=data.role,
        can_submit=data.can_submit,
        hospital=data.hospital,
        company_name=data.company_name,
        specialization=data.specialization,
        hashed_password=hash_password(data.password),
    )
    db.add(user); db.commit(); db.refresh(user)
    return TokenOut(**(_issue_tokens(user, db)))

@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, db: Session = Depends(get_db)):
    _check_auth_rate_limit(f"login:{data.email}")
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    return TokenOut(**(_issue_tokens(user, db)))

@router.post("/refresh", response_model=TokenOut)
def refresh(data: RefreshTokenIn, db: Session = Depends(get_db)):
    _check_auth_rate_limit("refresh")
    rt = db.query(RefreshToken).filter(
        RefreshToken.token == data.refresh_token,
        RefreshToken.revoked == False,
        RefreshToken.expires_at > datetime.now(timezone.utc),
    ).first()
    if not rt:
        raise HTTPException(401, "Invalid or expired refresh token")
    rt.revoked = True
    user = db.get(User, rt.user_id)
    if not user:
        raise HTTPException(401, "User not found")
    result = _issue_tokens(user, db)
    return TokenOut(**result)

@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
