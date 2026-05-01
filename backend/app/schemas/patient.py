"""
MedicX — Patient Schemas (Pydantic)
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
from app.models.patient import PatientSex


class PatientCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    date_of_birth: date
    sex: PatientSex
    blood_type: Optional[str] = None
    medical_history: Optional[str] = None


class PatientUpdate(BaseModel):
    full_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    sex: Optional[PatientSex] = None
    blood_type: Optional[str] = None
    medical_history: Optional[str] = None


class PatientResponse(BaseModel):
    id: str
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
