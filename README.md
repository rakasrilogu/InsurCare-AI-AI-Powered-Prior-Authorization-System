# InsurCare AI — Explainable Prior Authorization Platform

Multi-agent AI pipeline for healthcare prior authorization with full explainability, payment/dispute management, and role-based access.

Built with **FastAPI + React + PostgreSQL + Gemini AI**.

## Architecture

```
Frontend (React / Vite / nginx)
       │
       ├── /api/* ──────► FastAPI ──► PostgreSQL
       └── /ws/* ───────► WebSocket ─► AgentRun polling
                               │
                    ┌──────────┴──────────┐
                    │  7-Agent Pipeline   │
                    │  (Gemini AI)        │
                    └─────────────────────┘
```

## Roles

| Role | Sub-role | Can Submit | Sees |
|---|---|---|---|
| `hospital` | `can_submit=true` | ✅ Yes | Own hospital requests |
| `hospital` | `can_submit=false` | ❌ No | Same hospital requests |
| `insurer` | — | ❌ No | Claims for their company |

## 7-Agent Pipeline

```
Intake → Eligibility → Policy → Risk → Decision → Communication → Payment
```

Each agent writes real-time DB rows. Frontend polls via WebSocket every 3s.

### Payment Agent
- **Auto-disburses** when confidence ≥ 85% AND risk_score ≤ 40
- **Pends insurer approval** otherwise
- Insurer can approve payment via UI or dispute the decision

## Quick Start

```bash
# 1. Provide your Gemini API key
cp backend/.env.example backend/.env
# Edit backend/.env → set GEMINI_API_KEY

# 2. Start everything
docker compose up --build

# 3. Open
# Frontend → http://localhost:3000
# API docs → http://localhost:8000/docs
```

## Auth Flow

1. Open app → **Signup** screen
2. Select role (`hospital` / `insurer`) → role-specific fields appear
3. After login → dashboard adapts to role
4. Submit PA → only `hospital` + `can_submit=true` users

## Result Screen

| Decision | Shows |
|---|---|
| **APPROVED** | Amount, Coverage %, Reason, Policy clauses, Next steps |
| **DENIED** | Plain English reason, Triggered clause, Appeal pathway |

### Payment & Dispute (Insurer Only)
- **Approve & Pay** — disburses the approved amount, generates transaction ID
- **Dispute Decision** — marks claim as disputed, blocks payment until resolved

## Features

- ✅ JWT with **refresh tokens** (30-day rotation)
- ✅ **Rate limiting** on auth + submission endpoints
- ✅ **Structured JSON logging** with request tracing
- ✅ **Health check** endpoint with DB connectivity
- ✅ **Input sanitization** (prompt injection prevention)
- ✅ **CI/CD** — GitHub Actions (pytest + vitest + lint + build)
- ✅ **ICD-10 / CPT** healthcare code fields
- ✅ Production Docker Compose (PostgreSQL, nginx, multi-stage builds)

## Running Tests

```bash
# Backend
cd backend && pytest -v

# Frontend
cd frontend && npm run test
```

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | — | Register |
| POST | `/api/auth/login` | — | Login (returns access + refresh tokens) |
| POST | `/api/auth/refresh` | — | Refresh access token |
| GET | `/api/auth/me` | Bearer | Current user |
| POST | `/api/requests` | Bearer | Submit PA request |
| GET | `/api/requests` | Bearer | List requests (RBAC-filtered) |
| GET | `/api/requests/{id}` | Bearer | Request detail |
| POST | `/api/requests/{id}/approve-payment` | Insurer | Approve + disburse payment |
| POST | `/api/requests/{id}/dispute` | Insurer | Dispute decision |
| GET | `/api/analytics/summary` | Bearer | Dashboard stats |
| GET | `/api/analytics/weekly` | Bearer | Weekly trend |
| GET | `/health` | — | Health check |
| WS | `/ws/agent-runs?token=` | JWT query | Real-time agent status |
