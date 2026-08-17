"""
InsurCare AI — Document Verification with Structured Extraction
================================================================
Enhanced document verification that extracts structured fields from PDFs
and compares them against the PA request for evidence-driven decisions.
"""

import io, re
from typing import Optional
from PyPDF2 import PdfReader


def extract_text_from_pdf(file_bytes: bytes) -> Optional[str]:
    """Extract text from a PDF file. Returns None on failure."""
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        return "\n".join(pages) if pages else None
    except Exception:
        return None


# ══════════════════════════════════════════════════════════════════════════════
# Structured field extraction from document text
# ══════════════════════════════════════════════════════════════════════════════

_ICD_PATTERN = re.compile(r'[A-Z]\d{2}(?:\.\d{1,4})?')
_CPT_PATTERN = re.compile(r'(?:CPT|cpt)[\s\-:]*(\d{5})')
_PHONE_PATTERN = re.compile(r'(?:\+91[\s\-]?)?([6-9]\d{9})')
_DATE_PATTERN = re.compile(r'(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})')


def extract_structured_fields(text: str) -> dict:
    """Extract structured fields from medical document text using regex patterns."""
    text_lower = text.lower()
    extracted = {
        "icd_codes": [],
        "cpt_codes": [],
        "patient_name_found": False,
        "doctor_name_found": False,
        "hospital_name_found": False,
        "date_found": False,
        "clinical_findings": [],
        "treatment_history": [],
        "doctor_recommendation_found": False,
        "lab_results_found": False,
        "imaging_results_found": False,
    }

    # ICD codes
    extracted["icd_codes"] = list(set(_ICD_PATTERN.findall(text)))

    # CPT codes
    cpt_matches = _CPT_PATTERN.findall(text)
    extracted["cpt_codes"] = [f"CPT-{c}" for c in cpt_matches]

    # Doctor name patterns
    doctor_patterns = [
        r'dr\.?\s+[A-Z][a-z]+\s+[A-Z][a-z]+',
        r'doctor[\s:]+([A-Z][a-z]+\s+[A-Z][a-z]+)',
        r'referring\s+physician[\s:]+([A-Z][a-z]+\s+[A-Z][a-z]+)',
    ]
    for pat in doctor_patterns:
        m = re.search(pat, text)
        if m:
            extracted["doctor_name_found"] = True
            break

    # Hospital name patterns
    hospital_keywords = ["hospital", "medical center", "clinic", "healthcare", "institute", "nursing home"]
    if any(kw in text_lower for kw in hospital_keywords):
        extracted["hospital_name_found"] = True

    # Clinical findings
    finding_keywords = ["finding", "diagnosis", "presented with", "examination reveals", "symptoms include",
                        "clinical presentation", "observation"]
    for kw in finding_keywords:
        if kw in text_lower:
            idx = text_lower.index(kw)
            snippet = text[max(0, idx-20):idx+200].strip()
            extracted["clinical_findings"].append(snippet[:150])

    # Treatment history
    history_keywords = ["treatment history", "previous treatment", "past treatment", "prior treatment",
                        "treated with", "failed", "ineffective", "conservative"]
    for kw in history_keywords:
        if kw in text_lower:
            idx = text_lower.index(kw)
            snippet = text[max(0, idx-20):idx+200].strip()
            extracted["treatment_history"].append(snippet[:150])

    # Doctor recommendation
    rec_keywords = ["recommend", "advised", "suggested", "referred for", "indicated for",
                    "surgical intervention", "procedure is warranted"]
    if any(kw in text_lower for kw in rec_keywords):
        extracted["doctor_recommendation_found"] = True

    # Lab results
    lab_keywords = ["lab result", "blood test", "hemoglobin", "creatinine", "glucose",
                    "lipid panel", "cbc", "complete blood"]
    if any(kw in text_lower for kw in lab_keywords):
        extracted["lab_results_found"] = True

    # Imaging results
    imaging_keywords = ["x-ray", "mri", "ct scan", "ultrasound", "radiology", "imaging",
                        "magnetic resonance", "computed tomography"]
    if any(kw in text_lower for kw in imaging_keywords):
        extracted["imaging_results_found"] = True

    # Date found
    if _DATE_PATTERN.search(text):
        extracted["date_found"] = True

    return extracted


# ══════════════════════════════════════════════════════════════════════════════
# Document-Request comparison (evidence matching)
# ══════════════════════════════════════════════════════════════════════════════

def compare_document_to_request(extracted: dict, request_data: dict) -> dict:
    """Compare extracted document fields against the PA request for mismatches."""
    comparison = {
        "matches": [],
        "mismatches": [],
        "missing_in_document": [],
    }

    # Compare ICD codes
    req_diagnosis_code = request_data.get("diagnosis_code", "")
    if req_diagnosis_code and extracted.get("icd_codes"):
        req_code_clean = req_diagnosis_code.strip().upper()
        doc_codes = [c.upper() for c in extracted["icd_codes"]]
        if any(req_code_clean.startswith(dc[:3]) for dc in doc_codes):
            comparison["matches"].append(f"Diagnosis code {req_code_code} found in document")
        else:
            comparison["mismatches"].append(
                f"Diagnosis code mismatch: Request has {req_code_clean}, document has {', '.join(extracted['icd_codes'])}"
            )

    # Compare CPT codes
    req_procedure_code = request_data.get("procedure_code", "")
    if req_procedure_code and extracted.get("cpt_codes"):
        req_code_clean = req_procedure_code.strip().upper()
        doc_codes = [c.upper() for c in extracted["cpt_codes"]]
        if req_code_clean in doc_codes:
            comparison["matches"].append(f"Procedure code {req_procedure_code} found in document")
        else:
            comparison["mismatches"].append(
                f"Procedure code mismatch: Request has {req_code_clean}, document has {', '.join(extracted['cpt_codes'])}"
            )

    # Check patient name
    patient_name = request_data.get("patient_name", "")
    if patient_name:
        name_parts = patient_name.strip().lower().split()
        if name_parts and name_parts[-1] in str(extracted.get("patient_name_found", False)):
            comparison["matches"].append("Patient name found in document")

    # Check for doctor recommendation
    if not extracted.get("doctor_recommendation_found"):
        comparison["missing_in_document"].append("Doctor recommendation")

    return comparison


# ══════════════════════════════════════════════════════════════════════════════
# Keyword verification (original + enhanced)
# ══════════════════════════════════════════════════════════════════════════════

def verify_document_keywords(
    extracted_text: str,
    patient_name: str,
    diagnosis: Optional[str] = None,
    procedure_name: Optional[str] = None,
) -> dict:
    """Check if extracted text mentions the claimed patient, diagnosis, or procedure."""
    text_lower = extracted_text.lower()
    result = {
        "patient_name_found": False,
        "diagnosis_found": False,
        "procedure_found": False,
        "text_length": len(extracted_text),
        "issues": [],
    }

    name_parts = patient_name.strip().lower().split()
    if name_parts:
        last_name = name_parts[-1]
        if last_name in text_lower:
            result["patient_name_found"] = True
        else:
            result["issues"].append(f"Patient last name '{last_name}' not found in document")

    if diagnosis:
        diag_keywords = [kw.strip().lower() for kw in diagnosis.replace(",", " ").split() if len(kw.strip()) > 3]
        matches = sum(1 for kw in diag_keywords if kw in text_lower)
        if matches >= max(1, len(diag_keywords) // 3):
            result["diagnosis_found"] = True
        else:
            result["issues"].append("Diagnosis keywords not found in document")

    if procedure_name:
        proc_keywords = [kw.strip().lower() for kw in procedure_name.replace(",", " ").split() if len(kw.strip()) > 3]
        matches = sum(1 for kw in proc_keywords if kw in text_lower)
        if matches >= max(1, len(proc_keywords) // 3):
            result["procedure_found"] = True
        else:
            result["issues"].append("Procedure keywords not found in document")

    checks_passed = sum([
        result["patient_name_found"],
        result["diagnosis_found"] or not diagnosis,
        result["procedure_found"] or not procedure_name,
    ])
    checks_total = 3
    result["confidence"] = round(checks_passed / checks_total, 2)
    result["status"] = "verified" if result["confidence"] >= 0.67 else "partial" if result["confidence"] > 0 else "unverified"

    return result


# ══════════════════════════════════════════════════════════════════════════════
# Full verification pipeline
# ══════════════════════════════════════════════════════════════════════════════

def verify_document(
    file_bytes: bytes,
    filename: str,
    patient_name: str,
    diagnosis: Optional[str] = None,
    procedure_name: Optional[str] = None,
    request_data: Optional[dict] = None,
) -> dict:
    """Full document verification pipeline: extract + structured extraction + check."""
    result = {
        "filename": filename,
        "extractable": False,
        "verification": None,
        "structured_fields": None,
        "document_request_comparison": None,
    }

    if not filename.lower().endswith(".pdf"):
        result["verification"] = {"status": "skipped", "issues": ["Only PDF documents are verified automatically"]}
        return result

    text = extract_text_from_pdf(file_bytes)
    if not text or len(text.strip()) < 10:
        result["verification"] = {"status": "unreadable", "issues": ["Could not extract readable text from PDF"]}
        return result

    result["extractable"] = True
    result["verification"] = verify_document_keywords(text, patient_name, diagnosis, procedure_name)

    # Structured extraction
    extracted_fields = extract_structured_fields(text)
    result["structured_fields"] = extracted_fields

    # Compare with request if request_data provided
    if request_data:
        comparison = compare_document_to_request(extracted_fields, request_data)
        result["document_request_comparison"] = comparison

    return result
