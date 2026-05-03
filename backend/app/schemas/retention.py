"""
MedicX — Data-Retention Schemas (Pydantic)

These describe the admin-facing payloads for previewing and purging
patient records that are past the configured retention period.
"""
from datetime import datetime, date
from typing import Optional

from pydantic import BaseModel, Field

from app.models.patient import PatientSex


class ExpiredPatient(BaseModel):
    """A single patient flagged as expired by the retention policy."""
    id: str
    full_name: str
    date_of_birth: date
    sex: PatientSex
    is_archived: bool
    case_count: int
    report_count: int
    last_activity_at: Optional[datetime] = Field(
        default=None,
        description=(
            "Most recent timestamp across the patient's profile updates and "
            "their linked cases. NULL if the patient has neither cases nor "
            "an updated_at value (very old records)."
        ),
    )
    days_inactive: Optional[int] = Field(
        default=None,
        description="Whole days since `last_activity_at` (None if unknown).",
    )


class ExpiredPatientsResponse(BaseModel):
    """Preview payload for the retention page."""
    retention_years: int
    cutoff_date: datetime
    total_patients_in_db: int
    expired_count: int
    expired_case_count: int
    expired_report_count: int
    patients: list[ExpiredPatient]


class PurgeResult(BaseModel):
    """Returned after a single-patient delete or a bulk purge."""
    requested_at: datetime
    retention_years: Optional[int] = None
    dry_run: bool
    patients_deleted: int
    cases_deleted: int
    findings_deleted: int
    reports_deleted: int
    files_removed: int
    bytes_removed: int
    errors: list[str] = []


class RetentionConfig(BaseModel):
    """Server-side bounds + defaults for the UI slider."""
    default_years: int
    min_years: int
    max_years: int
