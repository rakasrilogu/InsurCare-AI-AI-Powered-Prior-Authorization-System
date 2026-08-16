"""
InsurCare AI — Deterministic Decision Engine
==============================================

The Decision Engine is the SINGLE source of truth for final decisions.
It consumes the EvidenceObject + RuleResults and produces a deterministic,
reproducible decision. The LLM is NEVER the sole decision-maker.

Decision flow:
  1. Evaluate all rules
  2. Compute confidence
  3. Apply deterministic decision logic (if/else chain)
  4. Calculate financial outcome
  5. Generate decision trace
  6. Determine if human review is needed
"""

from __future__ import annotations
from typing import Optional
from .evidence import (
    EvidenceObject, FinancialEvidence, ConfidenceEvidence,
    DecisionTrace, DecisionTraceStep, ValidationResult
)
from .rule_engine import RuleEngine, RuleResult, compute_confidence
from .policy_rag import lookup_procedure_cost
from datetime import datetime, timezone
import json


# ── Configurable Thresholds ───────────────────────────────────────────────────

CONFIDENCE_AUTO_APPROVE = 0.90   # >= 90%: eligible for automatic decision
CONFIDENCE_AI_ASSISTED   = 0.70   # 70-89%: AI-assisted review (still deterministic)
CONFIDENCE_HUMAN_REVIEW  = 0.70   # < 70%: mandatory human review

RISK_HIGH_THRESHOLD      = 75.0   # risk_score >= this triggers human review
RISK_ELEVATED_THRESHOLD  = 50.0   # risk_score >= this adds caution


class DecisionEngine:
    """
    Deterministic decision engine that evaluates evidence against rules
    and produces a final, reproducible decision.
    """

    def __init__(self, evidence: EvidenceObject):
        self.evidence = evidence
        self.rule_results: list[RuleResult] = []
        self.confidence = 0.0
        self._trace_steps: list[DecisionTraceStep] = []

    def decide(self) -> EvidenceObject:
        """
        Main entry point. Evaluates all rules, computes confidence,
        applies decision logic, and populates the evidence object
        with the final decision.
        """
        t_start = datetime.now(timezone.utc)
        self.evidence.decision_trace.started_at = t_start.isoformat()
        self.evidence.decision_trace.request_id = self.evidence.request_id
        self.evidence.decision_trace.request_code = self.evidence.request_code

        # Step 1: Evaluate all rules
        self._add_trace_step("rule_evaluation", "Evaluate All Rules", "in_progress")
        rule_engine = RuleEngine(self.evidence)
        self.rule_results = rule_engine.evaluate_all()
        self.evidence.validation_results = [
            ValidationResult(
                rule_id=r.rule_id, rule_name=r.rule_name, passed=r.passed,
                result=r.result, reason=r.reason,
                confidence_impact=r.confidence_impact, severity=r.severity
            )
            for r in self.rule_results
        ]
        self._complete_trace_step("rule_evaluation", "completed",
            json.dumps([{"rule": r.rule_id, "result": r.result, "passed": r.passed} for r in self.rule_results]))

        # Step 2: Compute confidence
        self._add_trace_step("confidence_calculation", "Compute Confidence", "in_progress")
        self.confidence = compute_confidence(self.evidence, self.rule_results)
        self.evidence.confidence.overall_confidence = self.confidence
        self._set_confidence_level()
        self._complete_trace_step("confidence_calculation", "completed",
            f"Confidence: {self.confidence:.1%} ({self.evidence.confidence.confidence_level})")

        # Step 3: Calculate financial outcome (deterministic)
        self._add_trace_step("financial_calculation", "Calculate Financial Outcome", "in_progress")
        self._calculate_financials()
        self._complete_trace_step("financial_calculation", "completed",
            json.dumps({
                "procedure_cost": self.evidence.financial.procedure_cost,
                "approved_amount": self.evidence.financial.approved_amount,
                "patient_responsibility": self.evidence.financial.patient_responsibility,
            }))

        # Step 4: Apply deterministic decision logic
        self._add_trace_step("decision_logic", "Apply Decision Logic", "in_progress")
        self._apply_decision_logic()
        self._complete_trace_step("decision_logic", "completed",
            f"Decision: {self.evidence.decision.upper()}")

        # Step 5: Evaluate human review need
        self._add_trace_step("human_review_check", "Evaluate Human Review Need", "in_progress")
        self._evaluate_human_review()
        self._complete_trace_step("human_review_check", "completed",
            f"Human review: {'required' if self.evidence.human_review_required else 'not required'}")

        # Step 6: Generate next steps
        self._add_trace_step("next_steps", "Generate Next Steps", "in_progress")
        self._generate_next_steps()
        self._complete_trace_step("next_steps", "completed",
            json.dumps(self.evidence.next_steps))

        # Step 7: Generate plain English summary
        self._add_trace_step("summary", "Generate Summary", "in_progress")
        self._generate_summary()
        self._complete_trace_step("summary", "completed",
            self.evidence.plain_english_summary[:200])

        # Zero out financials for non-approved decisions
        if self.evidence.decision != "approved":
            self.evidence.financial.approved_amount = 0
            self.evidence.financial.patient_responsibility = self.evidence.financial.procedure_cost

        # Finalize trace
        t_end = datetime.now(timezone.utc)
        self.evidence.decision_trace.completed_at = t_end.isoformat()
        self.evidence.decision_trace.final_decision = self.evidence.decision
        self.evidence.decision_trace.decision_reasons = self.evidence.decision_reasons
        self.evidence.decision_trace.confidence = self.confidence
        self.evidence.decision_trace.human_review_required = self.evidence.human_review_required
        self.evidence.decision_trace.steps = self._trace_steps

        total_ms = int((t_end - t_start).total_seconds() * 1000)
        self.evidence.decision_trace.total_duration_ms = total_ms

        return self.evidence

    # ═══════════════════════════════════════════════════════════════════════════
    # DETERMINISTIC DECISION LOGIC
    # ═══════════════════════════════════════════════════════════════════════════

    def _apply_decision_logic(self):
        """
        Pure if/else chain. Same evidence → same decision, always.
        Order matters: most specific blocks first.
        """
        p = self.evidence.patient
        pol = self.evidence.policy
        proc = self.evidence.procedure
        docs = self.evidence.documents
        clin = self.evidence.clinical
        fin = self.evidence.financial

        rules_by_id = {r.rule_id: r for r in self.rule_results}

        # ── BLOCK 1: Hard denials (policy/eligibility) ──────────────────────

        # Policy not active
        if not p.policy_active:
            self.evidence.decision = "denied"
            self.evidence.denial_reasons.append(
                f"Policy {p.policy_number} is not active or has expired."
            )
            self._add_blocking_reason("POLICY_INACTIVE", p.policy_number)
            return

        # Policy not found
        if not p.policy_number:
            self.evidence.decision = "denied"
            self.evidence.denial_reasons.append("No valid policy number found.")
            self._add_blocking_reason("NO_POLICY", "")
            return

        # Waiting period not met (pre-existing)
        if not self.evidence.diagnosis.pre_existing_waiting_met and self.evidence.diagnosis.is_pre_existing:
            self.evidence.decision = "denied"
            self.evidence.denial_reasons.append(
                f"Pre-existing disease waiting period ({pol.waiting_period_days} days) has not been completed."
            )
            self._add_blocking_reason("WAITING_PERIOD", f"{pol.waiting_period_days}d")
            return

        # Procedure excluded
        if proc.is_excluded:
            self.evidence.decision = "denied"
            self.evidence.denial_reasons.append(
                f"Procedure is excluded under policy: {proc.exclusion_reason}"
            )
            self._add_blocking_reason("PROCEDURE_EXCLUDED", proc.exclusion_reason)
            return

        # No coverage clause matched
        if not pol.coverage_applicable and pol.exclusion_clauses:
            self.evidence.decision = "denied"
            self.evidence.denial_reasons.append(
                f"Procedure is excluded under clause(s): {', '.join(pol.exclusion_clauses)}."
            )
            self._add_blocking_reason("EXCLUSION_CLAUSE", ", ".join(pol.exclusion_clauses))
            return

        # ── BLOCK 2: Missing information ────────────────────────────────────

        # No documents at all
        if docs.total_documents == 0:
            self.evidence.decision = "requires_information"
            self.evidence.missing_information.append("Supporting documents (medical report, doctor recommendation)")
            return

        # Missing critical documents
        missing_docs = []
        if not docs.medical_report and not docs.diagnostic_report:
            missing_docs.append("Medical report or diagnostic report")
        if not docs.doctor_recommendation:
            missing_docs.append("Doctor recommendation letter")

        if missing_docs:
            self.evidence.decision = "requires_information"
            self.evidence.missing_information.extend(missing_docs)
            return

        # Clinical justification too brief
        if not clin.clinical_justification or len(clin.clinical_justification.strip()) < 20:
            self.evidence.decision = "requires_information"
            self.evidence.missing_information.append("Detailed clinical justification (minimum 20 characters)")
            return

        # ── BLOCK 3: Conditional checks (may escalate) ─────────────────────

        # Medical necessity not established
        if not clin.medical_necessity and clin.medical_necessity_score < 0.6:
            self.evidence.decision = "human_review"
            self.evidence.human_review_required = True
            self.evidence.human_review_reasons.append("Medical necessity could not be established from available evidence.")
            return

        # Document mismatches detected
        if docs.mismatches:
            self.evidence.decision = "human_review"
            self.evidence.human_review_required = True
            self.evidence.human_review_reasons.append(
                f"Document-Request mismatches detected: {'; '.join(docs.mismatches)}."
            )
            return

        # Joint replacement without conservative treatment documentation
        if ("replacement" in proc.name.lower() or "TKR" in proc.code.upper() or "THR" in proc.code.upper()):
            if not clin.previous_treatment_failed or not clin.conservative_treatment_documented:
                self.evidence.decision = "human_review"
                self.evidence.human_review_required = True
                self.evidence.human_review_reasons.append(
                    "Joint replacement requires documented failure of conservative treatment."
                )
                return

        # ── BLOCK 4: High risk escalation ──────────────────────────────────

        risk = self.evidence.risk
        if risk.risk_score >= RISK_HIGH_THRESHOLD:
            self.evidence.decision = "human_review"
            self.evidence.human_review_required = True
            self.evidence.human_review_reasons.append(
                f"High risk score ({risk.risk_score:.0f}/100) requires specialist review."
            )
            return

        # ── BLOCK 5: Financial limit exceeded ──────────────────────────────

        if fin.approved_amount <= 0 and fin.procedure_cost > 0:
            self.evidence.decision = "denied"
            self.evidence.denial_reasons.append(
                f"Calculated approved amount is zero (cost: INR {fin.procedure_cost:,.0f}, "
                f"coverage: {pol.coverage_pct*100:.0f}%, deductible: INR {fin.deductible_inr:,.0f})."
            )
            return

        # ── BLOCK 6: APPROVE ───────────────────────────────────────────────

        # All blocking rules passed
        blocking_failures = [r for r in self.rule_results if r.blocking and not r.passed]
        if blocking_failures:
            self.evidence.decision = "human_review"
            self.evidence.human_review_required = True
            self.evidence.human_review_reasons.append(
                f"Blocking rule(s) failed: {', '.join(r.rule_name for r in blocking_failures)}."
            )
            return

        # If we get here, approve
        self.evidence.decision = "approved"
        self.evidence.approval_reasons.append("Patient is eligible under the policy.")
        self.evidence.approval_reasons.append(f"Procedure is covered at {pol.coverage_pct*100:.0f}%.")
        if pol.waiting_period_days == 0:
            self.evidence.approval_reasons.append("No waiting period applies.")
        self.evidence.approval_reasons.append("Required documents are present and verified.")
        if clin.medical_necessity:
            self.evidence.approval_reasons.append("Medical necessity is established.")

    # ═══════════════════════════════════════════════════════════════════════════
    # FINANCIAL CALCULATION (Deterministic)
    # ═══════════════════════════════════════════════════════════════════════════

    def _calculate_financials(self):
        """
        Calculate approved amount deterministically.
        No LLM involvement — pure arithmetic from policy data.
        """
        p = self.evidence.patient
        proc = self.evidence.procedure
        pol = self.evidence.policy
        fin = self.evidence.financial

        # Procedure cost from CPT lookup
        fin.procedure_cost = lookup_procedure_cost(proc.code, proc.name)
        proc.estimated_cost = fin.procedure_cost

        # Sum insured
        fin.sum_insured = p.sum_insured

        # Deductible
        fin.deductible = p.deductible
        fin.deductible_inr = pol.deductible_inr

        # Coverage percentage (priority: request field > policy clause > default)
        if p.coverage_pct > 0:
            fin.coverage_pct = p.coverage_pct / 100.0
        elif pol.coverage_pct > 0:
            fin.coverage_pct = pol.coverage_pct
        else:
            fin.coverage_pct = 0.80  # default 80%

        # Sub-limit
        fin.sub_limit_applied = pol.sub_limit_inr

        # Covered amount calculation
        if fin.sum_insured > 0:
            admissible = min(fin.sum_insured, fin.procedure_cost)
            covered_amount = admissible * fin.coverage_pct

            # Apply deductible
            deductible_to_apply = max(fin.deductible, fin.deductible_inr)
            after_deductible = max(0, covered_amount - deductible_to_apply)

            # Apply sub-limit
            if fin.sub_limit_applied > 0:
                fin.sub_limit_applied = min(after_deductible, fin.sub_limit_applied)
                fin.exceeds_sub_limit = after_deductible > fin.sub_limit_applied
                approved = fin.sub_limit_applied
            else:
                approved = after_deductible

            fin.covered_amount = covered_amount
            fin.deductible_applied = deductible_to_apply
            fin.approved_amount = max(0, round(approved))
            fin.patient_responsibility = max(0, fin.procedure_cost - fin.approved_amount)
            fin.exceeds_sum_insured = fin.procedure_cost > fin.sum_insured
        else:
            fin.approved_amount = 0
            fin.patient_responsibility = fin.procedure_cost
            fin.exceeds_sum_insured = True

    # ═══════════════════════════════════════════════════════════════════════════
    # CONFIDENCE
    # ═══════════════════════════════════════════════════════════════════════════

    def _set_confidence_level(self):
        c = self.evidence.confidence
        if self.confidence >= CONFIDENCE_AUTO_APPROVE:
            c.confidence_level = "high"
            c.requires_human_review = False
        elif self.confidence >= CONFIDENCE_AI_ASSISTED:
            c.confidence_level = "medium"
            c.requires_human_review = False
        else:
            c.confidence_level = "low"
            c.requires_human_review = True
            c.human_review_reasons.append("Overall confidence below threshold.")

    # ═══════════════════════════════════════════════════════════════════════════
    # HUMAN REVIEW EVALUATION
    # ═══════════════════════════════════════════════════════════════════════════

    def _evaluate_human_review(self):
        """Determine if human review is required based on multiple factors."""
        reasons = []

        # Low confidence
        if self.confidence < CONFIDENCE_HUMAN_REVIEW:
            reasons.append(f"Confidence ({self.confidence:.0%}) is below threshold ({CONFIDENCE_HUMAN_REVIEW:.0%}).")

        # High risk
        risk = self.evidence.risk
        if risk.risk_score >= RISK_ELEVATED_THRESHOLD:
            reasons.append(f"Risk score ({risk.risk_score:.0f}) is elevated.")

        # Document issues
        docs = self.evidence.documents
        if docs.mismatches:
            reasons.append("Document-Request mismatches detected.")
        if docs.document_status == "mismatch":
            reasons.append("Document verification found mismatches.")

        # Rule conflicts
        blocking_failures = [r for r in self.rule_results if r.blocking and not r.passed]
        if blocking_failures:
            reasons.append(f"{len(blocking_failures)} blocking rule(s) failed.")

        # Already escalated by decision logic
        if self.evidence.decision == "human_review":
            reasons.extend(self.evidence.human_review_reasons)

        # Check critical severity rules
        critical_rules = [r for r in self.rule_results if r.severity == "critical" and not r.passed]
        if critical_rules:
            reasons.append(f"{len(critical_rules)} critical rule(s) not satisfied.")

        if reasons:
            self.evidence.human_review_required = True
            self.evidence.human_review_reasons = list(set(reasons))
            if self.evidence.decision not in ("denied", "requires_information"):
                self.evidence.decision = "human_review"

    # ═══════════════════════════════════════════════════════════════════════════
    # NEXT STEPS GENERATION
    # ═══════════════════════════════════════════════════════════════════════════

    def _generate_next_steps(self):
        """Generate actionable next steps based on the decision."""
        ev = self.evidence
        steps = []

        if ev.decision == "approved":
            steps.append("Proceed with treatment as per the approved procedure.")
            steps.append(f"Contact {ev.patient.policy_number} for pre-authorisation confirmation.")
            if ev.financial.patient_responsibility > 0:
                steps.append(f"Patient responsibility: INR {ev.financial.patient_responsibility:,.0f}.")
            steps.append("Claim will be processed within the SLA timeline.")

        elif ev.decision == "denied":
            steps.append("Review the denial reasons and policy clause(s) cited.")
            steps.append(f"Contact {ev.patient.policy_number} for clarification if needed.")
            if ev.appeal_pathway:
                steps.append(f"Appeal pathway: {ev.appeal_pathway}")
            steps.append("Consider requesting reconsideration with additional medical evidence.")

        elif ev.decision == "requires_information":
            steps.append("Upload the missing document(s) and resubmit the PA request.")
            for info in ev.missing_information:
                steps.append(f"Missing: {info}")

        elif ev.decision == "human_review":
            steps.append("This request requires manual review by an insurance specialist.")
            for reason in ev.human_review_reasons[:3]:
                steps.append(f"Reason: {reason}")
            steps.append("A reviewer will contact you within 24 hours.")

        elif ev.decision == "partially_approved":
            steps.append("Partial approval has been granted.")
            steps.append("Review the approved vs. non-approved portions.")
            steps.append("Consider submitting a separate request for non-covered items.")

        ev.next_steps = steps

    # ═══════════════════════════════════════════════════════════════════════════
    # SUMMARY GENERATION
    # ═══════════════════════════════════════════════════════════════════════════

    def _generate_summary(self):
        """Generate a plain-English summary for the patient/doctor."""
        ev = self.evidence

        if ev.decision == "approved":
            ev.plain_english_summary = (
                f"Your prior authorization for {ev.procedure.name} has been APPROVED. "
                f"The approved amount is INR {ev.financial.approved_amount:,.0f} "
                f"(coverage: {ev.policy.coverage_pct*100:.0f}%). "
                f"{'Patient responsibility: INR ' + f'{ev.financial.patient_responsibility:,.0f}.' if ev.financial.patient_responsibility > 0 else ''} "
                f"Please proceed with scheduling as recommended by your doctor."
            )
            ev.doctor_recommendation = (
                f"PA approved for {ev.procedure.name}. "
                f"Coverage: {ev.policy.coverage_pct*100:.0f}% of INR {ev.financial.procedure_cost:,.0f}. "
                f"Proceed with treatment."
            )

        elif ev.decision == "denied":
            top_reason = ev.denial_reasons[0] if ev.denial_reasons else "the procedure does not meet policy coverage criteria."
            ev.plain_english_summary = (
                f"Your prior authorization for {ev.procedure.name} has been DENIED. "
                f"Reason: {top_reason} "
                f"You may appeal this decision within 30 days."
            )
            ev.doctor_recommendation = (
                f"PA denied for {ev.procedure.name}. "
                f"{top_reason} "
                f"Consider alternative treatment options or appeal with additional evidence."
            )

        elif ev.decision == "requires_information":
            missing = ", ".join(ev.missing_information[:3]) if ev.missing_information else "additional documentation"
            ev.plain_english_summary = (
                f"Your prior authorization for {ev.procedure.name} requires additional information. "
                f"Please upload: {missing}. "
                f"Once provided, your request will be re-evaluated."
            )
            ev.doctor_recommendation = (
                f"PA requires additional information: {missing}. "
                f"Please provide the required documents to proceed."
            )

        elif ev.decision == "human_review":
            ev.plain_english_summary = (
                f"Your prior authorization for {ev.procedure.name} has been escalated for specialist review. "
                f"A review team will evaluate your request and contact you within 24 hours."
            )
            ev.doctor_recommendation = (
                f"PA escalated for manual review. "
                f"Reasons: {'; '.join(ev.human_review_reasons[:2])}. "
                f"Please ensure all supporting documentation is available."
            )

        elif ev.decision == "partially_approved":
            ev.plain_english_summary = (
                f"Your prior authorization for {ev.procedure.name} has been partially approved. "
                f"Approved: INR {ev.financial.approved_amount:,.0f}. "
                f"Please review the detailed breakdown."
            )
            ev.doctor_recommendation = (
                f"Partial PA approved for {ev.procedure.name}. "
                f"Review approved vs. non-approved portions."
            )

        # Appeal pathway
        ev.appeal_pathway = (
            f"Contact {ev.patient.policy_number} grievance cell within 30 days. "
            f"Reference request code: {ev.request_code}."
        )

    # ═══════════════════════════════════════════════════════════════════════════
    # TRACE HELPERS
    # ═══════════════════════════════════════════════════════════════════════════

    def _add_trace_step(self, step_id: str, step_name: str, status: str):
        step = DecisionTraceStep(
            step_id=step_id, step_name=step_name, status=status,
            timestamp=datetime.now(timezone.utc).isoformat()
        )
        self._trace_steps.append(step)

    def _complete_trace_step(self, step_id: str, status: str, output: str):
        for step in self._trace_steps:
            if step.step_id == step_id:
                step.status = status
                step.output_data = output
                step.timestamp = datetime.now(timezone.utc).isoformat()
                break

    def _add_blocking_reason(self, rule_id: str, detail: str):
        self.evidence.decision_reasons.append(f"Blocking rule {rule_id} failed: {detail}")
