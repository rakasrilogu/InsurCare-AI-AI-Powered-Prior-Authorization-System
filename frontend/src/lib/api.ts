import { z } from "zod";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function authHeaders() {
  const t = localStorage.getItem("token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.detail || JSON.stringify(j); } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Zod schemas ────────────────────────────────────────────────────────────────

export const AuthResponseSchema = z.object({
  access_token: z.string(),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const UserSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  full_name: z.string(),
  role: z.string().optional(),
  can_submit: z.boolean().optional().default(false),
  hospital: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  specialization: z.string().nullable().optional(),
});
export type User = z.infer<typeof UserSchema>;

export const AgentRunSchema = z.object({
  id: z.number(),
  agent_id: z.string(),
  status: z.string(),
  output: z.string().nullable().optional(),
  details: z.record(z.unknown()).nullable().optional(),
  confidence: z.number().nullable().optional(),
  duration_ms: z.number().nullable().optional(),
  started_at: z.string(),
  completed_at: z.string().nullable().optional(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

export const PARequestSchema = z.object({
  id: z.number(),
  request_code: z.string(),
  patient_name: z.string(),
  patient_id: z.string(),
  patient_age: z.number(),
  patient_gender: z.string(),
  insurance_provider: z.string(),
  policy_number: z.string(),
  plan_name: z.string().nullable().optional(),
  sum_insured: z.number().nullable().optional(),
  deductible: z.number().nullable().optional(),
  coverage_pct: z.number().nullable().optional(),
  valid_until: z.string().nullable().optional(),
  procedure_name: z.string(),
  procedure_code: z.string(),
  diagnosis: z.string().nullable(),
  clinical_justification: z.string(),
  documents: z.array(z.string()),
  status: z.string(),
  decision: z.string().nullable(),
  confidence_score: z.number().nullable(),
  risk_score: z.number().nullable(),
  final_summary: z.string().nullable(),
  approved_amount_inr: z.number().nullable().optional(),
  coverage_percentage: z.number().nullable().optional(),
  approval_reasons: z.array(z.string()).default([]),
  denial_reasons: z.array(z.string()).default([]),
  policy_clauses_cited: z.array(z.string()).default([]),
  next_steps: z.array(z.string()).default([]),
  appeal_pathway: z.string().nullable().optional(),
  doctor_recommendation: z.string().nullable().optional(),
  plain_english_summary: z.string().nullable().optional(),
  payment_status: z.string().optional().default('not_applicable'),
  transaction_id: z.string().nullable().optional(),
  disbursed_amount_inr: z.number().nullable().optional(),
  paid_at: z.string().nullable().optional(),
  disputed: z.boolean().optional().default(false),
  dispute_reason: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  agent_runs: z.array(AgentRunSchema).default([]),
});
export type PARequest = z.infer<typeof PARequestSchema>;

export const AnalyticsSummarySchema = z.object({
  total: z.number(),
  approved: z.number(),
  rejected: z.number(),
  escalated: z.number(),
  processing: z.number(),
  avg_confidence: z.number().nullable().optional(),
  avg_risk_score: z.number().nullable().optional(),
  avg_approved_amount_inr: z.number().nullable().optional(),
});
export type AnalyticsSummary = z.infer<typeof AnalyticsSummarySchema>;

export const AnalyticsWeeklyItemSchema = z.object({
  week: z.string(),
  approved: z.number(),
  rejected: z.number(),
  escalated: z.number(),
  total: z.number(),
});
export type AnalyticsWeeklyItem = z.infer<typeof AnalyticsWeeklyItemSchema>;

// ── Validated request helper ───────────────────────────────────────────────────

async function requestValidated<T>(
  schema: z.ZodType<T>,
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const raw = await request<unknown>(path, opts);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    console.warn(`API response validation failed for ${path}:`, parsed.error.flatten());
    // Return raw cast — validation errors are logged but non-fatal in prod
    return raw as T;
  }
  return parsed.data;
}

// ── API surface ────────────────────────────────────────────────────────────────

export const api = {
  signup: (d: {
    email: string; password: string; confirm_password: string;
    full_name: string; role?: string;
    hospital?: string; company_name?: string; specialization?: string;
  }) =>
    requestValidated(AuthResponseSchema, "/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(d),
    }),

  login: (d: { email: string; password: string }) =>
    requestValidated(AuthResponseSchema, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify(d),
    }),

  me: () => requestValidated(UserSchema, "/api/auth/me"),

  createRequest: (d: {
    patient_name: string; patient_id: string; patient_age: number;
    patient_gender: string; insurance_provider: string; policy_number: string;
    plan_name?: string; sum_insured?: number; deductible?: number;
    coverage_pct?: number; valid_until?: string; procedure_name: string;
    procedure_code: string; diagnosis?: string; clinical_justification: string;
    documents?: string[];
  }) =>
    requestValidated(PARequestSchema, "/api/requests", {
      method: "POST",
      body: JSON.stringify(d),
    }),

  listRequests: () =>
    requestValidated(z.array(PARequestSchema), "/api/requests"),

  getRequest: (id: number | string) =>
    requestValidated(PARequestSchema, `/api/requests/${id}`),

  analytics: () =>
    requestValidated(AnalyticsSummarySchema, "/api/analytics/summary"),

  analyticsWeekly: () =>
    requestValidated(z.array(AnalyticsWeeklyItemSchema), "/api/analytics/weekly"),

  approvePayment: (id: number | string) =>
    requestValidated(PARequestSchema, `/api/requests/${id}/approve-payment`, { method: "POST" }),

  disputeRequest: (id: number | string, reason: string) =>
    requestValidated(PARequestSchema, `/api/requests/${id}/dispute`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};
