/// <reference types="vitest" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    policy_clauses_cited: ["SH-4.2"],
    next_steps: ["Schedule surgery"],
    appeal_pathway: null,
    doctor_recommendation: "Proceed",
    plain_english_summary: "Approved",
    confidence_score: 0.85,
    risk_score: 30,
    payment_status: "not_applicable",
    transaction_id: null,
    disbursed_amount_inr: null,
    paid_at: null,
    disputed: false,
    dispute_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    agent_runs: [],
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

/* ── Tests ──────────────────────────────────────────────────────────────── */

function renderPage(request: any) {
  (api.getRequest as any).mockResolvedValue(request);
  return render(
    <MemoryRouter initialEntries={["/request/1"]}>
      <Routes>
        <Route path="/request/:id" element={<ResultPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ResultPage — payment & dispute (insurer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. shows enabled "Approve & Pay" for pending_insurer_approval, not disputed', async () => {
    (useAuth as any).mockReturnValue({ isInsurer: true, user: { role: "insurer", company_name: "Star Health" } });
    renderPage(makeRequest({ status: "approved", payment_status: "pending_insurer_approval" }));

    await waitFor(() => expect(screen.getByText("PENDING INSURER APPROVAL")).toBeInTheDocument());

    const btn = screen.getByRole("button", { name: /approve.*pay/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it('2. shows disabled "Approve & Pay" + resolve-dispute hint when disputed=true', async () => {
    (useAuth as any).mockReturnValue({ isInsurer: true, user: { role: "insurer", company_name: "Star Health" } });
    renderPage(makeRequest({
      status: "approved",
      payment_status: "pending_insurer_approval",
      disputed: true,
      dispute_reason: "Overcharged",
    }));

    await waitFor(() => expect(screen.getByText("PENDING INSURER APPROVAL")).toBeInTheDocument());

    const btn = screen.getByRole("button", { name: /approve.*pay/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/resolve the dispute/i)).toBeInTheDocument();
  });

  it('3. shows "PAID" with transaction details when payment_status=paid, no Approve button', async () => {
    (useAuth as any).mockReturnValue({ isInsurer: true, user: { role: "insurer", company_name: "Star Health" } });
    renderPage(makeRequest({
      status: "approved",
      payment_status: "paid",
      transaction_id: "TXN-ABC123",
      paid_at: "2026-07-14T12:00:00Z",
      disbursed_amount_inr: 128000,
    }));

    await waitFor(() => expect(screen.getByText("PAID")).toBeInTheDocument());
    expect(screen.getByText(/TXN-ABC123/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve.*pay/i })).not.toBeInTheDocument();
  });

  it('4. shows "Dispute Decision" button; clicking reveals form; Submit calls api.disputeRequest', async () => {
    (useAuth as any).mockReturnValue({ isInsurer: true, user: { role: "insurer", company_name: "Star Health" } });
    (api.disputeRequest as any).mockResolvedValue(makeRequest({
      disputed: true,
      dispute_reason: "Not medically necessary",
    }));

    renderPage(makeRequest({ status: "approved" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /dispute decision/i })).toBeInTheDocument();
    });

    const disputeBtn = screen.getByRole("button", { name: /dispute decision/i });
    await userEvent.click(disputeBtn);

    expect(screen.getByPlaceholderText(/explain why/i)).toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: /submit dispute/i });
    expect(submitBtn).toBeDisabled();

    const textarea = screen.getByPlaceholderText(/explain why/i);
    await userEvent.type(textarea, "  Not medically necessary  ");

    expect(submitBtn).not.toBeDisabled();

    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.disputeRequest).toHaveBeenCalledWith("1", "Not medically necessary");
    });
  });

  it('5. hospital user (isInsurer=false) sees no Approve or Dispute buttons', async () => {
    (useAuth as any).mockReturnValue({ isInsurer: false, user: { role: "hospital", can_submit: true } });
    renderPage(makeRequest({ status: "approved", payment_status: "pending_insurer_approval" }));

    await waitFor(() => expect(screen.getByText("PENDING INSURER APPROVAL")).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: /approve.*pay/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dispute decision/i })).not.toBeInTheDocument();
  });

  it('6. clicking "Approve & Pay" calls api.approvePayment, shows spinner, then updates to PAID', async () => {
    (useAuth as any).mockReturnValue({ isInsurer: true, user: { role: "insurer", company_name: "Star Health" } });
    let resolvePayment: (r: any) => void;
    const paymentPromise = new Promise<any>((resolve) => { resolvePayment = resolve; });
    (api.approvePayment as any).mockReturnValue(paymentPromise);

    renderPage(makeRequest({ status: "approved", payment_status: "pending_insurer_approval" }));

    await waitFor(() => expect(screen.getByText("PENDING INSURER APPROVAL")).toBeInTheDocument());

    const btn = screen.getByRole("button", { name: /approve.*pay/i });
    await userEvent.click(btn);

    expect(screen.getByText("Approve & Pay").closest("button")).toBeDisabled();

    resolvePayment!(makeRequest({
      status: "approved",
      payment_status: "paid",
      transaction_id: "TXN-NEW001",
      paid_at: "2026-07-14T12:05:00Z",
      disbursed_amount_inr: 128000,
    }));

    await waitFor(() => expect(screen.getByText("PAID")).toBeInTheDocument());
    expect(screen.getByText(/TXN-NEW001/i)).toBeInTheDocument();
  });
});
