from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Float, Boolean, func
from sqlalchemy.orm import relationship
from ..database import Base

class PARequest(Base):
    __tablename__ = "pa_requests"
    id = Column(Integer, primary_key=True, index=True)
    request_code = Column(String(50), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Patient
    patient_name = Column(String(255), nullable=False)
    patient_id = Column(String(100), nullable=False)
    patient_age = Column(Integer, nullable=False)
    patient_gender = Column(String(20), nullable=False)

    # Insurance (extended)
    insurance_provider = Column(String(100), nullable=False)
    policy_number = Column(String(100), nullable=False)
    plan_name = Column(String(255), nullable=True)
    sum_insured = Column(Float, nullable=True)
    deductible = Column(Float, nullable=True)
    coverage_pct = Column(Float, nullable=True)
    valid_until = Column(String(20), nullable=True)

    # Procedure & Healthcare Standards
    procedure_name = Column(String(255), nullable=False)
    procedure_code = Column(String(100), nullable=False)
    procedure_code_cpt = Column(String(20), nullable=True)
    diagnosis = Column(String(255), nullable=True)
    diagnosis_code_icd10 = Column(String(20), nullable=True)
    secondary_diagnoses_icd10 = Column(JSON, default=list)
    clinical_justification = Column(Text, nullable=False)
    documents = Column(JSON, default=list)

    # Pipeline results
    status = Column(String(50), default="pending", nullable=False)
    decision = Column(String(50), nullable=True)
    confidence_score = Column(Float, nullable=True)
    risk_score = Column(Float, nullable=True)
    final_summary = Column(Text, nullable=True)

    # Explainability
    approved_amount_inr = Column(Float, nullable=True)
    coverage_percentage = Column(Float, nullable=True)
    approval_reasons = Column(JSON, default=list)
    denial_reasons = Column(JSON, default=list)
    policy_clauses_cited = Column(JSON, default=list)
    next_steps = Column(JSON, default=list)
    appeal_pathway = Column(Text, nullable=True)
    doctor_recommendation = Column(Text, nullable=True)
    plain_english_summary = Column(Text, nullable=True)

    # Payment
    payment_status = Column(String(30), default="not_applicable", nullable=False)
    transaction_id = Column(String(50), nullable=True)
    disbursed_amount_inr = Column(Float, nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)

    # Dispute
    disputed = Column(Boolean, default=False, nullable=False)
    dispute_reason = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    agent_runs = relationship("AgentRun", back_populates="request", cascade="all, delete-orphan")
