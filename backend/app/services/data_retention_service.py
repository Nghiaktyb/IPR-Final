"""
MedicX — Data Retention Service

Provides admin-only logic to find patient records that are past the
configured retention period and to delete them — both from the database
(cascading through cases, findings, and reports) and from on-disk
storage (uploaded X-rays, generated heatmaps, and PDF reports).

Definitions
-----------
``last_activity_at`` for a patient = the most recent of:
    * the patient's own ``updated_at`` / ``created_at``,
    * every linked case's ``updated_at`` / ``created_at``.

``expired`` = ``last_activity_at`` is older than ``cutoff = now - N years``.
Patients with no recorded activity at all fall back to ``created_at`` —
they're treated as expired only if even *that* is older than the cutoff.

File cleanup
------------
We deliberately reuse :func:`app.services.file_resolver.resolve_storage_path`
so that legacy absolute paths (which can come from different machines)
still resolve to the right on-disk file before we ``os.remove`` it.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.case import Case, Finding
from app.models.patient import Patient
from app.models.report import Report
from app.services.file_resolver import resolve_storage_path

DAYS_PER_YEAR = 365


# ── Public types ──────────────────────────────────────────────────────

@dataclass
class ExpiredPatientInfo:
    patient: Patient
    case_count: int
    report_count: int
    last_activity_at: Optional[datetime]

    @property
    def days_inactive(self) -> Optional[int]:
        if self.last_activity_at is None:
            return None
        return max(0, (_now() - self.last_activity_at).days)


@dataclass
class PurgeStats:
    patients_deleted: int = 0
    cases_deleted: int = 0
    findings_deleted: int = 0
    reports_deleted: int = 0
    files_removed: int = 0
    bytes_removed: int = 0
    errors: list[str] = field(default_factory=list)

    def add(self, other: "PurgeStats") -> None:
        self.patients_deleted += other.patients_deleted
        self.cases_deleted += other.cases_deleted
        self.findings_deleted += other.findings_deleted
        self.reports_deleted += other.reports_deleted
        self.files_removed += other.files_removed
        self.bytes_removed += other.bytes_removed
        self.errors.extend(other.errors)


# ── Helpers ───────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _make_naive_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Strip tz info so we can compare against DB-stored naive datetimes.

    SQLite + the project's models default to UTC-aware values, but MySQL
    typically stores naive datetimes. We normalise everything to naive UTC
    for cross-DB safety.
    """
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def cutoff_for(retention_years: int) -> datetime:
    """Return the boundary datetime (UTC, naive) at which records expire."""
    return _make_naive_utc(_now() - timedelta(days=retention_years * DAYS_PER_YEAR))


def _patient_last_activity(db: Session, patient: Patient) -> Optional[datetime]:
    """Compute the most recent activity timestamp for a patient."""
    candidates: list[Optional[datetime]] = [
        _make_naive_utc(patient.updated_at),
        _make_naive_utc(patient.created_at),
    ]
    cases = db.query(Case).filter(Case.patient_id == patient.id).all()
    for c in cases:
        candidates.append(_make_naive_utc(c.updated_at))
        candidates.append(_make_naive_utc(c.created_at))
    real = [d for d in candidates if d is not None]
    return max(real) if real else None


# ── Discovery ─────────────────────────────────────────────────────────

def find_expired_patients(
    db: Session, retention_years: int
) -> tuple[datetime, list[ExpiredPatientInfo]]:
    """Return ``(cutoff, [info...])`` for patients past the retention period.

    The list is sorted oldest-activity-first so the most "stale" records
    surface at the top of the admin table.
    """
    cutoff = cutoff_for(retention_years)
    out: list[ExpiredPatientInfo] = []

    # Loading every patient is fine: the table is small relative to cases,
    # and the per-patient last-activity calc needs the linked cases anyway.
    for p in db.query(Patient).all():
        last = _patient_last_activity(db, p)
        if last is None or last < cutoff:
            case_count = db.query(Case).filter(Case.patient_id == p.id).count()
            report_count = (
                db.query(Report)
                .join(Case, Case.id == Report.case_id)
                .filter(Case.patient_id == p.id)
                .count()
            )
            out.append(ExpiredPatientInfo(
                patient=p,
                case_count=case_count,
                report_count=report_count,
                last_activity_at=last,
            ))

    out.sort(key=lambda i: (i.last_activity_at or datetime.min))
    return cutoff, out


# ── Deletion ──────────────────────────────────────────────────────────

def _safe_remove(path: Optional[str], stats: PurgeStats) -> None:
    """Resolve `path` against the local storage and delete the file if any.

    Silently swallows missing files (they may have already been cleaned up
    by a prior pass) but records other errors in ``stats.errors``.
    """
    if not path:
        return
    real = resolve_storage_path(path)
    if not real or not os.path.isfile(real):
        return
    try:
        size = os.path.getsize(real)
        os.remove(real)
        stats.files_removed += 1
        stats.bytes_removed += size
    except OSError as e:
        stats.errors.append(f"{real}: {e}")


def _collect_patient_files(db: Session, patient_id: str) -> list[str]:
    """All on-disk files owned by a patient: X-rays, heatmaps, PDFs."""
    paths: list[str] = []
    cases = db.query(Case).filter(Case.patient_id == patient_id).all()
    for c in cases:
        if c.image_path:
            paths.append(c.image_path)
        # heatmap_paths is a JSON dict {disease: path} (or list, defensively)
        hm = c.heatmap_paths
        if isinstance(hm, dict):
            paths.extend([v for v in hm.values() if v])
        elif isinstance(hm, list):
            paths.extend([v for v in hm if v])

        for f in db.query(Finding).filter(Finding.case_id == c.id).all():
            if f.heatmap_path:
                paths.append(f.heatmap_path)

        rep = db.query(Report).filter(Report.case_id == c.id).first()
        if rep and rep.pdf_path:
            paths.append(rep.pdf_path)
    return paths


def delete_patient_data(
    db: Session, patient_id: str, *, dry_run: bool = False
) -> PurgeStats:
    """Delete a single patient and every record that hangs off it.

    Returns counts of what was (or, in dry-run, would be) removed. The DB
    cascade is configured at the model level (``cascade="all, delete-orphan"``),
    so removing the ``Patient`` row alone wipes the dependent cases and
    findings. We still query the children up-front so we can produce
    accurate counts and clean up disk files.
    """
    stats = PurgeStats()
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        stats.errors.append(f"Patient {patient_id} not found.")
        return stats

    cases = db.query(Case).filter(Case.patient_id == patient_id).all()
    case_ids = [c.id for c in cases]

    findings_count = (
        db.query(Finding).filter(Finding.case_id.in_(case_ids)).count()
        if case_ids else 0
    )
    reports_count = (
        db.query(Report).filter(Report.case_id.in_(case_ids)).count()
        if case_ids else 0
    )

    file_paths = _collect_patient_files(db, patient_id)

    stats.patients_deleted = 1
    stats.cases_deleted = len(cases)
    stats.findings_deleted = findings_count
    stats.reports_deleted = reports_count

    if dry_run:
        # Estimate file impact without touching disk.
        for p in file_paths:
            real = resolve_storage_path(p)
            if real and os.path.isfile(real):
                try:
                    stats.bytes_removed += os.path.getsize(real)
                    stats.files_removed += 1
                except OSError:
                    pass
        return stats

    # Real run — delete files first; if any DB step then fails we've at
    # worst orphaned the row, never the other way around (data without
    # files is recoverable; files without data is silent leakage).
    for p in file_paths:
        _safe_remove(p, stats)

    try:
        db.delete(patient)
        db.commit()
    except Exception as e:
        db.rollback()
        stats.errors.append(f"DB delete failed for {patient_id}: {e}")
        # Reset counts that didn't actually happen.
        stats.patients_deleted = 0
        stats.cases_deleted = 0
        stats.findings_deleted = 0
        stats.reports_deleted = 0

    return stats


def purge_expired(
    db: Session, *, retention_years: int, dry_run: bool = False
) -> tuple[datetime, PurgeStats]:
    """Bulk-delete every patient flagged as expired.

    Returns ``(cutoff_used, aggregate_stats)``.
    """
    cutoff, infos = find_expired_patients(db, retention_years)
    total = PurgeStats()
    for info in infos:
        total.add(delete_patient_data(db, info.patient.id, dry_run=dry_run))
    return cutoff, total
