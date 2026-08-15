// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "@/lib/api";
import ResultPage from "@/pages/ResultPage";

/* ── Helpers ────────────────────────────────────────────────────────────── */

function makeRequest(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    request_code: "PA-2026-001",
    status: "approved",
    patient_name: "Priya Sharma",
    patient_age: 54,
    patient_gender: "Female",
    insurance_provider: "Star Health",
    procedure_name: "Total Knee Replacement",
    procedure_code: "CPT-27447",
    diagnosis: "M17.11",
    clinical_justification: "Needs surgery",
    policy_number: "SH-2026-88421",
    documents: [],
    approved_amount_inr: 128000,
    coverage_percentage: 80,
    approval_reasons: ["Medically necessary"],
    denial_reasons: [],
    policy_clauses_cited: ["SH-4.2", "SH-5.1"],
    next_steps: ["Schedule surgery"],
    appeal_pathway: null,
    doctor_recommendation: "Proceed",
    plain_english_summary: "Approved for knee replacement",
    confidence_score: 0.85,
    risk_score: 35,
    payment_status: "not_applicable",
    transaction_id: null,
    disbursed_amount_inr: null,
    paid_at: null,
    disputed: false,
    dispute_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    agent_runs: [
      { id: 1, agent_id: "intake", status: "completed", output: "Intake complete", details: { severity_score: 60 }, confidence: 0.9, duration_ms: 1200, started_at: new Date().toISOString(), completed_at: new Date().toISOString() },
      { id: 2, agent_id: "risk", status: "completed", output: "Risk: moderate", details: { severity_score: 60, delay_factor_score: 40, age_factor_score: 50, risk_level: "moderate" }, confidence: 0.88, duration_ms: 2000, started_at: new Date().toISOString(), completed_at: new Date().toISOString() },
    ],
    ...overrides,
  };
}

/* ── Mocks ──────────────────────────────────────────────────────────────── */

vi.mock("@/lib/api", () => ({
  api: {
    getRequest: vi.fn(),
    approvePayment: vi.fn(),
    disputeRequest: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(" "),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { useAuth } from "@/contexts/AuthContext";

function renderPage(request: any, isInsurer: boolean) {
  (api.getRequest as any).mockResolvedValue(request);
  (useAuth as any).mockReturnValue({
    isInsurer,
    user: isInsurer
      ? { role: "insurer", company_name: "Star Health" }
      : { role: "hospital", can_submit: true },
  });
  return render(
    <MemoryRouter initialEntries={["/request/1"]}>
      <Routes>
        <Route path="/request/:id" element={<ResultPage />} />
      </Routes>
    </MemoryRouter>
  );
}

/* ── Tests ──────────────────────────────────────────────────────────────── */

describe("ResultPage — role-gated rendering", () => {
  beforeEach(() => vi.clearAllMocks());

  it("insurer sees Policy Clauses Cited section", async () => {
    renderPage(makeRequest(), true);
    await waitFor(() => expect(screen.getByText("SH-4.2")).toBeInTheDocument());
    expect(screen.getByText("SH-5.1")).toBeInTheDocument();
    expect(screen.getByText("Policy Clauses Cited")).toBeInTheDocument();
  });

  it("hospital does NOT see Policy Clauses Cited section", async () => {
    renderPage(makeRequest(), false);
    await waitFor(() => expect(screen.getByText("APPROVED")).toBeInTheDocument());
    expect(screen.queryByText("Policy Clauses Cited")).not.toBeInTheDocument();
    expect(screen.queryByText("SH-4.2")).not.toBeInTheDocument();
  });

  it("insurer sees full risk breakdown (severity, delay, age)", async () => {
    renderPage(makeRequest(), true);
    await waitFor(() => expect(screen.getByText("Severity Score")).toBeInTheDocument());
    expect(screen.getByText("Delay Factor")).toBeInTheDocument();
    expect(screen.getByText("Age Factor")).toBeInTheDocument();
  });

  it("hospital sees risk level badge but NOT full breakdown", async () => {
    renderPage(makeRequest(), false);
    await waitFor(() => expect(screen.getByText("APPROVED")).toBeInTheDocument());
    expect(screen.queryByText("Severity Score")).not.toBeInTheDocument();
    expect(screen.queryByText("Delay Factor")).not.toBeInTheDocument();
    expect(screen.queryByText("Age Factor")).not.toBeInTheDocument();
    expect(screen.getByText(/MODERATE RISK/i)).toBeInTheDocument();
  });

  it("insurer sees full Agent Pipeline Timeline with output text", async () => {
    renderPage(makeRequest(), true);
    await waitFor(() => expect(screen.getByText("Agent Pipeline Timeline")).toBeInTheDocument());
    expect(screen.getByText("Intake complete")).toBeInTheDocument();
    expect(screen.getByText("Risk: moderate")).toBeInTheDocument();
  });

  it("hospital sees simplified Agent Pipeline Status (pill row)", async () => {
    renderPage(makeRequest(), false);
    await waitFor(() => expect(screen.getByText("Agent Pipeline Status")).toBeInTheDocument());
    expect(screen.queryByText("Agent Pipeline Timeline")).not.toBeInTheDocument();
    expect(screen.getByText(/intake/i)).toBeInTheDocument();
    expect(screen.getAllByText(/risk/i).length).toBeGreaterThan(0);
  });

  it("insurer sees Insurer View badge", async () => {
    renderPage(makeRequest(), true);
    await waitFor(() => expect(screen.getByText(/Insurer View/)).toBeInTheDocument());
  });

  it("hospital sees Hospital View badge", async () => {
    renderPage(makeRequest(), false);
    await waitFor(() => expect(screen.getByText(/Hospital View/)).toBeInTheDocument());
  });
});
