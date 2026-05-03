"""
MedicX — Patient Schemas (Pydantic)
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import date, datetime
from app.models.patient import PatientSex


class PatientCreate(BaseModel):
    # Required so duplicate registrations can be detected at create-time.
    patient_code: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description=(
            "Human-readable identifier such as a hospital MRN. Must be "
            "unique across all patients."
        ),
    )
    full_name: str = Field(..., min_length=1, max_length=255)
    date_of_birth: date
    sex: PatientSex
    blood_type: Optional[str] = None
    medical_history: Optional[str] = None

    @field_validator("patient_code")
    @classmethod
    def _strip_code(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("patient_code must not be blank")
        return v


class PatientUpdate(BaseModel):
    patient_code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    full_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    sex: Optional[PatientSex] = None
    blood_type: Optional[str] = None
    medical_history: Optional[str] = None

    @field_validator("patient_code")
    @classmethod
    def _strip_code(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        return v or None


class PatientResponse(BaseModel):
    id: str
    patient_code: Optional[str] = None
    full_name: str
    date_of_birth: date
    sex: PatientSex
    is_archived: bool
    blood_type: Optional[str] = None
    medical_history: Optional[str] = None
    created_by: str
    created_at: datetime
    case_count: int = 0

    class Config:
        from_attributes = True


class PatientListResponse(BaseModel):
    patients: list[PatientResponse]
    total: int


class DuplicatePatientResponse(BaseModel):
    """Returned (with HTTP 409) when a create collides with an existing code."""
    detail: str
    patient_code: str
    existing_patient_id: str
    existing_patient_name: str
