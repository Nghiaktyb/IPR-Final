"""
MedicX — Case Management & AI Inference Router
Handles X-ray case creation, file upload, AI analysis, and finding validation.
"""
import os
import uuid
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from typing import Optional

from app.database import get_db
from app.models.user import User, UserRole
from app.models.patient import Patient
from app.models.case import Case, Finding, CaseStatus, ValidationStatus
from app.schemas.case import (
    CaseResponse, CaseListResponse, FindingResponse, FindingValidate,
    InferenceResponse, InferenceResult,
)
from app.middleware.auth import get_current_user, log_action, decode_token
from app.services.ai_service import ai_model
from app.services.gradcam_service import generate_all_heatmaps
from app.config import settings
from datetime import datetime, timezone

router = APIRouter(prefix="/api/cases", tags=["Cases"])


def _get_user_from_query_token(token: str, db: Session) -> User:
    """Authenticate user from a query-string token (for <img> src usage)."""
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".dcm", ".dicom"}


@router.post("/", response_model=CaseResponse, status_code=201)
async def create_case(
    request: Request,
    patient_id: str = Form(...),
    clinical_notes: Optional[str] = Form(None),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a new X-ray image and create a case.
    Validates the file, saves it, and triggers AI analysis.
    """
    # Validate patient exists
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Validate file type
    ext = os.path.splitext(image.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Save the uploaded file
    file_id = str(uuid.uuid4())
    filename = f"{file_id}{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)

    with open(filepath, "wb") as buffer:
        content = await image.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        if len(content) > 50 * 1024 * 1024:  # 50MB limit
            raise HTTPException(status_code=400, detail="File too large (max 50MB)")
        buffer.write(content)

    # Create case record
    case = Case(
        patient_id=patient_id,
        uploaded_by=current_user.id,
        image_path=filepath,
        image_filename=image.filename,
        clinical_notes=clinical_notes,
        status=CaseStatus.PENDING,
    )
    db.add(case)
    db.commit()
    db.refresh(case)

    log_action(db, current_user.id, "upload_xray", "case", case.id,
               details={"filename": image.filename, "patient_id": patient_id},
               ip_address=request.client.host if request.client else None)

    # Auto-trigger AI analysis
    try:
        _run_ai_analysis(db, case, current_user, request)
    except Exception as e:
        # Don't fail the upload if AI fails; mark for retry
        print(f"[WARN] AI analysis failed for case {case.id}: {e}")

    db.refresh(case)
    return _case_to_response(db, case)


@router.get("/", response_model=CaseListResponse)
def list_cases(
    patient_id: Optional[str] = Query(None),
    status: Optional[CaseStatus] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List cases with filters."""
    query = db.query(Case)

    if patient_id:
        query = query.filter(Case.patient_id == patient_id)
    if status:
        query = query.filter(Case.status == status)

    total = query.count()
    cases = query.order_by(Case.created_at.desc()).offset(skip).limit(limit).all()

    return CaseListResponse(
        cases=[_case_to_response(db, c) for c in cases],
        total=total,
    )


@router.get("/{case_id}", response_model=CaseResponse)
def get_case(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a case with all findings."""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    log_action(db, current_user.id, "view_case", "case", case.id)
    return _case_to_response(db, case)


@router.get("/{case_id}/image")
def get_case_image(
    case_id: str,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """Serve the original X-ray image file. Auth via query param token."""
    _get_user_from_query_token(token, db)
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if not os.path.exists(case.image_path):
        raise HTTPException(status_code=404, detail="Image file not found")

    return FileResponse(case.image_path, media_type="image/png")


@router.get("/{case_id}/heatmap/{disease}")
def get_heatmap(
    case_id: str,
    disease: str,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """Serve a Grad-CAM heatmap image for a specific disease. Auth via query param token."""
    _get_user_from_query_token(token, db)
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if disease not in settings.DISEASE_CLASSES:
        raise HTTPException(status_code=400, detail=f"Invalid disease. Valid: {settings.DISEASE_CLASSES}")

    heatmap_paths = case.heatmap_paths or {}
    heatmap_path = heatmap_paths.get(disease)

    if not heatmap_path or not os.path.exists(heatmap_path):
        raise HTTPException(status_code=404, detail=f"Heatmap not available for {disease}")

    return FileResponse(heatmap_path, media_type="image/png")


@router.post("/{case_id}/analyze", response_model=InferenceResponse)
def rerun_analysis(
    case_id: str,
    request: Request,
    threshold: Optional[float] = Query(None, ge=0.0, le=1.0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-run AI analysis on a case (e.g., with different threshold)."""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if threshold is not None:
        case.sensitivity_threshold = threshold

    _run_ai_analysis(db, case, current_user, request)
    db.refresh(case)

    # Build response
    findings = db.query(Finding).filter(Finding.case_id == case_id).all()
    results = [
        InferenceResult(
            disease=f.disease_name,
            confidence=f.confidence_score,
            is_flagged=f.is_flagged == "true",
            heatmap_url=f"/api/cases/{case_id}/heatmap/{f.disease_name}" if f.heatmap_path else None,
        )
        for f in findings
    ]

    return InferenceResponse(
        case_id=case_id,
        results=results,
        threshold=case.sensitivity_threshold,
        flagged_conditions=[r.disease for r in results if r.is_flagged],
    )


# ─── Finding Validation ────────────────────────────────
@router.put("/findings/{finding_id}/validate", response_model=FindingResponse)
def validate_finding(
    finding_id: str,
    data: FindingValidate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Accept, reject, or edit an AI finding."""
    finding = db.query(Finding).filter(Finding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    finding.validation_status = data.validation_status
    finding.doctor_notes = data.doctor_notes
    finding.validated_by = current_user.id
    finding.validated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(finding)

    log_action(db, current_user.id, "validate_finding", "finding", finding.id,
               details={"status": data.validation_status.value, "disease": finding.disease_name},
               ip_address=request.client.host if request.client else None)

    return FindingResponse.model_validate(finding)


@router.put("/{case_id}/finalize")
def finalize_case(
    case_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Finalize a case — lock the diagnosis."""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    case.status = CaseStatus.FINALIZED
    db.commit()

    log_action(db, current_user.id, "finalize_case", "case", case.id,
               ip_address=request.client.host if request.client else None)

    return {"message": "Case finalized", "case_id": case_id}


# ─── Helper Functions ──────────────────────────────────
def _run_ai_analysis(db: Session, case: Case, user: User, request: Request):
    """Run AI inference and Grad-CAM on a case."""
    threshold = case.sensitivity_threshold or settings.DEFAULT_THRESHOLD

    # Run prediction
    prediction = ai_model.predict(case.image_path, threshold)

    # Store raw results
    case.ai_results = prediction
    case.status = CaseStatus.ANALYZED

    # Clear old findings
    db.query(Finding).filter(Finding.case_id == case.id).delete()

    # Generate heatmaps
    heatmap_paths = generate_all_heatmaps(case.image_path, case.id, threshold)
    case.heatmap_paths = {k: v for k, v in heatmap_paths.items() if v is not None}

    # Create finding records
    for disease, data in prediction["predictions"].items():
        finding = Finding(
            case_id=case.id,
            disease_name=disease,
            confidence_score=data["confidence"],
            is_flagged="true" if data["is_flagged"] else "false",
            heatmap_path=heatmap_paths.get(disease),
        )
        db.add(finding)

    db.commit()

    log_action(db, user.id, "ai_analysis", "case", case.id,
               details={
                   "flagged": prediction.get("flagged_conditions", []),
                   "threshold": threshold,
               },
               ip_address=request.client.host if request.client else None)


def _case_to_response(db: Session, case: Case) -> CaseResponse:
    """Convert Case model to response with relationships."""
    findings = db.query(Finding).filter(Finding.case_id == case.id).all()
    patient = db.query(Patient).filter(Patient.id == case.patient_id).first()
    uploader = db.query(User).filter(User.id == case.uploaded_by).first()

    return CaseResponse(
        id=case.id,
        patient_id=case.patient_id,
        uploaded_by=case.uploaded_by,
        image_filename=case.image_filename,
        clinical_notes=case.clinical_notes,
        status=case.status,
        sensitivity_threshold=case.sensitivity_threshold,
        findings=[FindingResponse.model_validate(f) for f in findings],
        created_at=case.created_at,
        patient_name=patient.full_name if patient else None,
        uploaded_by_name=uploader.full_name if uploader else None,
    )
