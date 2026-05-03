"""
MedicX — Admin Data Retention Router

Admin-only endpoints to surface, individually delete, or bulk-purge
patient records that are past the configured retention period.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.middleware.auth import log_action, require_role
from app.models.patient import Patient
from app.models.user import User, UserRole
from app.schemas.retention import (
    ExpiredPatient,
    ExpiredPatientsResponse,
    PurgeResult,
    RetentionConfig,
)
from app.services import data_retention_service

router = APIRouter(prefix="/api/admin/retention", tags=["Admin Retention"])


def _validate_years(years: int) -> int:
    lo = settings.RETENTION_MIN_YEARS
    hi = settings.RETENTION_MAX_YEARS
    if years < lo or years > hi:
        raise HTTPException(
            status_code=400,
            detail=f"retention_years must be between {lo} and {hi}.",
        )
    return years


@router.get("/config", response_model=RetentionConfig)
def get_config(_: User = Depends(require_role(UserRole.ADMIN))):
    """Return server-side bounds + default for the UI slider."""
    return RetentionConfig(
        default_years=settings.DEFAULT_RETENTION_YEARS,
        min_years=settings.RETENTION_MIN_YEARS,
        max_years=settings.RETENTION_MAX_YEARS,
    )


@router.get("/expired", response_model=ExpiredPatientsResponse)
def list_expired(
    retention_years: int = Query(
        default=None,
        description=(
            "Patients whose most recent activity is older than this number "
            "of years are considered expired. Defaults to the server config."
        ),
    ),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN)),
):
    """Preview every patient that would be removed by a purge run."""
    years = _validate_years(retention_years or settings.DEFAULT_RETENTION_YEARS)
    cutoff, infos = data_retention_service.find_expired_patients(db, years)

    total_in_db = db.query(Patient).count()
    expired_cases = sum(i.case_count for i in infos)
    expired_reports = sum(i.report_count for i in infos)

    return ExpiredPatientsResponse(
        retention_years=years,
        cutoff_date=cutoff,
        total_patients_in_db=total_in_db,
        expired_count=len(infos),
        expired_case_count=expired_cases,
        expired_report_count=expired_reports,
        patients=[
            ExpiredPatient(
                id=i.patient.id,
                full_name=i.patient.full_name,
                date_of_birth=i.patient.date_of_birth,
                sex=i.patient.sex,
                is_archived=i.patient.is_archived,
                case_count=i.case_count,
                report_count=i.report_count,
                last_activity_at=i.last_activity_at,
                days_inactive=i.days_inactive,
            )
            for i in infos
        ],
    )


@router.delete(
    "/patients/{patient_id}",
    response_model=PurgeResult,
)
def delete_one_patient(
    patient_id: str,
    request: Request,
    dry_run: bool = Query(
        default=False,
        description="Preview deletion totals without touching the DB or disk.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Delete a single patient regardless of expiry status.

    Useful for one-off admin housekeeping (e.g. wrong test patient,
    GDPR/data-erasure request). Cascades through cases, findings,
    reports, and removes the on-disk X-rays/heatmaps/PDFs.
    """
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    name_for_log = patient.full_name
    stats = data_retention_service.delete_patient_data(
        db, patient_id, dry_run=dry_run
    )

    if not dry_run and stats.errors and stats.patients_deleted == 0:
        # Pure failure case — surface clearly to the client.
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete patient: {stats.errors[0]}",
        )

    if not dry_run and stats.patients_deleted:
        log_action(
            db, current_user.id, "delete_patient_data",
            "patient", patient_id,
            details={
                "name": name_for_log,
                "cases_deleted": stats.cases_deleted,
                "findings_deleted": stats.findings_deleted,
                "reports_deleted": stats.reports_deleted,
                "files_removed": stats.files_removed,
                "bytes_removed": stats.bytes_removed,
            },
            ip_address=request.client.host if request.client else None,
        )

    return PurgeResult(
        requested_at=datetime.now(timezone.utc),
        retention_years=None,
        dry_run=dry_run,
        patients_deleted=stats.patients_deleted,
        cases_deleted=stats.cases_deleted,
        findings_deleted=stats.findings_deleted,
        reports_deleted=stats.reports_deleted,
        files_removed=stats.files_removed,
        bytes_removed=stats.bytes_removed,
        errors=stats.errors,
    )


@router.post("/purge", response_model=PurgeResult)
def purge_expired(
    request: Request,
    retention_years: int = Query(
        default=None,
        description="Years of inactivity that defines 'expired' (defaults to server config).",
    ),
    dry_run: bool = Query(
        default=False,
        description="Preview totals without touching the DB or disk.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Bulk-delete every patient past the retention threshold.

    Use ``dry_run=true`` first to preview the impact. The operation is
    audit-logged with the cutoff date and aggregate counts.
    """
    years = _validate_years(retention_years or settings.DEFAULT_RETENTION_YEARS)
    cutoff, stats = data_retention_service.purge_expired(
        db, retention_years=years, dry_run=dry_run
    )

    if not dry_run:
        log_action(
            db, current_user.id, "retention_purge",
            "patient", None,
            details={
                "retention_years": years,
                "cutoff_date": cutoff.isoformat(),
                "patients_deleted": stats.patients_deleted,
                "cases_deleted": stats.cases_deleted,
                "findings_deleted": stats.findings_deleted,
                "reports_deleted": stats.reports_deleted,
                "files_removed": stats.files_removed,
                "bytes_removed": stats.bytes_removed,
                "errors": stats.errors[:10],  # truncate log payload
            },
            ip_address=request.client.host if request.client else None,
        )

    return PurgeResult(
        requested_at=datetime.now(timezone.utc),
        retention_years=years,
        dry_run=dry_run,
        patients_deleted=stats.patients_deleted,
        cases_deleted=stats.cases_deleted,
        findings_deleted=stats.findings_deleted,
        reports_deleted=stats.reports_deleted,
        files_removed=stats.files_removed,
        bytes_removed=stats.bytes_removed,
        errors=stats.errors,
    )
