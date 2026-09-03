"""
InsurCare AI — Structured Evidence Model
=========================================

Centralized evidence structure that every agent and rule engine consumes.
The LLM populates extraction fields; the rule engine validates and decides.
All fields are explicit — no free-text LLM output used for decisions.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime, timezone
import json


# ── Patient Evidence ──────────────────────────────────────────────────────────

@dataclass
class PatientEvidence:
    name: str = ""
    patient_id: str = ""
    age: int = 0
    gender: str = ""
    policy_active: bool = False
    policy_number: str = ""
    policy_version: str = "2026"
    sum_insured: float = 0.0
    deductible: float = 0.0
    coverage_pct: float = 0.0
    valid_until: str = ""
    plan_name: str = ""


# ── Procedure / Diagnosis Evidence ────────────────────────────────────────────

@dataclass
class DiagnosisEvidence:
    code: str = ""
    description: str = ""
    is_pre_existing: bool = False
    pre_existing_waiting_met: bool = True  # default: no PED waiting issue

@dataclass
class ProcedureEvidence:
    code: str = ""
    name: str = ""
    cpt_code: str = ""
    requested_amount: float = 0.0
    estimated_cost: float = 0.0  # from CPT lookup
    is_excluded: bool = False
    exclusion_reason: str = ""


# ── Document Evidence ─────────────────────────────────────────────────────────

@dataclass
class DocumentEvidence:
    total_documents: int = 0
    verified_documents: int = 0
    medical_report: bool = False
    doctor_recommendation: bool = False
    diagnostic_report: bool = False
    lab_results: bool = False
    imaging_results: bool = False
    referral_letter: bool = False
    all_documents_complete: bool = False
    mismatches: list[str] = field(default_factory=list)
    document_status: str = "pending"  # verified | partial | mismatch | pending


# ── Clinical Evidence ─────────────────────────────────────────────────────────

@dataclass
class ClinicalEvidence:
    severity: str = "moderate"        # mild | moderate | severe | critical
    urgency: str = "routine"          # routine | expedited | urgent
    medical_necessity: bool = False
    medical_necessity_score: float = 0.0  # 0-1
    previous_treatment_failed: bool = False
    conservative_treatment_documented: bool = False
    doctor_recommendation: str = ""
    clinical_justification: str = ""
    clinical_findings: list[str] = field(default_factory=list)
    comorbidities: list[str] = field(default_factory=list)
    symptoms: list[str] = field(default_factory=list)


# ── Policy Evidence ───────────────────────────────────────────────────────────

@dataclass
class PolicyClauseEvidence:
    clause_id: str = ""
    policy_id: str = ""
    policy_version: str = ""
    section: str = ""
    text: str = ""
    source_document: str = ""
    clause_type: str = ""    # coverage | exclusion | waiting_period | sub_limit
    covered: bool = False
    coverage_pct: float = 0.0
    deductible_inr: float = 0.0
    sub_limit_inr: float = 0.0
    waiting_days: int = 0
    preauth_required: bool = False
    similarity: float = 0.0

@dataclass
class PolicyEvidence:
    insurer: str = ""
    clauses_retrieved: list[PolicyClauseEvidence] = field(default_factory=list)
    matched_clauses: list[str] = field(default_factory=list)
    exclusion_clauses: list[str] = field(default_factory=list)
    waiting_period_clauses: list[str] = field(default_factory=list)
    coverage_applicable: bool = False
    coverage_pct: float = 0.0
    deductible_inr: float = 0.0
    sub_limit_inr: float = 0.0
    policy_version: str = ""
    waiting_period_days: int = 0
    preauth_required: bool = False


# ── Financial Evidence ────────────────────────────────────────────────────────

@dataclass
class FinancialEvidence:
    procedure_cost: float = 0.0
    sum_insured: float = 0.0
    deductible: float = 0.0
    coverage_pct: float = 0.0
    covered_amount: float = 0.0
    deductible_applied: float = 0.0
    sub_limit_applied: float = 0.0
    approved_amount: float = 0.0
    patient_responsibility: float = 0.0
    exceeds_sum_insured: bool = False
    exceeds_sub_limit: bool = False


# ── Risk Evidence ─────────────────────────────────────────────────────────────

@dataclass
class RiskEvidence:
    severity_score: float = 0.0    # 0-100
    urgency_score: float = 0.0     # 0-100
    comorbidity_score: float = 0.0 # 0-100
    complication_score: float = 0.0 # 0-100
    evidence_quality_score: float = 0.0  # 0-100
    risk_score: float = 0.0        # 0-100
    risk_level: str = "moderate"   # low | moderate | elevated | high
    priority: str = "routine"      # routine | expedited | urgent
    risk_factors: list[str] = field(default_factory=list)
    comorbidities: list[str] = field(default_factory=list)


# ── Validation Result ─────────────────────────────────────────────────────────

@dataclass
class ValidationResult:
    rule_id: str = ""
    rule_name: str = ""
    passed: bool = False
    result: str = ""      # PASS | FAIL | UNCERTAIN
    reason: str = ""
    confidence_impact: float = 0.0  # -0.2 to +0.2
    severity: str = ""    # info | warning | critical


# ── Confidence Evidence ───────────────────────────────────────────────────────

@dataclass
class ConfidenceEvidence:
    document_completeness: float = 0.0    # 0-1
    document_matching: float = 0.0        # 0-1
    policy_retrieval_confidence: float = 0.0  # 0-1
    evidence_consistency: float = 0.0     # 0-1
    medical_evidence_available: float = 0.0  # 0-1
    rule_conflicts: int = 0
    overall_confidence: float = 0.0       # 0-1
    confidence_level: str = "high"        # high | medium | low
    requires_human_review: bool = False
    human_review_reasons: list[str] = field(default_factory=list)


# ── Decision Trace ────────────────────────────────────────────────────────────

@dataclass
class DecisionTraceStep:
    step_id: str = ""
    step_name: str = ""
    status: str = ""    # completed | failed | skipped
    input_data: str = ""
    output_data: str = ""
    duration_ms: int = 0
    timestamp: str = ""

@dataclass
class DecisionTrace:
    request_id: int = 0
    request_code: str = ""
    started_at: str = ""
    completed_at: str = ""
    steps: list[DecisionTraceStep] = field(default_factory=list)
    final_decision: str = ""
    decision_reasons: list[str] = field(default_factory=list)
    confidence: float = 0.0
    human_review_required: bool = False
    total_duration_ms: int = 0


# ── Master Evidence Object ────────────────────────────────────────────────────

@dataclass
class EvidenceObject:
    """The single source of truth for a PA request's evidence."""
    request_id: int = 0
    request_code: str = ""

    patient: PatientEvidence = field(default_factory=PatientEvidence)
    diagnosis: DiagnosisEvidence = field(default_factory=DiagnosisEvidence)
    procedure: ProcedureEvidence = field(default_factory=ProcedureEvidence)
    documents: DocumentEvidence = field(default_factory=DocumentEvidence)
    clinical: ClinicalEvidence = field(default_factory=ClinicalEvidence)
    policy: PolicyEvidence = field(default_factory=PolicyEvidence)
    financial: FinancialEvidence = field(default_factory=FinancialEvidence)
    risk: RiskEvidence = field(default_factory=RiskEvidence)
    confidence: ConfidenceEvidence = field(default_factory=ConfidenceEvidence)

    validation_results: list[ValidationResult] = field(default_factory=list)
    decision_trace: DecisionTrace = field(default_factory=DecisionTrace)

    # Final outputs (populated by Decision Engine)
    decision: str = ""           # approved | denied | requires_information | human_review | partially_approved
    decision_reasons: list[str] = field(default_factory=list)
    denial_reasons: list[str] = field(default_factory=list)
    approval_reasons: list[str] = field(default_factory=list)
    next_steps: list[str] = field(default_factory=list)
    appeal_pathway: str = ""
    missing_information: list[str] = field(default_factory=list)
    human_review_required: bool = False
    human_review_reasons: list[str] = field(default_factory=list)
    plain_english_summary: str = ""
    doctor_recommendation: str = ""

    def to_dict(self) -> dict:
        """Serialize to dict for JSON storage."""
        import dataclasses
        def _convert(obj):
            if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
                return {k: _convert(v) for k, v in dataclasses.asdict(obj).items()}
            elif isinstance(obj, list):
                return [_convert(i) for i in obj]
            return obj
        return _convert(self)

    @classmethod
    def from_dict(cls, data: dict) -> "EvidenceObject":
        """Deserialize from dict."""
        if not data:
            return cls()
        ev = cls()
        ev.request_id = data.get("request_id", 0)
        ev.request_code = data.get("request_code", "")
        ev.decision = data.get("decision", "")
        ev.decision_reasons = data.get("decision_reasons", [])
        ev.denial_reasons = data.get("denial_reasons", [])
        ev.approval_reasons = data.get("approval_reasons", [])
        ev.next_steps = data.get("next_steps", [])
        ev.appeal_pathway = data.get("appeal_pathway", "")
        ev.missing_information = data.get("missing_information", [])
        ev.human_review_required = data.get("human_review_required", False)
        ev.human_review_reasons = data.get("human_review_reasons", [])
        ev.plain_english_summary = data.get("plain_english_summary", "")
        ev.doctor_recommendation = data.get("doctor_recommendation", "")
        return ev
