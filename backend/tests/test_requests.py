"""
Integration tests for the PA request API.

Run with:  pytest backend/tests/ -v
Uses SQLite shared via conftest.py so no Postgres is required in CI.
"""
import pytest
from fastapi.testclient import TestClient


PA_PAYLOAD = {
    "patient_name": "Priya Sharma",
    "patient_id": "P-9001",
    "patient_age": 52,
    "patient_gender": "Female",
    "insurance_provider": "Star Health",
    "policy_number": "SH-TEST-001",
    "procedure_name": "Total Knee Replacement",
    "procedure_code": "CPT-27447",
    "clinical_justification": "Severe osteoarthritis with functional impairment.",
}


@pytest.fixture(scope="module")
def submitter_token(client):
    client.post("/api/auth/signup", json={
        "email": "submitter@test.com", "password": "test1234",
        "confirm_password": "test1234", "full_name": "Test Submitter",
        "role": "hospital", "hospital": "Test Hospital", "can_submit": True,
    })
    r = client.post("/api/auth/login", json={"email": "submitter@test.com", "password": "test1234"})
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def doctor_token(client):
    client.post("/api/auth/signup", json={
        "email": "doctor@test.com", "password": "test1234",
        "confirm_password": "test1234", "full_name": "Test Doctor",
        "role": "hospital", "hospital": "Test Hospital", "can_submit": False,
    })
    r = client.post("/api/auth/login", json={"email": "doctor@test.com", "password": "test1234"})
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def insurer_token(client):
    client.post("/api/auth/signup", json={
        "email": "insurer@test.com", "password": "test1234",
        "confirm_password": "test1234", "full_name": "Test Insurer",
        "role": "insurer", "company_name": "Star Health",
    })
    r = client.post("/api/auth/login", json={"email": "insurer@test.com", "password": "test1234"})
    return r.json()["access_token"]


# ── Auth tests ────────────────────────────────────────────────────────────────

def test_signup_duplicate_email(client, submitter_token):
    r = client.post("/api/auth/signup", json={
        "email": "submitter@test.com", "password": "test1234",
        "confirm_password": "test1234", "full_name": "Dup",
        "role": "hospital", "hospital": "X", "can_submit": True,
    })
    assert r.status_code == 400
    assert "already registered" in r.json()["detail"]


def test_signup_password_mismatch(client):
    r = client.post("/api/auth/signup", json={
        "email": "new@test.com", "password": "abc123",
        "confirm_password": "xyz999", "full_name": "X",
        "role": "hospital", "hospital": "H", "can_submit": False,
    })
    assert r.status_code == 400


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"email": "submitter@test.com", "password": "wrongpass"})
    assert r.status_code == 401


def test_me_returns_user(client, submitter_token):
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {submitter_token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "submitter@test.com"
    assert r.json()["role"] == "hospital"
    assert r.json()["can_submit"] is True


# ── PA request submission tests ───────────────────────────────────────────────

def test_doctor_cannot_submit(client, doctor_token):
    r = client.post("/api/requests", json=PA_PAYLOAD,
                    headers={"Authorization": f"Bearer {doctor_token}"})
    assert r.status_code == 403


def test_insurer_cannot_submit(client, insurer_token):
    r = client.post("/api/requests", json=PA_PAYLOAD,
                    headers={"Authorization": f"Bearer {insurer_token}"})
    assert r.status_code == 403


def test_submitter_can_submit(client, submitter_token):
    r = client.post("/api/requests", json=PA_PAYLOAD,
                    headers={"Authorization": f"Bearer {submitter_token}"})
    assert r.status_code == 201
    data = r.json()
    assert data["patient_name"] == "Priya Sharma"
    assert data["status"] == "pending"
    assert data["request_code"].startswith("PA-")


def test_unauthenticated_submit_rejected(client):
    r = client.post("/api/requests", json=PA_PAYLOAD)
    assert r.status_code == 401


# ── Input sanitization tests ──────────────────────────────────────────────────

def test_oversized_clinical_justification_is_truncated(client, submitter_token):
    payload = {**PA_PAYLOAD, "clinical_justification": "A" * 5000}
    r = client.post("/api/requests", json=payload,
                    headers={"Authorization": f"Bearer {submitter_token}"})
    assert r.status_code == 201
    assert len(r.json()["clinical_justification"]) <= 2000


def test_null_bytes_stripped(client, submitter_token):
    payload = {**PA_PAYLOAD, "patient_name": "Test\x00Patient"}
    r = client.post("/api/requests", json=payload,
                    headers={"Authorization": f"Bearer {submitter_token}"})
    assert r.status_code == 201
    assert "\x00" not in r.json()["patient_name"]


# ── RBAC visibility tests ─────────────────────────────────────────────────────

def test_hospital_sees_own_hospital_requests(client, submitter_token):
    r = client.get("/api/requests", headers={"Authorization": f"Bearer {submitter_token}"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_doctor_sees_same_hospital_requests(client, doctor_token, submitter_token):
    r = client.get("/api/requests", headers={"Authorization": f"Bearer {doctor_token}"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_insurer_sees_only_own_company(client, insurer_token, submitter_token):
    payload = {**PA_PAYLOAD, "insurance_provider": "HDFC Ergo"}
    client.post("/api/requests", json=payload,
                headers={"Authorization": f"Bearer {submitter_token}"})
    r = client.get("/api/requests", headers={"Authorization": f"Bearer {insurer_token}"})
    assert r.status_code == 200
    for req in r.json():
        assert req["insurance_provider"] == "Star Health"


def test_get_request_cross_hospital_denied(client, submitter_token):
    client.post("/api/auth/signup", json={
        "email": "submitter2@test.com", "password": "test1234",
        "confirm_password": "test1234", "full_name": "Submitter 2",
        "role": "hospital", "hospital": "Other Hospital", "can_submit": True,
    })
    r2 = client.post("/api/auth/login", json={"email": "submitter2@test.com", "password": "test1234"})
    token2 = r2.json()["access_token"]

    sub = client.post("/api/requests", json=PA_PAYLOAD,
                      headers={"Authorization": f"Bearer {token2}"})
    req_id = sub.json()["id"]

    r = client.get(f"/api/requests/{req_id}",
                   headers={"Authorization": f"Bearer {submitter_token}"})
    assert r.status_code == 403


# ── Analytics tests ───────────────────────────────────────────────────────────

def test_analytics_summary(client, submitter_token):
    r = client.get("/api/analytics/summary", headers={"Authorization": f"Bearer {submitter_token}"})
    assert r.status_code == 200
    data = r.json()
    assert "total_requests" in data
    assert "by_status" in data
    assert data["total_requests"] >= 0


def test_analytics_weekly_shape(client, submitter_token):
    r = client.get("/api/analytics/weekly", headers={"Authorization": f"Bearer {submitter_token}"})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 7
    for entry in data:
        assert "day" in entry
        assert "approved" in entry
        assert "denied" in entry
        assert "review" in entry


def test_analytics_unauthenticated(client):
    r = client.get("/api/analytics/summary")
    assert r.status_code == 401


# ── Rate limiting test ────────────────────────────────────────────────────────

def test_rate_limit_enforced(client):
    client.post("/api/auth/signup", json={
        "email": "ratelimit@test.com", "password": "test1234",
        "confirm_password": "test1234", "full_name": "RL Submitter",
        "role": "hospital", "hospital": "RL Hospital", "can_submit": True,
    })
    r = client.post("/api/auth/login", json={"email": "ratelimit@test.com", "password": "test1234"})
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    for _ in range(5):
        r = client.post("/api/requests", json=PA_PAYLOAD, headers=headers)
        assert r.status_code == 201

    r = client.post("/api/requests", json=PA_PAYLOAD, headers=headers)
    assert r.status_code == 429
