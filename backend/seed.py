"""
Seeds 3 demo users (one per role) + 2 real PA requests processed through Gemini pipeline.

Run: docker compose exec backend python seed.py

Demo logins:
  admin@insurcare.ai   / demo1234  → Hospital Admin (submits PA)
  doctor@insurcare.ai  / demo1234  → Doctor (views results)
  insurer@insurcare.ai / demo1234  → Star Health insurer (views claims)
"""
import os, sys, uuid
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal, Base, engine
from app.models.user import User
from app.models.pa_request import PARequest
from app.security import hash_password
from app.agents.orchestrator import run_pipeline

Base.metadata.create_all(bind=engine)
db = SessionLocal()

USERS = [
    dict(email="admin@insurcare.ai",   full_name="TPA Admin — Apollo",      role="admin",   hospital="Apollo Hospitals, Chennai",  company_name=None,    specialization=None),
    dict(email="doctor@insurcare.ai",  full_name="Dr. Ramesh Kumar",        role="doctor",  hospital="Apollo Hospitals, Chennai",  company_name=None,    specialization="Orthopaedics"),
    dict(email="insurer@insurcare.ai", full_name="Star Health Reviewer",    role="insurer", hospital=None,                         company_name="Star Health", specialization=None),
]

admin_user = None
for u in USERS:
    existing = db.query(User).filter(User.email == u["email"]).first()
    if not existing:
        user = User(**u, hashed_password=hash_password("demo1234"))
        db.add(user); db.commit(); db.refresh(user)
        print(f"✓ Created: {u['email']} / demo1234  [{u['role']}]")
    else:
        print(f"✓ Exists:  {u['email']} [{u['role']}]")
    if u["role"] == "admin":
        admin_user = db.query(User).filter(User.email == u["email"]).first()

# PA Request 1 — should APPROVE (clear medical necessity, covered)
r1 = PARequest(
    request_code=f"PA-{uuid.uuid4().hex[:8].upper()}",
    user_id=admin_user.id,
    patient_name="Priya Sharma",     patient_id="P-10042",
    patient_age=54,                  patient_gender="Female",
    insurance_provider="Star Health", policy_number="SH-2026-88421",
    plan_name="Comprehensive Gold",  sum_insured=500000,
    deductible=10000,                coverage_pct=80,
    valid_until="2027-03-31",
    procedure_name="Total Knee Replacement", procedure_code="CPT-27447",
    diagnosis="M17.11 - Primary osteoarthritis, right knee",
    clinical_justification=(
        "Patient has suffered severe primary osteoarthritis of the right knee for 18 months. "
        "Conservative treatment including physiotherapy (24 sessions), NSAIDs for 12 months, "
        "and intra-articular cortisone injections have all failed. X-ray shows complete joint space narrowing. "
        "Orthopedic surgeon recommends TKR as the only remaining therapeutic option."
    ),
    documents=["xray_report.pdf", "physio_notes.pdf", "ortho_referral.pdf"],
)
db.add(r1); db.commit(); db.refresh(r1)
print(f"\n⏳ Running pipeline for {r1.request_code} (Priya Sharma — Knee Replacement)...")
run_pipeline(db, r1); db.refresh(r1)
print(f"✓ {r1.request_code}: {r1.decision} | ₹{r1.approved_amount_inr or 0:,.0f} | {r1.status}")

# PA Request 2 — should DENY (cosmetic dental, Bajaj excludes it)
r2 = PARequest(
    request_code=f"PA-{uuid.uuid4().hex[:8].upper()}",
    user_id=admin_user.id,
    patient_name="Meera Joshi",          patient_id="P-10089",
    patient_age=29,                      patient_gender="Female",
    insurance_provider="Bajaj Allianz",  policy_number="BA-2026-55678",
    plan_name="Health Guard Basic",      sum_insured=200000,
    deductible=5000,                     coverage_pct=75,
    valid_until="2027-06-30",
    procedure_name="Dental Implant - Single Tooth", procedure_code="CDT-D6010",
    diagnosis="K08.1 - Complete loss of teeth",
    clinical_justification="Patient requests single dental implant for missing molar. No accident history. Cosmetic improvement desired.",
    documents=[],
)
db.add(r2); db.commit(); db.refresh(r2)
print(f"\n⏳ Running pipeline for {r2.request_code} (Meera Joshi — Dental Implant)...")
run_pipeline(db, r2); db.refresh(r2)
print(f"✓ {r2.request_code}: {r2.decision} | ₹{r2.approved_amount_inr or 0:,.0f} | {r2.status}")

db.close()
print("""
✅ Seed complete.

Demo logins:
  admin@insurcare.ai   / demo1234  → Can submit PA requests
  doctor@insurcare.ai  / demo1234  → Sees patient results (Apollo Hospitals)
  insurer@insurcare.ai / demo1234  → Sees Star Health claims only
""")
