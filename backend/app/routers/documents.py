from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User
from ..models.pa_request import PARequest
from ..security import get_current_user
from ..services.document_verification import verify_document
from ..services.audit import log_action

router = APIRouter(prefix="/api/requests", tags=["documents"])

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/{request_id}/verify-documents")
async def verify_documents(
    request_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    req = db.get(PARequest, request_id)
    if not req:
        raise HTTPException(404, "Request not found")

    # RBAC check
    if user.role == "hospital":
        if user.hospital:
            from ..models.user import User as UserModel
            hospital_user_ids = [
                u.id for u in db.query(UserModel).filter(
                    UserModel.role == "hospital",
                    UserModel.hospital == user.hospital
                ).all()
            ]
            if req.user_id not in hospital_user_ids:
                raise HTTPException(403, "Access denied")
        else:
            raise HTTPException(403, "Access denied")
    elif user.role == "insurer":
        if req.insurance_provider != user.company_name:
            raise HTTPException(403, "Access denied")
    else:
        raise HTTPException(403, "Access denied")

    results = []
    verified_count = 0

    for file in files:
        ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if ext not in ALLOWED_EXTENSIONS:
            results.append({"filename": file.filename, "status": "skipped", "issues": [f"Unsupported file type: {ext}"]})
            continue

        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            results.append({"filename": file.filename, "status": "skipped", "issues": ["File too large (max 10MB)"]})
            continue

        verification = verify_document(
            file_bytes=content,
            filename=file.filename,
            patient_name=req.patient_name,
            diagnosis=req.diagnosis,
            procedure_name=req.procedure_name,
        )
        results.append(verification)
        if verification.get("verification", {}).get("status") == "verified":
            verified_count += 1

    # Store verification results on the request
    existing_docs = req.documents or []
    for r in results:
        existing_docs.append({
            "filename": r.get("filename", "unknown"),
            "verification": r.get("verification", {}),
        })
    req.documents = existing_docs

    log_action(db, user_id=user.id, user_email=user.email, user_role=user.role,
               action="verify_documents", resource_type="pa_request", resource_id=req.id,
               detail=f"Verified {len(results)} documents, {verified_count} passed")

    db.commit()

    # Start the AI pipeline after documents are saved and verified
    if req.status == "pending":
        import threading
        def _run_pipeline():
            from ..database import SessionLocal as _SL
            from ..agents.orchestrator import run_pipeline as _rp
            _db = _SL()
            try:
                _req = _db.get(PARequest, req.id)
                if _req:
                    _rp(_db, _req)
            finally:
                _db.close()
        threading.Thread(target=_run_pipeline, daemon=True).start()

    return {
        "request_id": req.id,
        "total": len(results),
        "verified": verified_count,
        "results": results,
    }
