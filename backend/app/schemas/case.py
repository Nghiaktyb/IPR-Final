"""
MedicX — Case & Finding Schemas (Pydantic)
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.models.case import CaseStatus, ValidationStatus


# ─── Finding ────────────────────────────────────────────
class FindingResponse(BaseModel):
    id: str
    disease_name: str
    confidence_score: float
    heatmap_path: Optional[str] = None
    is_flagged: str
    validation_status: ValidationStatus
    validated_by: Optional[str] = None
    doctor_notes: Optional[str] = None
    rejection_drawing_paths: Optional[list] = None
    validated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FindingValidate(BaseModel):
    validation_status: ValidationStatus
    doctor_notes: Optional[str] = None
    rejection_drawing_paths: Optional[list] = None


# ─── Case ───────────────────────────────────────────────
class CaseCreate(BaseModel):
    patient_id: str
    clinical_notes: Optional[str] = None
    patient_weight: Optional[float] = None
    patient_height: Optional[float] = None
    blood_pressure: Optional[str] = None
    heart_rate: Optional[int] = None
    temperature: Optional[float] = None
    reason_for_visit: Optional[str] = None


class CaseResponse(BaseModel):
    id: str
    patient_id: str
    uploaded_by: str
    image_filename: str
    clinical_notes: Optional[str] = None
    patient_weight: Optional[float] = None
    patient_height: Optional[float] = None
    blood_pressure: Optional[str] = None
    heart_rate: Optional[int] = None
    temperature: Optional[float] = None
    reason_for_visit: Optional[str] = None
    status: CaseStatus
    sensitivity_threshold: float
    findings: list[FindingResponse] = []
    created_at: datetime
    patient_name: Optional[str] = None
    uploaded_by_name: Optional[str] = None

    class Config:
        from_attributes = True


class CaseListResponse(BaseModel):
    cases: list[CaseResponse]
    total: int


class CaseStatusUpdate(BaseModel):
    status: CaseStatus


# ─── AI Inference ───────────────────────────────────────
class InferenceResult(BaseModel):
    disease: str
    confidence: float
    is_flagged: bool
    heatmap_url: Optional[str] = None


class InferenceResponse(BaseModel):
    case_id: str
    results: list[InferenceResult]
    threshold: float
    flagged_conditions: list[str]
