from pydantic import BaseModel
from datetime import datetime
from typing import Any, Optional

class PARequestCreate(BaseModel):
    patient_name: str
    patient_id: str
    patient_age: int
    patient_gender: str

    insurance_provider: str
    policy_number: str
    plan_name: Optional[str] = None
    sum_insured: Optional[float] = None
    deductible: Optional[float] = None
    coverage_pct: Optional[float] = None
    valid_until: Optional[str] = None

    procedure_name: str
    procedure_code: str
    procedure_code_cpt: Optional[str] = None
    diagnosis: Optional[str] = None
    diagnosis_code_icd10: Optional[str] = None
    secondary_diagnoses_icd10: list[str] = []
    clinical_justification: str
    documents: list[str] = []

class AgentRunOut(BaseModel):
    id: int
    agent_id: str
    status: str
    output: str | None = None
    details: dict[str, Any] | None = None
    confidence: float | None = None
    duration_ms: int | None = None
    started_at: datetime
    completed_at: datetime | None = None
    class Config:
        from_attributes = True

class PARequestOut(BaseModel):
    id: int
    request_code: str
    patient_name: str
    patient_id: str
    patient_age: int
    patient_gender: str
    insurance_provider: str
    policy_number: str
    plan_name: Optional[str] = None
    sum_insured: Optional[float] = None
    deductible: Optional[float] = None
    coverage_pct: Optional[float] = None
    valid_until: Optional[str] = None
    procedure_name: str
    procedure_code: str
    procedure_code_cpt: str | None = None
    diagnosis: str | None
    diagnosis_code_icd10: str | None = None
    secondary_diagnoses_icd10: list[str] = []
    clinical_justification: str
    documents: list[str]
    status: str
    decision: str | None
    confidence_score: float | None
    risk_score: float | None
    final_summary: str | None

    approved_amount_inr: float | None = None
    coverage_percentage: float | None = None
    approval_reasons: list[str] = []
    denial_reasons: list[str] = []
    policy_clauses_cited: list[str] = []
    next_steps: list[str] = []
    appeal_pathway: str | None = None
    doctor_recommendation: str | None = None
    plain_english_summary: str | None = None

    payment_status: str = "not_applicable"
    transaction_id: str | None = None
    disbursed_amount_inr: float | None = None
    paid_at: datetime | None = None
    disputed: bool = False
    dispute_reason: str | None = None

    created_at: datetime
    updated_at: datetime
    agent_runs: list[AgentRunOut] = []
    class Config:
        from_attributes = True
