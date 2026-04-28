"""
MedicX — Report Schemas (Pydantic)
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ReportCreate(BaseModel):
    conclusion: Optional[str] = None
    digital_signature: Optional[str] = None


class ReportResponse(BaseModel):
    id: str
    case_id: str
    generated_by: str
    pdf_path: Optional[str] = None
    conclusion: Optional[str] = None
    digital_signature: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogResponse(BaseModel):
    id: str
    user_id: str
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    details: Optional[dict] = None
    ip_address: Optional[str] = None
    created_at: datetime
    user_name: Optional[str] = None

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    logs: list[AuditLogResponse]
    total: int


class DashboardStats(BaseModel):
    total_cases: int
    pending_review: int
    flagged_urgent: int
    completed: int
    total_patients: int
    total_users: int


class AIPerformanceStats(BaseModel):
    disease: str
    total_findings: int
    accepted: int
    rejected: int
    edited: int
    pending: int
    accept_rate: float
    reject_rate: float
