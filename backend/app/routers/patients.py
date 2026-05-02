"""
MedicX — Patient Management Router
Handles CRUD operations for patient profiles.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.user import User
from app.models.patient import Patient
from app.models.case import Case
from app.schemas.patient import (
    PatientCreate, PatientUpdate, PatientResponse, PatientListResponse,
)
from app.middleware.auth import get_current_user, log_action

router = APIRouter(prefix="/api/patients", tags=["Patients"])


@router.post("/", response_model=PatientResponse, status_code=201)
def create_patient(
    data: PatientCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new patient profile."""
    patient = Patient(
        **data.model_dump(),
        created_by=current_user.id,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)

    log_action(db, current_user.id, "create_patient", "patient", patient.id,
               ip_address=request.client.host if request.client else None)

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
        query = query.filter(Patient.full_name.ilike(f"%{search}%"))

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
    for key, value in update_data.items():
        setattr(patient, key, value)

    db.commit()
    db.refresh(patient)

    log_action(db, current_user.id, "update_patient", "patient", patient.id,
               details=update_data,
               ip_address=request.client.host if request.client else None)

    return _patient_to_response(db, patient)


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
