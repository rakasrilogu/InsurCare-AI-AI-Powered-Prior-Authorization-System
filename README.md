# InsurCare AI — Explainable Prior Authorization Platform

6-Agent Gemini AI pipeline with full explainability and role-based access.

## Roles

| Role | Who | Can Submit | Sees |
|---|---|---|---|
| `admin` | Hospital TPA Desk | ✅ Yes | Own submitted requests |
| `doctor` | Treating Physician | ❌ No | Patients from same hospital |
| `insurer` | Insurance Company Staff | ❌ No | Claims for their company only |

## Quick Start

```bash
export GEMINI_API_KEY=your-gemini-api-key-here
docker compose up --build

# Seed 3 demo users + 2 real pipeline runs
docker compose exec backend python seed.py
```

- Frontend → http://localhost:5173
- API docs → http://localhost:8000/docs

## Demo Logins (after seed)

| Email | Password | Role |
|---|---|---|
| admin@insurcare.ai | demo1234 | Hospital Admin — submits PA |
| doctor@insurcare.ai | demo1234 | Doctor — views results |
| insurer@insurcare.ai | demo1234 | Star Health — views claims |

## Auth Flow

1. Open app → **Signup screen shown first**
2. Select role → role-specific fields appear
3. After login → dashboard and sidebar adapt to role
4. Submit PA → admin only (doctors/insurers see access denied)

## 6-Agent Pipeline

```
Intake (Haiku) → Eligibility (Sonnet) → Policy (Sonnet)
→ Risk (Sonnet) → Decision (Sonnet) → Communication (Haiku)
```

Each agent writes real-time DB rows. Frontend polls every 3s.

## Result Screen Shows

**APPROVED:** Amount ✓, Coverage %, Why approved, Policy clauses, Next steps

**DENIED:** Why denied (plain English), Which clause triggered it, How to appeal
