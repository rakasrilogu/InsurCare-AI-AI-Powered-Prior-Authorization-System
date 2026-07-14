from sqlalchemy import Column, Integer, String, Boolean, DateTime, func
from ..database import Base

class User(Base):
    __tablename__ = "users"
    id              = Column(Integer, primary_key=True, index=True)
    email           = Column(String(255), unique=True, index=True, nullable=False)
    full_name       = Column(String(255), nullable=False)
    role            = Column(String(50),  default="hospital", nullable=False)
    # hospital → hospital name  (can_submit flag controls whether they can submit PA)
    # insurer  → company name   (reviews claims for their company)
    can_submit      = Column(Boolean, default=False, nullable=False)
    hospital        = Column(String(255), nullable=True)   # for hospital
    company_name    = Column(String(255), nullable=True)   # for insurer
    specialization  = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
