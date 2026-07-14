"""
Tests for refresh token and auth rate limiting.
"""
import pytest


@pytest.fixture(scope="module")
def user_and_tokens(client):
    r = client.post("/api/auth/signup", json={
        "email": "refresh@test.com", "password": "test1234",
        "confirm_password": "test1234", "full_name": "Refresh User",
        "role": "hospital", "hospital": "Refresh Hospital", "can_submit": True,
    })
    assert r.status_code == 201
    data = r.json()
    return {"access_token": data["access_token"], "refresh_token": data["refresh_token"]}


def test_signup_returns_refresh_token(user_and_tokens):
    assert user_and_tokens["refresh_token"] is not None
    assert len(user_and_tokens["refresh_token"]) > 0


def test_refresh_token_works(client, user_and_tokens):
    r = client.post("/api/auth/refresh", json={
        "refresh_token": user_and_tokens["refresh_token"]
    })
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert "refresh_token" in data
    # Old refresh token should be revoked
    r2 = client.post("/api/auth/refresh", json={
        "refresh_token": user_and_tokens["refresh_token"]
    })
    assert r2.status_code == 401


def test_refresh_invalid_token(client):
    r = client.post("/api/auth/refresh", json={
        "refresh_token": "invalid-token"
    })
    assert r.status_code == 401


def test_health_endpoint(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert "status" in data
    assert "database" in data
    assert "version" in data


def test_cors_headers(client):
    r = client.options("/api/auth/login", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
    })
    assert r.status_code == 200
    assert "Access-Control-Allow-Origin" in r.headers
