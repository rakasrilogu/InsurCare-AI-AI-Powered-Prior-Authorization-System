"""
InsurCare AI — Deterministic Rule Engine
==========================================

Modular, testable rules that evaluate evidence and produce structured results.
Each rule is a pure function: EvidenceObject → ValidationResult.
The LLM is NOT involved in rule evaluation.

Rules are evaluated in dependency order:
  1. Eligibility rules
  2. Waiting period rules
  3. Coverage rules
  4. Exclusion rules
  5. Document rules
  6. Medical necessity rules
  7. Financial rules
"""

from __future__ import annotations
from .evidence import EvidenceObject
from dataclasses import dataclass
from typing import Optional


@dataclass
class RuleResult:
    """Individual rule evaluation result."""
    rule_id: str
    rule_name: str
    passed: bool
    result: str          # PASS | FAIL | UNCERTAIN
    reason: str
    confidence_impact: float = 0.0
    severity: str = "info"   # info | warning | critical
    blocking: bool = False   # if True, prevents auto-approval


class RuleEngine:
    """
    Deterministic rule evaluation engine.
    Each method evaluates one category of rules against the evidence object.
    Returns structured results that the Decision Engine consumes.
    """

    def __init__(self, evidence: EvidenceObject):
        self.evidence = evidence
        self.results: list[RuleResult] = []

    def evaluate_all(self) -> list[RuleResult]:
        """Run all rules in dependency order. Returns list of RuleResults."""
        self.results = []
        self._evaluate_eligibility_rules()
        self._evaluate_waiting_period_rules()
        self._evaluate_coverage_rules()
        self._evaluate_exclusion_rules()
        self._evaluate_document_rules()
        self._evaluate_medical_necessity_rules()
        self._evaluate_financial_rules()
        return self.results

    def _add(self, result: RuleResult):
        self.results.append(result)

    # ═══════════════════════════════════════════════════════════════════════════
    # 1. ELIGIBILITY RULES
    # ═══════════════════════════════════════════════════════════════════════════

    def _evaluate_eligibility_rules(self):
        p = self.evidence.patient

        # Rule: Policy must exist
        if not p.policy_number:
            self._add(RuleResult(
                rule_id="ELIG-001", rule_name="Policy Exists",
                passed=False, result="FAIL",
                reason="No policy number provided in the PA request.",
                severity="critical", blocking=True
            ))
        else:
            self._add(RuleResult(
                rule_id="ELIG-001", rule_name="Policy Exists",
                passed=True, result="PASS",
                reason=f"Policy {p.policy_number} is on record.",
                confidence_impact=0.05
            ))

        # Rule: Policy must be active
        if not p.policy_active:
            self._add(RuleResult(
                rule_id="ELIG-002", rule_name="Policy Active",
                passed=False, result="FAIL",
                reason=f"Policy {p.policy_number} is not active or has expired.",
                severity="critical", blocking=True
            ))
        else:
            self._add(RuleResult(
                rule_id="ELIG-002", rule_name="Policy Active",
                passed=True, result="PASS",
                reason=f"Policy {p.policy_number} is active.",
                confidence_impact=0.05
            ))

        # Rule: Sum insured must be valid
        if p.sum_insured <= 0:
            self._add(RuleResult(
                rule_id="ELIG-003", rule_name="Sum Insured Valid",
                passed=False, result="FAIL",
                reason="Sum insured is not provided or is zero.",
                severity="warning", blocking=True
            ))
        else:
            self._add(RuleResult(
                rule_id="ELIG-003", rule_name="Sum Insured Valid",
                passed=True, result="PASS",
                reason=f"Sum insured: INR {p.sum_insured:,.0f}.",
                confidence_impact=0.05
            ))

        # Rule: Patient details present
        if not self.evidence.patient.name or not self.evidence.patient.patient_id:
            self._add(RuleResult(
                rule_id="ELIG-004", rule_name="Patient Details Complete",
                passed=False, result="FAIL",
                reason="Patient name or ID is missing.",
                severity="warning", blocking=True
            ))
        else:
            self._add(RuleResult(
                rule_id="ELIG-004", rule_name="Patient Details Complete",
                passed=True, result="PASS",
                reason=f"Patient: {p.name} ({p.patient_id}).",
                confidence_impact=0.05
            ))

        # Rule: Procedure details present
        proc = self.evidence.procedure
        if not proc.name or not proc.code:
            self._add(RuleResult(
                rule_id="ELIG-005", rule_name="Procedure Details Complete",
                passed=False, result="FAIL",
                reason="Procedure name or code is missing.",
                severity="warning", blocking=True
            ))
        else:
            self._add(RuleResult(
                rule_id="ELIG-005", rule_name="Procedure Details Complete",
                passed=True, result="PASS",
                reason=f"Procedure: {proc.name} ({proc.code}).",
                confidence_impact=0.05
            ))

    # ═══════════════════════════════════════════════════════════════════════════
    # 2. WAITING PERIOD RULES
    # ═══════════════════════════════════════════════════════════════════════════

    def _evaluate_waiting_period_rules(self):
        pol = self.evidence.policy

        if pol.waiting_period_days > 0:
            # If policy has a waiting period clause, check if PED waiting is met
            diag = self.evidence.diagnosis
            if diag.is_pre_existing and not diag.pre_existing_waiting_met:
                self._add(RuleResult(
                    rule_id="WAIT-001", rule_name="Pre-existing Disease Waiting Period",
                    passed=False, result="FAIL",
                    reason=f"Pre-existing disease waiting period ({pol.waiting_period_days} days) has not been completed.",
                    confidence_impact=-0.15,
                    severity="critical", blocking=True
                ))
            else:
                self._add(RuleResult(
                    rule_id="WAIT-001", rule_name="Pre-existing Disease Waiting Period",
                    passed=True, result="PASS",
                    reason="Waiting period requirements are satisfied.",
                    confidence_impact=0.05
                ))
        else:
            self._add(RuleResult(
                rule_id="WAIT-001", rule_name="Pre-existing Disease Waiting Period",
                passed=True, result="PASS",
                reason="No waiting period clause applies to this request.",
                confidence_impact=0.03
            ))

    # ═══════════════════════════════════════════════════════════════════════════
    # 3. COVERAGE RULES
    # ═══════════════════════════════════════════════════════════════════════════

    def _evaluate_coverage_rules(self):
        pol = self.evidence.policy

        if pol.coverage_applicable:
            self._add(RuleResult(
                rule_id="COV-001", rule_name="Procedure Coverage Applicable",
                passed=True, result="PASS",
                reason=f"Procedure is covered at {pol.coverage_pct*100:.0f}% under the policy.",
                confidence_impact=0.1
            ))
        else:
            if pol.exclusion_clauses:
                self._add(RuleResult(
                    rule_id="COV-001", rule_name="Procedure Coverage Applicable",
                    passed=False, result="FAIL",
                    reason=f"Procedure is excluded under clause(s): {', '.join(pol.exclusion_clauses)}.",
                    severity="critical", blocking=True,
                    confidence_impact=-0.2
                ))
            else:
                self._add(RuleResult(
                    rule_id="COV-001", rule_name="Procedure Coverage Applicable",
                    passed=False, result="FAIL",
                    reason="No matching coverage clause found for this procedure.",
                    severity="critical", blocking=True,
                    confidence_impact=-0.2
                ))

        # Rule: Pre-authorisation required
        if pol.preauth_required:
            self._add(RuleResult(
                rule_id="COV-002", rule_name="Pre-authorisation Required",
                passed=True, result="PASS",
                reason="Pre-authorisation is mandatory for this procedure. Request submitted as PA.",
                confidence_impact=0.03
            ))

    # ═══════════════════════════════════════════════════════════════════════════
    # 4. EXCLUSION RULES
    # ═══════════════════════════════════════════════════════════════════════════

    def _evaluate_exclusion_rules(self):
        proc = self.evidence.procedure

        if proc.is_excluded:
            self._add(RuleResult(
                rule_id="EXCL-001", rule_name="Procedure Exclusion",
                passed=False, result="FAIL",
                reason=f"Procedure is excluded: {proc.exclusion_reason}",
                severity="critical", blocking=True,
                confidence_impact=-0.25
            ))
        else:
            self._add(RuleResult(
                rule_id="EXCL-001", rule_name="Procedure Exclusion",
                passed=True, result="PASS",
                reason="Procedure is not on the exclusion list.",
                confidence_impact=0.05
            ))

        # Rule: Accidental dental exception
        if proc.is_excluded and "dental" in proc.name.lower():
            clinical = self.evidence.clinical
            if any("accident" in f.lower() for f in clinical.clinical_findings):
                self._add(RuleResult(
                    rule_id="EXCL-002", rule_name="Accidental Dental Exception",
                    passed=True, result="PASS",
                    reason="Dental procedure is due to accidental injury — exception applies.",
                    confidence_impact=0.1
                ))

    # ═══════════════════════════════════════════════════════════════════════════
    # 5. DOCUMENT RULES
    # ═══════════════════════════════════════════════════════════════════════════

    def _evaluate_document_rules(self):
        docs = self.evidence.documents

        # Rule: Minimum documents required
        if docs.total_documents == 0:
            self._add(RuleResult(
                rule_id="DOC-001", rule_name="Documents Submitted",
                passed=False, result="FAIL",
                reason="No documents have been submitted with this PA request.",
                severity="critical", blocking=True,
                confidence_impact=-0.3
            ))
        elif docs.total_documents < 1:
            self._add(RuleResult(
                rule_id="DOC-001", rule_name="Documents Submitted",
                passed=False, result="FAIL",
                reason="At least one supporting document is required.",
                severity="warning", blocking=True,
                confidence_impact=-0.2
            ))
        else:
            self._add(RuleResult(
                rule_id="DOC-001", rule_name="Documents Submitted",
                passed=True, result="PASS",
                reason=f"{docs.total_documents} document(s) submitted.",
                confidence_impact=0.05
            ))

        # Rule: Medical report present
        if not docs.medical_report and not docs.diagnostic_report:
            self._add(RuleResult(
                rule_id="DOC-002", rule_name="Medical Evidence Present",
                passed=False, result="FAIL",
                reason="Neither medical report nor diagnostic report is present.",
                severity="warning", blocking=False,
                confidence_impact=-0.15
            ))
        else:
            self._add(RuleResult(
                rule_id="DOC-002", rule_name="Medical Evidence Present",
                passed=True, result="PASS",
                reason="Medical evidence documents are present.",
                confidence_impact=0.1
            ))

        # Rule: Doctor recommendation present
        if not docs.doctor_recommendation:
            self._add(RuleResult(
                rule_id="DOC-003", rule_name="Doctor Recommendation Present",
                passed=False, result="FAIL",
                reason="Doctor recommendation letter is missing.",
                severity="warning", blocking=False,
                confidence_impact=-0.1
            ))
        else:
            self._add(RuleResult(
                rule_id="DOC-003", rule_name="Doctor Recommendation Present",
                passed=True, result="PASS",
                reason="Doctor recommendation letter is present.",
                confidence_impact=0.08
            ))

        # Rule: Document-Request match
        if docs.mismatches:
            self._add(RuleResult(
                rule_id="DOC-004", rule_name="Document-Request Match",
                passed=False, result="FAIL",
                reason=f"Document mismatches found: {'; '.join(docs.mismatches)}",
                severity="warning", blocking=False,
                confidence_impact=-0.15
            ))
        elif docs.total_documents > 0:
            self._add(RuleResult(
                rule_id="DOC-004", rule_name="Document-Request Match",
                passed=True, result="PASS",
                reason="Documents match the PA request details.",
                confidence_impact=0.1
            ))

    # ═══════════════════════════════════════════════════════════════════════════
    # 6. MEDICAL NECESSITY RULES
    # ═══════════════════════════════════════════════════════════════════════════

    def _evaluate_medical_necessity_rules(self):
        clin = self.evidence.clinical

        # Rule: Clinical justification provided
        if not clin.clinical_justification or len(clin.clinical_justification.strip()) < 20:
            self._add(RuleResult(
                rule_id="MED-001", rule_name="Clinical Justification Provided",
                passed=False, result="FAIL",
                reason="Clinical justification is missing or too brief (< 20 characters).",
                severity="warning", blocking=False,
                confidence_impact=-0.15
            ))
        else:
            self._add(RuleResult(
                rule_id="MED-001", rule_name="Clinical Justification Provided",
                passed=True, result="PASS",
                reason="Clinical justification is provided.",
                confidence_impact=0.08
            ))

        # Rule: Medical necessity determined
        if clin.medical_necessity:
            self._add(RuleResult(
                rule_id="MED-002", rule_name="Medical Necessity Established",
                passed=True, result="PASS",
                reason="Medical necessity is established based on clinical evidence.",
                confidence_impact=0.15
            ))
        elif clin.medical_necessity_score >= 0.6:
            self._add(RuleResult(
                rule_id="MED-002", rule_name="Medical Necessity Established",
                passed=True, result="PASS",
                reason=f"Medical necessity score ({clin.medical_necessity_score:.0%}) meets threshold.",
                confidence_impact=0.1
            ))
        else:
            self._add(RuleResult(
                rule_id="MED-002", rule_name="Medical Necessity Established",
                passed=False, result="UNCERTAIN",
                reason="Medical necessity could not be fully established from available evidence.",
                confidence_impact=-0.1,
                severity="warning"
            ))

        # Rule: Conservative treatment attempted (for joint replacements)
        proc = self.evidence.procedure
        if "replacement" in proc.name.lower() or "TKR" in proc.code.upper() or "THR" in proc.code.upper():
            if clin.previous_treatment_failed and clin.conservative_treatment_documented:
                self._add(RuleResult(
                    rule_id="MED-003", rule_name="Conservative Treatment Attempted",
                    passed=True, result="PASS",
                    reason="Conservative treatment failure is documented as required for joint replacement.",
                    confidence_impact=0.15
                ))
            elif clin.previous_treatment_failed:
                self._add(RuleResult(
                    rule_id="MED-003", rule_name="Conservative Treatment Attempted",
                    passed=False, result="UNCERTAIN",
                    reason="Previous treatment failure indicated but conservative treatment documentation is incomplete.",
                    confidence_impact=-0.1,
                    severity="warning"
                ))
            else:
                self._add(RuleResult(
                    rule_id="MED-003", rule_name="Conservative Treatment Attempted",
                    passed=False, result="FAIL",
                    reason="Joint replacement requires documented failure of conservative treatment (minimum 3-6 months).",
                    confidence_impact=-0.2,
                    severity="critical", blocking=True
                ))

        # Rule: Severity assessment
        if clin.severity == "critical":
            self._add(RuleResult(
                rule_id="MED-004", rule_name="Severity Assessment",
                passed=True, result="PASS",
                reason="Critical severity — expedited review warranted.",
                confidence_impact=0.1
            ))
        elif clin.severity == "severe":
            self._add(RuleResult(
                rule_id="MED-004", rule_name="Severity Assessment",
                passed=True, result="PASS",
                reason="Severe condition documented.",
                confidence_impact=0.05
            ))

    # ═══════════════════════════════════════════════════════════════════════════
    # 7. FINANCIAL RULES
    # ═══════════════════════════════════════════════════════════════════════════

    def _evaluate_financial_rules(self):
        fin = self.evidence.financial

        # Rule: Approved amount within sum insured
        if fin.exceeds_sum_insured:
            self._add(RuleResult(
                rule_id="FIN-001", rule_name="Amount Within Sum Insured",
                passed=False, result="FAIL",
                reason=f"Approved amount (INR {fin.approved_amount:,.0f}) exceeds sum insured (INR {fin.sum_insured:,.0f}).",
                severity="warning", blocking=False,
                confidence_impact=-0.1
            ))
        elif fin.sum_insured > 0:
            self._add(RuleResult(
                rule_id="FIN-001", rule_name="Amount Within Sum Insured",
                passed=True, result="PASS",
                reason=f"Approved amount (INR {fin.approved_amount:,.0f}) is within sum insured.",
                confidence_impact=0.05
            ))

        # Rule: Sub-limit respected
        if fin.exceeds_sub_limit:
            self._add(RuleResult(
                rule_id="FIN-002", rule_name="Sub-limit Respected",
                passed=False, result="FAIL",
                reason=f"Sub-limit (INR {fin.sub_limit_applied:,.0f}) has been exceeded.",
                severity="warning", blocking=False,
                confidence_impact=-0.05
            ))

        # Rule: Financial calculation complete
        if fin.procedure_cost > 0:
            self._add(RuleResult(
                rule_id="FIN-003", rule_name="Financial Calculation Complete",
                passed=True, result="PASS",
                reason=f"Cost: INR {fin.procedure_cost:,.0f} | Approved: INR {fin.approved_amount:,.0f} | Patient: INR {fin.patient_responsibility:,.0f}.",
                confidence_impact=0.05
            ))
        else:
            self._add(RuleResult(
                rule_id="FIN-003", rule_name="Financial Calculation Complete",
                passed=False, result="UNCERTAIN",
                reason="Procedure cost could not be determined.",
                confidence_impact=-0.1,
                severity="warning"
            ))


def compute_confidence(evidence: EvidenceObject, results: list[RuleResult]) -> float:
    """
    Compute overall confidence score from evidence quality and rule results.
    Returns a value between 0.0 and 1.0.
    """
    base = 0.5  # starting point

    # Add confidence from each rule result
    for r in results:
        base += r.confidence_impact

    # Bonus: all documents complete
    docs = evidence.documents
    if docs.all_documents_complete:
        base += 0.1
    elif docs.total_documents >= 2:
        base += 0.05

    # Bonus: high policy retrieval similarity
    pol = evidence.policy
    if pol.clauses_retrieved:
        avg_sim = sum(c.similarity for c in pol.clauses_retrieved) / len(pol.clauses_retrieved)
        if avg_sim >= 0.7:
            base += 0.1
        elif avg_sim >= 0.5:
            base += 0.05

    # Penalty: document quality
    if not docs.medical_report and not docs.diagnostic_report:
        base -= 0.15
    elif not docs.medical_report:
        base -= 0.1

    if not docs.doctor_recommendation:
        base -= 0.1

    if docs.total_documents == 0:
        base -= 0.15

    if not docs.all_documents_complete and docs.total_documents > 0:
        base -= 0.05

    # Penalty: document mismatches
    if docs.mismatches:
        base -= 0.15

    # Penalty: no clinical evidence
    clin = evidence.clinical
    if not clin.medical_necessity and clin.medical_necessity_score < 0.5:
        base -= 0.15
    elif not clin.medical_necessity:
        base -= 0.1

    if not clin.clinical_justification or len(clin.clinical_justification.strip()) < 50:
        base -= 0.05

    # Penalty: rule conflicts (blocking rules failed)
    blocking_failures = sum(1 for r in results if r.blocking and not r.passed)
    if blocking_failures > 0:
        base -= 0.05 * blocking_failures

    # Clamp to [0, 1]
    return max(0.0, min(1.0, round(base, 3)))
