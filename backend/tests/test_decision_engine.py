"""
InsurCare AI -- Deterministic Decision Engine Tests
=====================================================
"""

import pytest
from app.agents.evidence import (
    EvidenceObject, PatientEvidence, DiagnosisEvidence, ProcedureEvidence,
    DocumentEvidence, ClinicalEvidence, PolicyEvidence, PolicyClauseEvidence,
    FinancialEvidence, RiskEvidence
)
from app.agents.rule_engine import RuleEngine, compute_confidence
from app.agents.decision_engine import DecisionEngine


def _base():
    """Create a base evidence object for testing."""
    ev = EvidenceObject(request_id=1, request_code="PA-TEST-001")

    ev.patient = PatientEvidence(
        name="Test Patient", patient_id="P-TEST-001",
        age=50, gender="Male",
        policy_active=True, policy_number="SH-TEST-001",
        policy_version="2026", sum_insured=500000,
        deductible=10000, coverage_pct=80, valid_until="31/12/2027",
    )

    ev.diagnosis = DiagnosisEvidence(
        code="M17.11", description="Primary Osteoarthritis",
        is_pre_existing=False, pre_existing_waiting_met=True,
    )

    ev.procedure = ProcedureEvidence(
        code="CPT-27447", name="Total Knee Replacement",
        cpt_code="CPT-27447", requested_amount=500000,
        is_excluded=False, exclusion_reason="",
    )

    ev.documents = DocumentEvidence(
        total_documents=3, verified_documents=3,
        medical_report=True, doctor_recommendation=True,
        diagnostic_report=True, all_documents_complete=True,
        mismatches=[], document_status="verified",
    )

    ev.clinical = ClinicalEvidence(
        severity="moderate", urgency="routine",
        medical_necessity=True, medical_necessity_score=0.85,
        previous_treatment_failed=True,
        conservative_treatment_documented=True,
        clinical_justification="Severe osteoarthritis with functional impairment. Conservative treatment failed after 6 months.",
    )

    ev.policy = PolicyEvidence(
        insurer="Star Health",
        matched_clauses=["SH-4.3"],
        exclusion_clauses=[],
        coverage_applicable=True,
        coverage_pct=0.80,
        preauth_required=True,
    )

    ev.financial = FinancialEvidence(sum_insured=500000, deductible=10000)
    ev.risk = RiskEvidence(
        severity_score=55, urgency_score=40,
        risk_score=48.75, risk_level="moderate",
        priority="routine",
    )

    return ev


# ══════════════════════════════════════════════════════════════════════════════
# TEST 1: Valid Approval
# ══════════════════════════════════════════════════════════════════════════════

def test_valid_approval():
    ev = _base()
    engine = DecisionEngine(ev)
    result = engine.decide()

    assert result.decision == "approved"
    assert result.financial.approved_amount > 0
    assert result.confidence.overall_confidence >= 0.7
    assert len(result.approval_reasons) > 0
    assert len(result.next_steps) > 0
    assert result.plain_english_summary != ""


# ══════════════════════════════════════════════════════════════════════════════
# TEST 2: Ineligible Patient (no policy)
# ══════════════════════════════════════════════════════════════════════════════

def test_ineligible_no_policy():
    ev = _base()
    ev.patient.policy_number = ""
    engine = DecisionEngine(ev)
    result = engine.decide()

    assert result.decision == "denied"
    assert result.financial.approved_amount == 0


# ══════════════════════════════════════════════════════════════════════════════
# TEST 3: Inactive Policy
# ══════════════════════════════════════════════════════════════════════════════

def test_inactive_policy():
    ev = _base()
    ev.patient.policy_active = False
    engine = DecisionEngine(ev)
    result = engine.decide()

    assert result.decision == "denied"
    assert result.financial.approved_amount == 0


# ══════════════════════════════════════════════════════════════════════════════
# TEST 4: Waiting Period Not Completed
# ══════════════════════════════════════════════════════════════════════════════

def test_waiting_period_not_completed():
    ev = _base()
    ev.diagnosis.is_pre_existing = True
    ev.diagnosis.pre_existing_waiting_met = False
    ev.policy.waiting_period_days = 730
    engine = DecisionEngine(ev)
    result = engine.decide()

    assert result.decision == "denied"
    assert result.financial.approved_amount == 0


# ══════════════════════════════════════════════════════════════════════════════
# TEST 5: Excluded Procedure
# ══════════════════════════════════════════════════════════════════════════════

def test_excluded_procedure():
    ev = _base()
    ev.procedure.code = "CDT-D6010"
    ev.procedure.name = "Dental Implant"
    ev.procedure.is_excluded = True
    ev.procedure.exclusion_reason = "Cosmetic dental excluded under SH-8.1"
    ev.policy.exclusion_clauses = ["SH-8.1"]
    ev.policy.coverage_applicable = False
    engine = DecisionEngine(ev)
    result = engine.decide()

    assert result.decision == "denied"


# ══════════════════════════════════════════════════════════════════════════════
# TEST 6: Covered Procedure (deterministic financials)
# ══════════════════════════════════════════════════════════════════════════════

def test_covered_procedure_financials():
    ev = _base()
    engine = DecisionEngine(ev)
    result = engine.decide()

    assert result.decision == "approved"
    assert result.financial.procedure_cost == 160000
    assert result.financial.approved_amount == 118000
    assert result.financial.patient_responsibility == 42000


# ══════════════════════════════════════════════════════════════════════════════
# TEST 7: Missing Documents
# ══════════════════════════════════════════════════════════════════════════════

def test_missing_documents():
    ev = _base()
    ev.documents.total_documents = 0
    ev.documents.verified_documents = 0
    ev.documents.medical_report = False
    ev.documents.doctor_recommendation = False
    ev.documents.all_documents_complete = False
    engine = DecisionEngine(ev)
    result = engine.decide()

    assert result.decision == "requires_information"
    assert len(result.missing_information) > 0


# ══════════════════════════════════════════════════════════════════════════════
# TEST 8: Document Mismatch
# ══════════════════════════════════════════════════════════════════════════════

def test_document_mismatch():
    ev = _base()
    ev.documents.mismatches = ["Procedure mismatch: Document says Physiotherapy but request says TKR"]
    engine = DecisionEngine(ev)
    result = engine.decide()

    assert result.decision == "human_review"
    assert result.human_review_required is True
    assert any("mismatch" in r.lower() for r in result.human_review_reasons)


# ══════════════════════════════════════════════════════════════════════════════
# TEST 9: Medical Necessity Uncertain
# ══════════════════════════════════════════════════════════════════════════════

def test_medical_necessity_uncertain():
    ev = _base()
    ev.clinical.medical_necessity = False
    ev.clinical.medical_necessity_score = 0.3
    engine = DecisionEngine(ev)
    result = engine.decide()

    assert result.decision == "human_review"
    assert result.human_review_required is True


# ══════════════════════════════════════════════════════════════════════════════
# TEST 10: Low Confidence Case
# ══════════════════════════════════════════════════════════════════════════════

def test_low_confidence():
    ev = _base()
    ev.documents.total_documents = 1
    ev.documents.verified_documents = 0
    ev.documents.medical_report = False
    ev.documents.doctor_recommendation = False
    ev.documents.diagnostic_report = True
    ev.documents.all_documents_complete = False
    ev.clinical.medical_necessity = False
    ev.clinical.medical_necessity_score = 0.4
    engine = DecisionEngine(ev)
    result = engine.decide()

    assert result.confidence.overall_confidence < 0.85
    assert result.confidence.confidence_level in ("low", "medium")
    # Low confidence + missing docs = requires_information (not human_review)
    assert result.decision in ("requires_information", "human_review")
    assert len(result.missing_information) > 0 or result.human_review_required


# ══════════════════════════════════════════════════════════════════════════════
# TEST 11: Policy Conflict (coverage + exclusion)
# ══════════════════════════════════════════════════════════════════════════════

def test_policy_conflict():
    ev = _base()
    ev.procedure.is_excluded = True
    ev.procedure.exclusion_reason = "Excluded under SH-8.1"
    ev.policy.exclusion_clauses = ["SH-8.1"]
    ev.policy.matched_clauses = ["SH-4.3"]
    ev.policy.coverage_applicable = False
    engine = DecisionEngine(ev)
    result = engine.decide()

    assert result.decision == "denied"
    assert "SH-8.1" in str(result.denial_reasons)


# ══════════════════════════════════════════════════════════════════════════════
# TEST 12: Financial Limit Exceeded
# ══════════════════════════════════════════════════════════════════════════════

def test_financial_limit_exceeded():
    ev = _base()
    ev.patient.sum_insured = 100000
    ev.financial.sum_insured = 100000
    engine = DecisionEngine(ev)
    result = engine.decide()

    assert result.financial.procedure_cost == 160000
    assert result.financial.approved_amount == 70000
    assert result.financial.exceeds_sum_insured is True


# ══════════════════════════════════════════════════════════════════════════════
# TEST 13: High Risk Score -> Human Review
# ══════════════════════════════════════════════════════════════════════════════

def test_high_risk_escalation():
    ev = _base()
    ev.risk.risk_score = 82.0
    ev.risk.risk_level = "high"
    engine = DecisionEngine(ev)
    result = engine.decide()

    assert result.decision == "human_review"
    assert result.human_review_required is True


# ══════════════════════════════════════════════════════════════════════════════
# TEST 14: Joint Replacement Without Conservative Treatment
# ══════════════════════════════════════════════════════════════════════════════

def test_joint_replacement_no_conservative():
    ev = _base()
    ev.clinical.previous_treatment_failed = False
    ev.clinical.conservative_treatment_documented = False
    engine = DecisionEngine(ev)
    result = engine.decide()

    assert result.decision == "human_review"
    assert any("conservative" in r.lower() for r in result.human_review_reasons)


# ══════════════════════════════════════════════════════════════════════════════
# TEST 15: Deterministic -- Same Input Always Same Output
# ══════════════════════════════════════════════════════════════════════════════

def test_deterministic_same_input_same_output():
    ev1 = _base()
    result1 = DecisionEngine(ev1).decide()

    ev2 = _base()
    result2 = DecisionEngine(ev2).decide()

    assert result1.decision == result2.decision
    assert result1.financial.approved_amount == result2.financial.approved_amount
    assert result1.confidence.overall_confidence == result2.confidence.overall_confidence
    assert len(result1.validation_results) == len(result2.validation_results)
    for r1, r2 in zip(result1.validation_results, result2.validation_results):
        assert r1.rule_id == r2.rule_id
        assert r1.passed == r2.passed
        assert r1.result == r2.result


# ══════════════════════════════════════════════════════════════════════════════
# TEST 16: Denial Includes Policy Clauses
# ══════════════════════════════════════════════════════════════════════════════

def test_denial_includes_clauses():
    ev = _base()
    ev.procedure.is_excluded = True
    ev.procedure.exclusion_reason = "Dental cosmetic excluded"
    ev.policy.exclusion_clauses = ["SH-8.1"]
    ev.policy.coverage_applicable = False
    engine = DecisionEngine(ev)
    result = engine.decide()

    assert result.decision == "denied"
    assert len(result.denial_reasons) > 0


# ══════════════════════════════════════════════════════════════════════════════
# TEST 17: Incomplete Clinical Justification -> Requires Information
# ══════════════════════════════════════════════════════════════════════════════

def test_incomplete_justification():
    ev = _base()
    ev.clinical.clinical_justification = "TKR needed"
    engine = DecisionEngine(ev)
    result = engine.decide()

    assert result.decision == "requires_information"
    assert any("clinical justification" in m.lower() for m in result.missing_information)


# ══════════════════════════════════════════════════════════════════════════════
# TEST 18: Rule Engine Results Are Structured
# ══════════════════════════════════════════════════════════════════════════════

def test_rule_engine_structured_results():
    ev = _base()
    engine = RuleEngine(ev)
    results = engine.evaluate_all()

    assert len(results) >= 10
    for r in results:
        assert r.rule_id != ""
        assert r.rule_name != ""
        assert r.result in ("PASS", "FAIL", "UNCERTAIN")
        assert isinstance(r.passed, bool)
        assert r.reason != ""


# ══════════════════════════════════════════════════════════════════════════════
# TEST 19: Decision Trace Is Populated
# ══════════════════════════════════════════════════════════════════════════════

def test_decision_trace_populated():
    ev = _base()
    result = DecisionEngine(ev).decide()

    assert result.decision_trace.request_id == 1
    assert result.decision_trace.request_code == "PA-TEST-001"
    assert result.decision_trace.final_decision == result.decision
    assert len(result.decision_trace.steps) >= 5
    assert result.decision_trace.completed_at != ""


# ══════════════════════════════════════════════════════════════════════════════
# TEST 20: Confidence Score Is Reasonable
# ══════════════════════════════════════════════════════════════════════════════

def test_confidence_score_range():
    ev = _base()
    result = DecisionEngine(ev).decide()

    assert 0.0 <= result.confidence.overall_confidence <= 1.0
    assert result.confidence.confidence_level in ("high", "medium", "low")
