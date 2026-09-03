"""Diagnose Gemini API availability."""
import sys
sys.path.insert(0, '.')
from app.config import settings
import httpx

key = settings.GEMINI_API_KEY
print(f"API Key: {key[:10]}... (len={len(key)})")

# Test connectivity
print("\n1. Basic connectivity:")
try:
    r = httpx.get("https://www.google.com", timeout=10)
    print(f"   Google: {r.status_code}")
except Exception as e:
    print(f"   Google: {e}")

# List available models
print("\n2. Available flash models:")
try:
    r = httpx.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={key}", timeout=30)
    if r.status_code == 200:
        data = r.json()
        for m in data.get("models", []):
            name = m.get("name", "")
            if "flash" in name.lower():
                print(f"   {name} - {m.get('displayName', '')}")
    else:
        print(f"   Error: {r.status_code} {r.text[:200]}")
except Exception as e:
    print(f"   Error: {e}")

# Test gemini-3.5-flash-lite
print("\n3. Testing gemini-3.5-flash-lite:")
try:
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"
    r = httpx.post(url, params={"key": key}, json={
        "contents": [{"role": "user", "parts": [{"text": "Say OK"}]}],
        "generationConfig": {"maxOutputTokens": 5}
    }, timeout=60)
    print(f"   Status: {r.status_code}")
    if r.status_code == 200:
        print(f"   Response: {r.text[:200]}")
        print("   WORKING!")
except Exception as e:
    print(f"   Error: {e}")
