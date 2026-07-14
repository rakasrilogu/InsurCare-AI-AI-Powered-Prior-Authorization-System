from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Float, func
from sqlalchemy.orm import relationship
from ..database import Base

class AgentRun(Base):
    __tablename__ = "agent_runs"
    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("pa_requests.id", ondelete="CASCADE"), nullable=False)
    agent_id = Column(String(50), nullable=False)  # intake|eligibility|policy|risk|decision|communication
    status = Column(String(50), default="idle")  # idle|active|completed|error
    output = Column(Text, nullable=True)
    details = Column(JSON, default=dict)
    confidence = Column(Float, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    request = relationship("PARequest", back_populates="agent_runs")
