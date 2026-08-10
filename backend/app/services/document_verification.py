import io
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

    # Check patient name (last name at minimum)
    name_parts = patient_name.strip().lower().split()
    if name_parts:
        last_name = name_parts[-1]
        if last_name in text_lower:
            result["patient_name_found"] = True
        else:
            result["issues"].append(f"Patient last name '{last_name}' not found in document")

    # Check diagnosis keywords
    if diagnosis:
        diag_keywords = [kw.strip().lower() for kw in diagnosis.replace(",", " ").split() if len(kw.strip()) > 3]
        matches = sum(1 for kw in diag_keywords if kw in text_lower)
        if matches >= max(1, len(diag_keywords) // 3):
            result["diagnosis_found"] = True
        else:
            result["issues"].append(f"Diagnosis keywords not found in document")

    # Check procedure keywords
    if procedure_name:
        proc_keywords = [kw.strip().lower() for kw in procedure_name.replace(",", " ").split() if len(kw.strip()) > 3]
        matches = sum(1 for kw in proc_keywords if kw in text_lower)
        if matches >= max(1, len(proc_keywords) // 3):
            result["procedure_found"] = True
        else:
            result["issues"].append(f"Procedure keywords not found in document")

    # Overall verdict
    checks_passed = sum([
        result["patient_name_found"],
        result["diagnosis_found"] or not diagnosis,
        result["procedure_found"] or not procedure_name,
    ])
    checks_total = 3
    result["confidence"] = round(checks_passed / checks_total, 2)
    result["status"] = "verified" if result["confidence"] >= 0.67 else "partial" if result["confidence"] > 0 else "unverified"

    return result


def verify_document(
    file_bytes: bytes,
    filename: str,
    patient_name: str,
    diagnosis: Optional[str] = None,
    procedure_name: Optional[str] = None,
) -> dict:
    """Full document verification pipeline: extract + check."""
    result = {
        "filename": filename,
        "extractable": False,
        "verification": None,
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
    return result
