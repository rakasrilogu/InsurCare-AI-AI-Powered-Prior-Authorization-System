"""
Tests for payment approval and dispute endpoints (insurer-only).
"""
import pytest


@pytest.fixture(scope="module")
def insurer(client):
    r = client.post("/api/auth/signup", json={
        "email": "pay-insurer@test.com", "password": "test1234",
        "confirm_password": "test1234", "full_name": "Pay Insurer",
        "role": "insurer", "company_name": "Pay Health",
    })
    data = r.json()
    return {"token": data["access_token"], "company": "Pay Health"}


@pytest.fixture(scope="module")
def submitter(client):
    r = client.post("/api/auth/signup", json={
        "email": "pay-submitter@test.com", "password": "test1234",
        "confirm_password": "test1234", "full_name": "Pay Submitter",
        "role": "hospital", "hospital": "Pay Hospital", "can_submit": True,
    })
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def request_id(client, submitter, insurer):
    r = client.post("/api/requests", json={
        "patient_name": "Pay Patient",
        "patient_id": "P-PAY-001",
        "patient_age": 45,
        "patient_gender": "Male",
        "insurance_provider": insurer["company"],
        "policy_number": "PAY-001",
        "procedure_name": "Knee Surgery",
        "procedure_code": "CPT-27447",
        "clinical_justification": "Test payment",
    }, headers={"Authorization": f"Bearer {submitter}"})
    return r.json()["id"]


def test_hospital_cannot_approve_payment(client, submitter, request_id):
    r = client.post(f"/api/requests/{request_id}/approve-payment",
                    headers={"Authorization": f"Bearer {submitter}"})
    assert r.status_code == 403


def test_hospital_cannot_dispute(client, submitter, request_id):
    r = client.post(f"/api/requests/{request_id}/dispute",
                    json={"reason": "Not medically necessary"},
                    headers={"Authorization": f"Bearer {submitter}"})
    assert r.status_code == 403


def test_insurer_can_approve_payment(client, insurer, request_id):
    # Manually set request to approved state with payment pending
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.models.pa_request import PARequest
    test_engine = create_engine("sqlite:///./test_shared.db", connect_args={"check_same_thread": False})
    sess = sessionmaker(bind=test_engine)()
    req = sess.get(PARequest, request_id)
    req.status = "approved"
    req.approved_amount_inr = 50000
    req.payment_status = "pending_insurer_approval"
    sess.commit()
    sess.close()

    r = client.post(f"/api/requests/{request_id}/approve-payment",
                    headers={"Authorization": f"Bearer {insurer['token']}"})
    assert r.status_code == 200
    data = r.json()
    assert data["payment_status"] == "paid"
    assert data["transaction_id"] is not None
    assert data["paid_at"] is not None


@pytest.fixture(scope="module")
def dispute_request_id(client, submitter, insurer):
    r = client.post("/api/requests", json={
        "patient_name": "Dispute Patient",
        "patient_id": "P-DSP-001",
        "patient_age": 30,
        "patient_gender": "Female",
        "insurance_provider": insurer["company"],
        "policy_number": "DSP-001",
        "procedure_name": "MRI Scan",
        "procedure_code": "CPT-73721",
        "clinical_justification": "Test dispute",
    }, headers={"Authorization": f"Bearer {submitter}"})
    return r.json()["id"]


def test_insurer_can_dispute(client, insurer, dispute_request_id):
    r = client.post(f"/api/requests/{dispute_request_id}/dispute",
                    json={"reason": "Not medically necessary"},
                    headers={"Authorization": f"Bearer {insurer['token']}"})
    assert r.status_code == 200
    data = r.json()
    assert data["disputed"] is True
    assert data["dispute_reason"] == "Not medically necessary"
