"""
MedicX — Patient Management Router
Handles CRUD operations for patient profiles.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.user import User, UserRole
from app.models.patient import Patient
from app.models.case import Case
from app.schemas.patient import (
    PatientCreate, PatientUpdate, PatientResponse, PatientListResponse,
)
from app.middleware.auth import get_current_user, log_action, require_role
from app.services import data_retention_service

router = APIRouter(prefix="/api/patients", tags=["Patients"])


@router.post("/", response_model=PatientResponse, status_code=201)
def create_patient(
    data: PatientCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new patient profile.

    Returns ``409 Conflict`` (with the existing patient's id and name in the
    response body) when ``patient_code`` collides with an existing record so
    the UI can guide the user to the duplicate instead of silently failing.
    """
    existing = (
        db.query(Patient)
        .filter(Patient.patient_code == data.patient_code)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail={
                "detail": (
                    f"A patient with code '{data.patient_code}' already "
                    "exists."
                ),
                "patient_code": data.patient_code,
                "existing_patient_id": existing.id,
                "existing_patient_name": existing.full_name,
            },
        )

    patient = Patient(
        **data.model_dump(),
        created_by=current_user.id,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)

    log_action(
        db, current_user.id, "create_patient", "patient", patient.id,
        details={"patient_code": patient.patient_code},
        ip_address=request.client.host if request.client else None,
    )

    return _patient_to_response(db, patient)


@router.get("/", response_model=PatientListResponse)
def list_patients(
    search: str = Query(None, description="Search by name"),
    include_archived: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List patients with optional search and pagination."""
    query = db.query(Patient)

    if not include_archived:
        query = query.filter(Patient.is_archived == False)

    if search:
        from sqlalchemy import or_
        like = f"%{search}%"
        query = query.filter(or_(
            Patient.full_name.ilike(like),
            Patient.patient_code.ilike(like),
        ))

    total = query.count()
    patients = query.order_by(Patient.created_at.desc()).offset(skip).limit(limit).all()

    return PatientListResponse(
        patients=[_patient_to_response(db, p) for p in patients],
        total=total,
    )


@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a patient profile by ID."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return _patient_to_response(db, patient)


@router.put("/{patient_id}", response_model=PatientResponse)
def update_patient(
    patient_id: str,
    data: PatientUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a patient profile."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    update_data = data.model_dump(exclude_unset=True)

    new_code = update_data.get("patient_code")
    if new_code and new_code != patient.patient_code:
        clash = (
            db.query(Patient)
            .filter(Patient.patient_code == new_code, Patient.id != patient_id)
            .first()
        )
        if clash:
            raise HTTPException(
                status_code=409,
                detail={
                    "detail": (
                        f"A patient with code '{new_code}' already exists."
                    ),
                    "patient_code": new_code,
                    "existing_patient_id": clash.id,
                    "existing_patient_name": clash.full_name,
                },
            )

    for key, value in update_data.items():
        setattr(patient, key, value)

    db.commit()
    db.refresh(patient)

    log_action(db, current_user.id, "update_patient", "patient", patient.id,
               details=update_data,
               ip_address=request.client.host if request.client else None)

    return _patient_to_response(db, patient)


@router.delete("/{patient_id}", status_code=200)
def delete_patient(
    patient_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Permanently delete a patient and every record that hangs off them.

    Admin-only because this also removes linked cases, findings, reports,
    X-ray uploads, AI heatmaps, and PDF reports from disk. Use this for
    one-off cleanup of miscreated patients (typos, duplicates, etc.); the
    bulk retention purge lives at ``/api/admin/retention/purge``.
    """
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    name_for_log = patient.full_name
    code_for_log = patient.patient_code

    stats = data_retention_service.delete_patient_data(db, patient_id)
    if stats.errors and stats.patients_deleted == 0:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete patient: {stats.errors[0]}",
        )

    log_action(
        db, current_user.id, "delete_patient", "patient", patient_id,
        details={
            "name": name_for_log,
            "patient_code": code_for_log,
            "cases_deleted": stats.cases_deleted,
            "findings_deleted": stats.findings_deleted,
            "reports_deleted": stats.reports_deleted,
            "files_removed": stats.files_removed,
            "bytes_removed": stats.bytes_removed,
        },
        ip_address=request.client.host if request.client else None,
    )

    return {
        "message": "Patient deleted",
        "patient_id": patient_id,
        "cases_deleted": stats.cases_deleted,
        "findings_deleted": stats.findings_deleted,
        "reports_deleted": stats.reports_deleted,
        "files_removed": stats.files_removed,
        "bytes_removed": stats.bytes_removed,
        "errors": stats.errors,
    }


@router.post("/{patient_id}/archive", response_model=PatientResponse)
def archive_patient(
    patient_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Archive a patient profile (soft delete)."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    patient.is_archived = True
    db.commit()
    db.refresh(patient)

    log_action(db, current_user.id, "archive_patient", "patient", patient.id,
               ip_address=request.client.host if request.client else None)

    return _patient_to_response(db, patient)


@router.post("/{patient_id}/unarchive", response_model=PatientResponse)
def unarchive_patient(
    patient_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restore an archived patient profile."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    patient.is_archived = False
    db.commit()
    db.refresh(patient)

    log_action(db, current_user.id, "unarchive_patient", "patient", patient.id,
               ip_address=request.client.host if request.client else None)

    return _patient_to_response(db, patient)


def _patient_to_response(db: Session, patient: Patient) -> PatientResponse:
    """Convert a Patient model to response with case count."""
    case_count = db.query(func.count(Case.id)).filter(Case.patient_id == patient.id).scalar()
    return PatientResponse(
        id=patient.id,
        patient_code=patient.patient_code,
        full_name=patient.full_name,
        date_of_birth=patient.date_of_birth,
        sex=patient.sex,
        is_archived=patient.is_archived,
        blood_type=patient.blood_type,
        medical_history=patient.medical_history,
        created_by=patient.created_by,
        created_at=patient.created_at,
        case_count=case_count or 0,
    )
