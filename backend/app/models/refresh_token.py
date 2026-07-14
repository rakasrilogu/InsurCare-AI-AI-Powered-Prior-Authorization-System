import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, func
from ..database import Base

REFRESH_TOKEN_EXPIRE_DAYS = 30

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    token      = Column(String(255), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked    = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    @staticmethod
    def generate(user_id: int) -> str:
        return uuid.uuid4().hex + uuid.uuid4().hex

    @staticmethod
    def expires() -> datetime:
        return datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
