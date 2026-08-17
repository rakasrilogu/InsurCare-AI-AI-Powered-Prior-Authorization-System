from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, func
from ..database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    request_id = Column(Integer, ForeignKey("pa_requests.id"), nullable=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    notification_type = Column(String(50), nullable=False)  # submitted|processing|info_requested|decision|payment|appeal|dispute
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
