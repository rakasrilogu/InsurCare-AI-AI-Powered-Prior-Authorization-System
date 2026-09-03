"""
InsurCare AI — Agentic RAG for Policy Clause Retrieval
======================================================

How hallucination is eliminated
---------------------------------
The classic RAG failure: the LLM is shown retrieved chunks and then asked to
*also* reason about numbers, coverage percentages, and exclusions.  It answers
from a mixture of the retrieved text and its own parametric memory, and the two
conflict silently.

This module solves it with a strict two-phase contract:

  Phase 1 — RETRIEVE (deterministic)
    ChromaDB returns the top-k clause chunks whose embeddings are closest to
    the query.  Every chunk carries structured metadata: insurer, clause_id,
    clause_type, coverage_pct, exclusion flag, etc.  The LLM is NOT involved.

  Phase 2 — REASON (LLM, grounded)
    The policy agent receives ONLY the retrieved chunk text plus a hard
    instruction: "cite only what is in the RETRIEVED CLAUSES section below —
    do NOT use prior knowledge."  The system prompt lists every clause that
    was retrieved, with its clause_id, so the LLM can cite them by ID.

  Phase 3 — VALIDATE (deterministic post-processing — already in run_policy)
    Financial numbers (approved_amount, coverage_limit, uncovered) are
    recomputed from the structured metadata of matched clauses, completely
    bypassing whatever the LLM wrote for those fields.

The net result: the LLM only contributes natural-language reasoning about
whether a procedure MATCHES a clause.  All numbers and boolean facts come
from the structured corpus, not from the LLM.

Corpus structure
-----------------
Each document in the vector store is a single policy clause:
  - text  : the clause in plain English (what gets embedded + shown to LLM)
  - metadata keys:
      insurer          str   "Star Health"
      clause_id        str   "SH-4.2"
      clause_type      str   "coverage" | "exclusion" | "waiting_period"
                             | "sub_limit" | "preauth"
      covered          bool  True if this clause GRANTS coverage
      coverage_pct     float 0.0–1.0  (0 when not applicable)
      deductible_inr   float absolute deductible this clause imposes
      sub_limit_inr    float per-event cap (0 = no sub-limit)
      waiting_days     int   waiting period this clause imposes (0 = none)
      preauth_required bool
      tags             str   comma-separated procedure keywords for filtering
"""

from __future__ import annotations
import os, json, hashlib
from typing import Optional

# ── Retrieval quality threshold ──────────────────────────────────────────────
# Clauses below this similarity score are discarded before being sent to the
# LLM.  Prevents low-quality retrievals from polluting the reasoning phase.
# Cosine similarity: 1.0 = identical, 0.0 = orthogonal.
SIMILARITY_THRESHOLD = 0.40

# ── CPT / procedure cost table (INR) ─────────────────────────────────────────
# Authoritative procedure cost estimates used for approved-amount calculation.
# The LLM never writes these; they are looked up deterministically by CPT code
# or procedure name keyword.  Add rows as your covered-procedure list grows.
# Costs are midpoint estimates for Tier-2 Indian private hospitals (2025).
PROCEDURE_COSTS_INR: dict[str, int] = {
    # Orthopaedic
    "CPT-27447": 160000,   # Total Knee Replacement (TKR)
    "CPT-27130": 175000,   # Total Hip Replacement (THR)
    "CPT-27125": 120000,   # Hemi-arthroplasty hip
    "CPT-22612": 200000,   # Lumbar spinal fusion
    "CPT-29881": 55000,    # Knee arthroscopy + meniscectomy
    "CPT-27530": 70000,    # Tibial fracture ORIF
    # Cardiac
    "CPT-33533": 320000,   # CABG (arterial)
    "CPT-92928": 180000,   # Coronary angioplasty + stent
    "CPT-93454": 45000,    # Coronary angiography
    "CPT-33406": 380000,   # Aortic valve replacement
    # General surgery
    "CPT-44950": 35000,    # Appendectomy
    "CPT-43239": 40000,    # Upper GI endoscopy + biopsy
    "CPT-47562": 55000,    # Laparoscopic cholecystectomy
    "CPT-49650": 50000,    # Laparoscopic hernia repair
    # Diagnostics
    "CPT-70553": 12000,    # MRI brain with contrast
    "CPT-71250": 9000,     # CT chest
    "CPT-78816": 22000,    # PET-CT whole body
    # Dental (accidental)
    "CDT-D6010": 25000,    # Dental implant (single)
    "CDT-D7210": 8000,     # Surgical tooth extraction
    # Ophthalmology
    "CPT-66984": 30000,    # Cataract extraction + IOL
    "CPT-67040": 55000,    # Laser retinal photocoagulation
    # Maternity
    "CPT-59510": 55000,    # C-section + post-op care
    "CPT-59400": 35000,    # Normal vaginal delivery
}

# Keyword fallbacks when CPT code is not in the table
PROCEDURE_KEYWORD_COSTS_INR: list[tuple[str, int]] = [
    ("knee replacement",     160000),
    ("tkr",                  160000),
    ("hip replacement",      175000),
    ("thr",                  175000),
    ("spinal fusion",        200000),
    ("arthroscop",           55000),
    ("cabg",                 320000),
    ("bypass",               320000),
    ("angioplasty",          180000),
    ("angiograph",           45000),
    ("valve replacement",    380000),
    ("appendectom",          35000),
    ("cholecystectom",       55000),
    ("hernia",               50000),
    ("endoscop",             40000),
    ("mri",                  12000),
    ("ct scan",               9000),
    ("pet",                  22000),
    ("dental implant",       25000),
    ("cataract",             30000),
    ("retina",               55000),
    ("caesarean",            55000),
    ("c-section",            55000),
    ("delivery",             35000),
]

DEFAULT_PROCEDURE_COST_INR = 120000   # fallback when no match found


def lookup_procedure_cost(cpt_code: str, procedure_name: str) -> int:
    """
    Return the authoritative procedure cost in INR.
    Lookup order: exact CPT code → keyword match → default.
    This value is used as the basis for approved-amount calculation;
    the LLM never provides or overrides it.
    """
    # 1. Exact CPT match (case-insensitive)
    key = (cpt_code or "").upper().strip()
    for k, v in PROCEDURE_COSTS_INR.items():
        if k.upper() == key:
            return v

    # 2. Keyword match on procedure name
    name_lower = (procedure_name or "").lower()
    for keyword, cost in PROCEDURE_KEYWORD_COSTS_INR:
        if keyword in name_lower:
            return cost

    return DEFAULT_PROCEDURE_COST_INR


# ── Corpus ────────────────────────────────────────────────────────────────────
# Each entry is one clause.  In production you would load these from a database
# or parse actual policy PDFs; here they are authoritative structured records.
# The critical point: coverage_pct, deductible_inr, sub_limit_inr etc. are
# STRUCTURED FIELDS — the LLM never sees them or writes them.

POLICY_CORPUS: list[dict] = [

    # ═══════════════════════════════  Star Health  ════════════════════════════

    {"insurer": "Star Health", "policy_version": "2026", "clause_id": "SH-4.1",
     "clause_type": "coverage", "covered": True,
     "coverage_pct": 0.80, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 0, "preauth_required": True,
     "tags": "hospitalization,surgery,general,inpatient",
     "text": (
         "Star Health Clause 4.1 — General Hospitalisation Coverage. "
         "All medically necessary inpatient hospitalisations and surgical procedures are covered "
         "at 80% of admissible claim after deductible. Pre-authorisation mandatory for planned "
         "admissions. Minimum 24-hour hospitalisation required unless procedure is listed in the "
         "approved day-care schedule."
     )},

    {"insurer": "Star Health", "policy_version": "2026", "clause_id": "SH-4.2",
     "clause_type": "coverage", "covered": True,
     "coverage_pct": 0.80, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 0, "preauth_required": True,
     "tags": "surgery,general,laparoscopic,abdominal,appendix,hernia",
     "text": (
         "Star Health Clause 4.2 — General Surgical Coverage. "
         "General surgical procedures including open and laparoscopic techniques are covered "
         "under this clause. Procedures must be performed by a qualified surgeon at an empanelled "
         "hospital. Coverage is 80% of admissible claim. Cosmetic or aesthetic surgeries are excluded."
     )},

    {"insurer": "Star Health", "policy_version": "2026", "clause_id": "SH-4.3",
     "clause_type": "coverage", "covered": True,
     "coverage_pct": 0.80, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 0, "preauth_required": True,
     "tags": "orthopaedic,bone,joint,knee,hip,spine,fracture,replacement,TKR,THR",
     "text": (
         "Star Health Clause 4.3 — Orthopaedic Surgical Coverage. "
         "Orthopaedic procedures including joint replacement (knee, hip), spinal surgeries, "
         "and fracture fixation are covered at 80% of admissible claim. "
         "Total Knee Replacement (TKR) and Total Hip Replacement (THR) require documented "
         "failure of conservative treatment for a minimum of 6 months prior to surgery. "
         "Pre-authorisation is mandatory."
     )},

    {"insurer": "Star Health", "policy_version": "2026", "clause_id": "SH-5.1",
     "clause_type": "coverage", "covered": True,
     "coverage_pct": 0.80, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 0, "preauth_required": True,
     "tags": "cardiac,heart,bypass,angioplasty,stent,CABG,valve",
     "text": (
         "Star Health Clause 5.1 — Cardiac Procedures. "
         "Medically necessary cardiac procedures including CABG, valve replacement, and "
         "coronary angioplasty/stenting are covered at 80% if supported by cardiologist "
         "recommendation and diagnostic evidence (ECG, Echo, Angiogram). "
         "Pre-authorisation mandatory."
     )},

    {"insurer": "Star Health", "policy_version": "2026", "clause_id": "SH-7.1",
     "clause_type": "waiting_period", "covered": False,
     "coverage_pct": 0.0, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 730, "preauth_required": False,
     "tags": "pre-existing,PED,waiting,diabetes,hypertension,asthma,COPD",
     "text": (
         "Star Health Clause 7.1 — Pre-existing Disease Waiting Period. "
         "All pre-existing diseases and conditions known at policy inception are subject to a "
         "24-month (730-day) waiting period from the policy start date. Claims arising from "
         "pre-existing conditions within this period will be denied."
     )},

    {"insurer": "Star Health", "policy_version": "2026", "clause_id": "SH-8.1",
     "clause_type": "exclusion", "covered": False,
     "coverage_pct": 0.0, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 0, "preauth_required": False,
     "tags": "dental,cosmetic,aesthetic,implant,teeth,whitening,braces",
     "text": (
         "Star Health Clause 8.1 — Dental and Cosmetic Exclusions. "
         "Dental treatments, cosmetic surgeries, and aesthetic procedures are excluded unless "
         "they are directly necessitated by an accident resulting in hospitalisation. "
         "Routine dental care, implants, orthodontics, and teeth whitening are not covered."
     )},

    {"insurer": "Star Health", "policy_version": "2026", "clause_id": "SH-9.1",
     "clause_type": "sub_limit", "covered": True,
     "coverage_pct": 0.80, "deductible_inr": 0.0, "sub_limit_inr": 5000.0,
     "waiting_days": 0, "preauth_required": False,
     "tags": "room,rent,accommodation,ward,ICU",
     "text": (
         "Star Health Clause 9.1 — Room Rent Sub-limit. "
         "Room rent is capped at 1% of sum insured per day for general ward and 2% for ICU. "
         "If a room costing more than the sub-limit is occupied, proportionate deduction applies "
         "to all associated medical expenses."
     )},

    # ═══════════════════════════════  HDFC Ergo  ══════════════════════════════

    {"insurer": "HDFC Ergo", "policy_version": "2026", "clause_id": "HE-3.1",
     "clause_type": "coverage", "covered": True,
     "coverage_pct": 0.90, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 0, "preauth_required": True,
     "tags": "imaging,MRI,CT,PET,scan,radiology,diagnostic",
     "text": (
         "HDFC Ergo Clause 3.1 — Diagnostic Imaging Coverage. "
         "MRI, CT, PET scans and other diagnostic imaging are covered at 90% when ordered by "
         "a specialist on referral. The referral must be documented in the patient file. "
         "Imaging for screening purposes without a specialist referral is not covered."
     )},

    {"insurer": "HDFC Ergo", "policy_version": "2026", "clause_id": "HE-4.1",
     "clause_type": "coverage", "covered": True,
     "coverage_pct": 0.90, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 0, "preauth_required": True,
     "tags": "orthopaedic,knee,hip,joint,spine,replacement,surgery,TKR,THR",
     "text": (
         "HDFC Ergo Clause 4.1 — Orthopaedic Surgery Coverage. "
         "Orthopaedic surgeries are covered at 90% of admissible claim. "
         "Joint replacement procedures (TKR, THR) require documented conservative treatment "
         "for a minimum of 3 months including physiotherapy sessions. "
         "Spinal surgeries require neurologist or orthopaedic specialist recommendation."
     )},

    {"insurer": "HDFC Ergo", "policy_version": "2026", "clause_id": "HE-7.1",
     "clause_type": "waiting_period", "covered": False,
     "coverage_pct": 0.0, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 1095, "preauth_required": False,
     "tags": "pre-existing,PED,waiting,chronic",
     "text": (
         "HDFC Ergo Clause 7.1 — Pre-existing Disease Waiting Period. "
         "Pre-existing diseases are subject to a 36-month (1095-day) waiting period. "
         "Any condition diagnosed or treated within 48 months prior to policy inception "
         "is considered pre-existing."
     )},

    {"insurer": "HDFC Ergo", "policy_version": "2026", "clause_id": "HE-9.1",
     "clause_type": "coverage", "covered": True,
     "coverage_pct": 0.90, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 0, "preauth_required": True,
     "tags": "mental,psychiatry,psychology,depression,anxiety,addiction",
     "text": (
         "HDFC Ergo Clause 9.1 — Mental Health Coverage. "
         "Mental health treatment including inpatient psychiatric care and day-care "
         "psychological treatment is covered at 90%. Outpatient mental health consultations "
         "covered up to ₹5,000 per year. Addiction treatment covered if medically supervised."
     )},

    # ═══════════════════════════════  ICICI Lombard  ══════════════════════════

    {"insurer": "ICICI Lombard", "policy_version": "2026", "clause_id": "IL-5.2",
     "clause_type": "coverage", "covered": True,
     "coverage_pct": 0.75, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 0, "preauth_required": True,
     "tags": "cardiac,heart,bypass,angioplasty,CABG,valve,stent",
     "text": (
         "ICICI Lombard Clause 5.2 — Cardiac Procedure Coverage. "
         "Cardiac procedures including bypass, angioplasty, and valve replacement are covered "
         "at 75% for network hospitals (60% non-network). Diagnostic angiography covered "
         "under Clause 3.1. Prior cardiologist consultation required."
     )},

    {"insurer": "ICICI Lombard", "policy_version": "2026", "clause_id": "IL-6.3",
     "clause_type": "coverage", "covered": True,
     "coverage_pct": 0.75, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 0, "preauth_required": True,
     "tags": "orthopaedic,joint,replacement,knee,hip,TKR,THR,physiotherapy,physio",
     "text": (
         "ICICI Lombard Clause 6.3 — Joint Replacement Surgery. "
         "Joint replacement surgeries (knee, hip) are covered at 75% for network hospitals. "
         "Documented physiotherapy for minimum 3 months is required prior to approval. "
         "Post-surgical physiotherapy up to ₹20,000 reimbursable."
     )},

    {"insurer": "ICICI Lombard", "policy_version": "2026", "clause_id": "IL-7.1",
     "clause_type": "waiting_period", "covered": False,
     "coverage_pct": 0.0, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 730, "preauth_required": False,
     "tags": "pre-existing,PED,waiting,specified",
     "text": (
         "ICICI Lombard Clause 7.1 — Specified Disease Waiting Period. "
         "Named conditions (diabetes, hypertension, arthritis, hernia, cataract, knee/joint "
         "disorders, ENT disorders) are subject to a 24-month waiting period."
     )},

    # ═══════════════════════════════  Max Bupa  ═══════════════════════════════

    {"insurer": "Max Bupa", "policy_version": "2026", "clause_id": "MB-4.1",
     "clause_type": "coverage", "covered": True,
     "coverage_pct": 0.85, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 0, "preauth_required": True,
     "tags": "surgery,general,surgical,comprehensive,all,procedure",
     "text": (
         "Max Bupa Clause 4.1 — Comprehensive Surgical Coverage. "
         "All medically necessary surgical procedures are covered at 85% of admissible claim "
         "after deductible. Laparoscopic procedures are covered at 100% when medically indicated. "
         "Day-care procedures from the approved list of 540+ procedures are covered."
     )},

    {"insurer": "Max Bupa", "policy_version": "2026", "clause_id": "MB-4.2",
     "clause_type": "coverage", "covered": True,
     "coverage_pct": 1.0, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 0, "preauth_required": True,
     "tags": "laparoscopic,minimally,invasive,keyhole,scope",
     "text": (
         "Max Bupa Clause 4.2 — Laparoscopic Procedure Enhancement. "
         "Laparoscopic (minimally invasive) surgical procedures are covered at 100% of admissible "
         "claim when medically indicated. No additional prior-authorisation beyond standard PA "
         "process required."
     )},

    {"insurer": "Max Bupa", "policy_version": "2026", "clause_id": "MB-8.1",
     "clause_type": "exclusion", "covered": False,
     "coverage_pct": 0.0, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 0, "preauth_required": False,
     "tags": "dental,cosmetic,implant,aesthetic",
     "text": (
         "Max Bupa Clause 8.1 — Cosmetic and Dental Exclusions. "
         "Cosmetic and dental procedures are excluded unless arising from accident. "
         "Dental implants, orthodontics, and elective cosmetic surgery are not covered."
     )},

    # ═══════════════════════════════  Bajaj Allianz  ══════════════════════════

    {"insurer": "Bajaj Allianz", "policy_version": "2026", "clause_id": "BA-3.1",
     "clause_type": "coverage", "covered": True,
     "coverage_pct": 0.80, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 0, "preauth_required": True,
     "tags": "hospitalization,surgery,inpatient,general,procedure",
     "text": (
         "Bajaj Allianz Clause 3 — Hospitalisation and Surgical Coverage. "
         "Inpatient hospitalisation and surgical procedures are covered at 80% of admissible "
         "claim. All planned surgical admissions require pre-authorisation at least 72 hours "
         "prior to admission."
     )},

    {"insurer": "Bajaj Allianz", "policy_version": "2026", "clause_id": "BA-8.1",
     "clause_type": "exclusion", "covered": False,
     "coverage_pct": 0.0, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 0, "preauth_required": False,
     "tags": "dental,cosmetic,implant,teeth,aesthetic,orthodontic,whitening",
     "text": (
         "Bajaj Allianz Clause 8.1 — Cosmetic Dental Exclusion. "
         "Cosmetic dental procedures are explicitly excluded. This includes dental implants, "
         "veneers, teeth whitening, orthodontic treatment, and any dental procedure not "
         "arising directly from an accidental injury."
     )},

    {"insurer": "Bajaj Allianz", "policy_version": "2026", "clause_id": "BA-8.2",
     "clause_type": "coverage", "covered": True,
     "coverage_pct": 0.80, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 0, "preauth_required": True,
     "tags": "dental,accident,injury,accidental,trauma,jaw,tooth",
     "text": (
         "Bajaj Allianz Clause 8.2 — Accidental Dental Coverage. "
         "Dental treatment necessitated by accidental injury is covered at 80% of admissible "
         "claim. A police FIR or accident report is required. This clause applies only when "
         "dental injury is a direct consequence of the covered accident."
     )},

    {"insurer": "Bajaj Allianz", "policy_version": "2026", "clause_id": "BA-5.3",
     "clause_type": "coverage", "covered": True,
     "coverage_pct": 0.80, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 0, "preauth_required": True,
     "tags": "vision,eye,ophthalmology,cataract,retina,glaucoma",
     "text": (
         "Bajaj Allianz Clause 5.3 — Vision Care Coverage. "
         "Medically necessary ophthalmic procedures including cataract surgery, retinal "
         "procedures, and glaucoma surgery are covered at 80%. Routine eye examination and "
         "corrective lens prescription are not covered."
     )},

    {"insurer": "Bajaj Allianz", "policy_version": "2026", "clause_id": "BA-7.1",
     "clause_type": "waiting_period", "covered": False,
     "coverage_pct": 0.0, "deductible_inr": 0.0, "sub_limit_inr": 0.0,
     "waiting_days": 730, "preauth_required": False,
     "tags": "pre-existing,PED,waiting,chronic",
     "text": (
         "Bajaj Allianz Clause 7.1 — Pre-existing Condition Waiting Period. "
         "Pre-existing diseases are subject to a 24-month waiting period. "
         "Any condition for which the insured had symptoms, diagnosis or treatment prior to "
         "policy inception is considered pre-existing."
     )},
]


# ── ChromaDB vector store (with keyword fallback) ──────────────────────────────
_chroma_client = None
_collection = None
_use_fallback = False

def _get_collection():
    global _chroma_client, _collection, _use_fallback
    if _collection is not None:
        return _collection

    try:
        import chromadb
        from chromadb.config import Settings as ChromaSettings
        persist_dir = os.environ.get("CHROMA_PERSIST_DIR", "/tmp/insurcare_chroma")
        _chroma_client = chromadb.PersistentClient(
            path=persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        _collection = _chroma_client.get_or_create_collection(
            name="policy_clauses",
            metadata={"hnsw:space": "cosine"},
        )
        if _collection.count() == 0:
            _seed_collection(_collection)
    except Exception:
        _use_fallback = True

    return _collection  # may be None — callers handle fallback


def _seed_collection(col):
    """Embed and store every clause in the corpus."""
    ids, docs, metas = [], [], []
    for clause in POLICY_CORPUS:
        # Stable deterministic ID
        cid = hashlib.md5(f"{clause['insurer']}::{clause['clause_id']}".encode()).hexdigest()
        ids.append(cid)
        docs.append(clause["text"])
        metas.append({
            "insurer":         clause["insurer"],
            "clause_id":       clause["clause_id"],
            "clause_type":     clause["clause_type"],
            "covered":         str(clause["covered"]),       # chroma metadata must be str/int/float
            "coverage_pct":    clause["coverage_pct"],
            "deductible_inr":  clause["deductible_inr"],
            "sub_limit_inr":   clause["sub_limit_inr"],
            "waiting_days":    clause["waiting_days"],
            "preauth_required":str(clause["preauth_required"]),
            "tags":            clause["tags"],
        })

    # Chroma's default embedding is all-MiniLM-L6-v2 via chromadb's bundled
    # sentence-transformers; no separate install needed.
    col.add(ids=ids, documents=docs, metadatas=metas)


# ── Public retrieval function ──────────────────────────────────────────────────

def retrieve_policy_clauses(
    insurer: str,
    procedure_name: str,
    diagnosis: str,
    clinical_justification: str,
    n_results: int = 6,
    policy_version: str = "2026",
) -> list[dict]:
    """
    Retrieve the top-n policy clauses most relevant to this PA request.

    Returns a list of dicts, each with:
      clause_id, clause_type, covered (bool), coverage_pct, deductible_inr,
      sub_limit_inr, waiting_days, preauth_required (bool), text

    Uses ChromaDB vector search when available; falls back to keyword matching.
    """
    col = _get_collection()

    # Fuzzy-match insurer name so "Star Health Insurance Ltd." still hits "Star Health"
    insurer_key = _match_insurer(insurer)

        # ── ChromaDB path ───────────────────────────────────────────────────────────
    if col is not None and col.count() > 0:
        query = (
            f"Insurance coverage for {procedure_name}. "
            f"Diagnosis: {diagnosis}. "
            f"Justification: {clinical_justification[:300]}. "
            f"Insurer: {insurer}."
        )
        where_filter = {"insurer": {"$eq": insurer_key}} if insurer_key else None

        try:
            results = col.query(
                query_texts=[query],
                n_results=min(n_results, col.count()),
                where=where_filter,
                include=["documents", "metadatas", "distances"],
            )
        except Exception:
            results = col.query(
                query_texts=[query],
                n_results=min(n_results, col.count()),
                include=["documents", "metadatas", "distances"],
            )

        clauses = []
        for doc, meta, dist in zip(results["documents"][0], results["metadatas"][0], results["distances"][0]):
            similarity = round(1.0 - dist, 3)
            if similarity < SIMILARITY_THRESHOLD:
                continue
            clauses.append({
                "clause_id": meta["clause_id"], "clause_type": meta["clause_type"],
                "covered": meta["covered"] == "True",
                "coverage_pct": float(meta["coverage_pct"]),
                "deductible_inr": float(meta["deductible_inr"]),
                "sub_limit_inr": float(meta["sub_limit_inr"]),
                "waiting_days": int(meta["waiting_days"]),
                "preauth_required": meta["preauth_required"] == "True",
                "similarity": similarity, "text": doc,
            })
        return clauses

    # ── Keyword fallback (no ChromaDB) ──────────────────────────────────────────
    keywords = (procedure_name + " " + diagnosis + " " + clinical_justification).lower().split()
    scored = []
    for clause in POLICY_CORPUS:
        if insurer_key and clause["insurer"].lower() != insurer_key.lower():
            continue
        if clause.get("policy_version", "2026") != policy_version:
            continue
        text_lower = clause["text"].lower() + " " + clause["tags"].lower()
        match_count = sum(1 for kw in keywords if len(kw) > 3 and kw in text_lower)
        scored.append((match_count, clause))
    scored.sort(key=lambda x: -x[0])
    return [{
        "clause_id": c["clause_id"], "clause_type": c["clause_type"],
        "covered": c["covered"],
        "coverage_pct": c["coverage_pct"],
        "deductible_inr": c["deductible_inr"],
        "sub_limit_inr": c["sub_limit_inr"],
        "waiting_days": c["waiting_days"],
        "preauth_required": c["preauth_required"],
        "similarity": min(1.0, s / 5.0) if s > 0 else 0.5,
        "text": c["text"],
    } for s, c in scored[:n_results] if s > 0] or [{
        "clause_id": c["clause_id"], "clause_type": c["clause_type"],
        "covered": c["covered"],
        "coverage_pct": c["coverage_pct"],
        "deductible_inr": c["deductible_inr"],
        "sub_limit_inr": c["sub_limit_inr"],
        "waiting_days": c["waiting_days"],
        "preauth_required": c["preauth_required"],
        "similarity": 0.5, "text": c["text"],
    } for c in POLICY_CORPUS if c["covered"] and (not insurer_key or c["insurer"] == insurer_key) and c.get("policy_version", "2026") == policy_version][:n_results]


def _match_insurer(raw: str) -> Optional[str]:
    """Fuzzy-match raw insurer name to a corpus key."""
    known = {c["insurer"] for c in POLICY_CORPUS}
    raw_lower = raw.lower()
    for k in known:
        if k.lower() in raw_lower or raw_lower in k.lower():
            return k
    return None


def build_grounded_context(clauses: list[dict]) -> str:
    """
    Format retrieved clauses into the LLM context block.
    Each clause is clearly labelled with its ID so the LLM can cite it.
    The financial metadata is deliberately OMITTED from this block —
    the LLM's job is ONLY to decide which clauses match.
    """
    if not clauses:
        return "No specific policy clauses retrieved for this insurer/procedure combination."

    lines = ["RETRIEVED POLICY CLAUSES (cite only these — do not use prior knowledge):"]
    lines.append("=" * 70)
    for i, c in enumerate(clauses, 1):
        ctype = c["clause_type"].upper()
        lines.append(f"\n[{i}] Clause {c['clause_id']} ({ctype}) — similarity {c['similarity']:.2f}")
        lines.append(c["text"])
    lines.append("=" * 70)
    return "\n".join(lines)


def extract_financial_facts(matched_clause_ids: list[str], clauses: list[dict]) -> dict:
    """
    Given the clause IDs the LLM said matched, pull the authoritative
    structured financial metadata.  This is the anti-hallucination payoff:
    coverage_pct, waiting_days etc. come from the corpus, never from the LLM.

    Returns the most permissive coverage clause's figures (highest coverage_pct)
    plus any blocking exclusions or waiting periods found.
    """
    # Build lookup
    by_id = {c["clause_id"]: c for c in clauses}

    coverage_clauses  = []
    exclusion_clauses = []
    waiting_clauses   = []

    for cid in matched_clause_ids:
        c = by_id.get(cid)
        if not c:
            continue
        if c["clause_type"] == "exclusion":
            exclusion_clauses.append(c)
        elif c["clause_type"] == "waiting_period":
            waiting_clauses.append(c)
        elif c["covered"]:
            coverage_clauses.append(c)

    # Blocking: if any exclusion or waiting period matched, coverage is denied
    if exclusion_clauses:
        return {
            "covered":         False,
            "coverage_pct":    0.0,
            "deductible_inr":  0.0,
            "sub_limit_inr":   0.0,
            "waiting_days":    0,
            "preauth_required":False,
            "blocking_clause": exclusion_clauses[0]["clause_id"],
            "blocking_type":   "exclusion",
        }

    if waiting_clauses:
        max_wait = max(w["waiting_days"] for w in waiting_clauses)
        return {
            "covered":         False,
            "coverage_pct":    0.0,
            "deductible_inr":  0.0,
            "sub_limit_inr":   0.0,
            "waiting_days":    max_wait,
            "preauth_required":False,
            "blocking_clause": waiting_clauses[0]["clause_id"],
            "blocking_type":   "waiting_period",
        }

    if not coverage_clauses:
        return {
            "covered":         False,
            "coverage_pct":    0.0,
            "deductible_inr":  0.0,
            "sub_limit_inr":   0.0,
            "waiting_days":    0,
            "preauth_required":False,
            "blocking_clause": None,
            "blocking_type":   "no_matching_clause",
        }

    # Pick the best coverage clause
    best = max(coverage_clauses, key=lambda c: c["coverage_pct"])
    return {
        "covered":         True,
        "coverage_pct":    best["coverage_pct"],
        "deductible_inr":  best["deductible_inr"],
        "sub_limit_inr":   best["sub_limit_inr"],
        "waiting_days":    best["waiting_days"],
        "preauth_required":best["preauth_required"],
        "blocking_clause": None,
        "blocking_type":   None,
    }
