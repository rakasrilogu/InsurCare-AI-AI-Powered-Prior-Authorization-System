from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional

# Closed list of known insurers — matches the policy_rag.py corpus
VALID_INSURERS = {
    "Star Health",
    "HDFC Ergo",
    "ICICI Lombard",
    "Max Bupa",
    "Bajaj Allianz",
}

class SignupIn(BaseModel):
    email:          EmailStr
    password:       str
    confirm_password: str
    full_name:      str
    role:           str = "hospital"       # hospital | insurer
    can_submit:     bool = False            # hospital users with submit permission
    hospital:       Optional[str] = None    # for hospital role
    company_name:   Optional[str] = None    # for insurer role
    specialization: Optional[str] = None

class LoginIn(BaseModel):
    email:    EmailStr
    password: str

class RefreshTokenIn(BaseModel):
    refresh_token: str

class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type:   str = "bearer"

class UserOut(BaseModel):
    id:             int
    email:          EmailStr
    full_name:      str
    role:           str
    can_submit:     bool = False
    hospital:       Optional[str] = None
    company_name:   Optional[str] = None
    specialization: Optional[str] = None
    is_verified:    bool = False
    created_at:     datetime
    class Config:
        from_attributes = True
