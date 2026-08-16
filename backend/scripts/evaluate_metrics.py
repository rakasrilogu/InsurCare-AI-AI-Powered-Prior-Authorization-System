"""
InsurCare AI — Evaluation Metrics
===================================
Generates metrics from actual test cases and stored decision data.
Run with: python -m scripts.evaluate_metrics
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agents.evidence import EvidenceObject, PatientEvidence, DiagnosisEvidence, ProcedureEvidence, DocumentEvidence, ClinicalEvidence, PolicyEvidence, FinancialEvidence, RiskEvidence
from app.agents.decision_engine import DecisionEngine
from app.agents.rule_engine import RuleEngine
import json, time


# ══════════════════════════════════════════════════════════════════════════════
# TEST SCENARIOS
# ══════════════════════════════════════════════════════════════════════════════

SCENARIOS = [
    {
        "name": "Valid Approval — TKR",
        "expected": "approved",
        "setup": lambda ev: None,
    },
    {
        "name": "Ineligible — No Policy",
        "expected": "denied",
        "setup": lambda ev: setattr(ev.patient, "policy_number", ""),
    },
    {
        "name": "Ineligible — Inactive Policy",
        "expected": "denied",
        "setup": lambda ev: setattr(ev.patient, "policy_active", False),
    },
    {
        "name": "Waiting Period Not Met",
        "expected": "denied",
        "setup": lambda ev: (setattr(ev.diagnosis, "is_pre_existing", True),
                             setattr(ev.diagnosis, "pre_existing_waiting_met", False),
                             setattr(ev.policy, "waiting_period_days", 730)),
    },
    {
        "name": "Excluded Procedure — Dental",
        "expected": "denied",
        "setup": lambda ev: (setattr(ev.procedure, "is_excluded", True),
                             setattr(ev.procedure, "exclusion_reason", "Cosmetic dental excluded"),
                             setattr(ev.policy, "exclusion_clauses", ["SH-8.1"]),
                             setattr(ev.policy, "coverage_applicable", False)),
    },
    {
        "name": "Missing Documents",
        "expected": "requires_information",
        "setup": lambda ev: (setattr(ev.documents, "total_documents", 0),
                             setattr(ev.documents, "verified_documents", 0),
                             setattr(ev.documents, "medical_report", False),
                             setattr(ev.documents, "doctor_recommendation", False),
                             setattr(ev.documents, "all_documents_complete", False)),
    },
    {
        "name": "Document Mismatch",
        "expected": "human_review",
        "setup": lambda ev: setattr(ev.documents, "mismatches", ["Procedure mismatch"]),
    },
    {
        "name": "Medical Necessity Uncertain",
        "expected": "human_review",
        "setup": lambda ev: (setattr(ev.clinical, "medical_necessity", False),
                             setattr(ev.clinical, "medical_necessity_score", 0.3)),
    },
    {
        "name": "High Risk Score",
        "expected": "human_review",
        "setup": lambda ev: (setattr(ev.risk, "risk_score", 82.0),
                             setattr(ev.risk, "risk_level", "high")),
    },
    {
        "name": "Joint Replacement Without Conservative Treatment",
        "expected": "human_review",
        "setup": lambda ev: (setattr(ev.clinical, "previous_treatment_failed", False),
                             setattr(ev.clinical, "conservative_treatment_documented", False)),
    },
    {
        "name": "Incomplete Clinical Justification",
        "expected": "requires_information",
        "setup": lambda ev: setattr(ev.clinical, "clinical_justification", "TKR"),
    },
    {
        "name": "Financial Limit Exceeded",
        "expected": "approved",
        "setup": lambda ev: (setattr(ev.patient, "sum_insured", 100000),
                             setattr(ev.financial, "sum_insured", 100000)),
    },
]


def _base_evidence():
    ev = EvidenceObject(request_id=1, request_code="EVAL-001")
    ev.patient = PatientEvidence(
        name="Eval Patient", patient_id="P-EVAL-001", age=50, gender="Male",
        policy_active=True, policy_number="SH-EVAL-001", policy_version="2026",
        sum_insured=500000, deductible=10000, coverage_pct=80,
    )
    ev.diagnosis = DiagnosisEvidence(code="M17.11", description="Osteoarthritis")
    ev.procedure = ProcedureEvidence(code="CPT-27447", name="Total Knee Replacement")
    ev.documents = DocumentEvidence(
        total_documents=3, verified_documents=3, medical_report=True,
        doctor_recommendation=True, diagnostic_report=True,
        all_documents_complete=True, document_status="verified",
    )
    ev.clinical = ClinicalEvidence(
        severity="moderate", medical_necessity=True, medical_necessity_score=0.85,
        previous_treatment_failed=True, conservative_treatment_documented=True,
        clinical_justification="Severe osteoarthritis. Conservative treatment failed after 6 months.",
    )
    ev.policy = PolicyEvidence(
        insurer="Star Health", matched_clauses=["SH-4.3"],
        coverage_applicable=True, coverage_pct=0.80, preauth_required=True,
    )
    ev.financial = FinancialEvidence(sum_insured=500000, deductible=10000)
    ev.risk = RiskEvidence(severity_score=55, urgency_score=40, risk_score=48.75, risk_level="moderate", priority="routine")
    return ev


def run_evaluation():
    results = []
    correct = 0
    total = len(SCENARIOS)
    decision_times = []

    for scenario in SCENARIOS:
        ev = _base_evidence()
        scenario["setup"](ev)

        t0 = time.time()
        engine = DecisionEngine(ev)
        result = engine.decide()
        elapsed_ms = (time.time() - t0) * 1000
        decision_times.append(elapsed_ms)

        expected = scenario["expected"]
        actual = result.decision
        passed = actual == expected
        if passed:
            correct += 1

        results.append({
            "name": scenario["name"],
            "expected": expected,
            "actual": actual,
            "passed": passed,
            "confidence": result.confidence.overall_confidence,
            "approved_amount": result.financial.approved_amount,
            "human_review": result.human_review_required,
            "rules_evaluated": len(result.validation_results),
            "decision_ms": round(elapsed_ms, 1),
        })

    # Compute metrics
    approved_results = [r for r in results if r["actual"] == "approved"]
    denied_results = [r for r in results if r["actual"] == "denied"]
    human_review_results = [r for r in results if r["actual"] == "human_review"]
    requires_info_results = [r for r in results if r["actual"] == "requires_information"]

    metrics = {
        "total_scenarios": total,
        "correct_decisions": correct,
        "decision_accuracy": round(correct / total, 3) if total > 0 else 0,
        "avg_confidence": round(sum(r["confidence"] for r in results) / total, 3) if total > 0 else 0,
        "avg_decision_time_ms": round(sum(decision_times) / total, 1) if total > 0 else 0,
        "decisions_by_type": {
            "approved": len(approved_results),
            "denied": len(denied_results),
            "human_review": len(human_review_results),
            "requires_information": len(requires_info_results),
        },
        "human_escalation_rate": round(len(human_review_results) / total, 3) if total > 0 else 0,
        "auto_decision_rate": round((len(approved_results) + len(denied_results)) / total, 3) if total > 0 else 0,
        "results": results,
    }

    return metrics


if __name__ == "__main__":
    print("InsurCare AI — Evaluation Metrics\n" + "=" * 60)
    metrics = run_evaluation()

    print(f"\nDecision Accuracy:  {metrics['decision_accuracy']:.1%} ({metrics['correct_decisions']}/{metrics['total_scenarios']})")
    print(f"Avg Confidence:     {metrics['avg_confidence']:.1%}")
    print(f"Avg Decision Time:  {metrics['avg_decision_time_ms']:.1f}ms")
    print(f"Human Escalation:   {metrics['human_escalation_rate']:.1%}")
    print(f"Auto Decision Rate: {metrics['auto_decision_rate']:.1%}")
    print(f"\nDecisions: {metrics['decisions_by_type']}")

    print(f"\n{'Scenario':<50} {'Expected':<20} {'Actual':<20} {'Pass':<6}")
    print("-" * 96)
    for r in metrics["results"]:
        status = "PASS" if r["passed"] else "FAIL"
        print(f"{r['name']:<50} {r['expected']:<20} {r['actual']:<20} {status:<6}")

    failed = [r for r in metrics["results"] if not r["passed"]]
    if failed:
        print(f"\n{len(failed)} FAILURES:")
        for r in failed:
            print(f"  - {r['name']}: expected {r['expected']}, got {r['actual']}")
    else:
        print("\nAll scenarios passed!")
