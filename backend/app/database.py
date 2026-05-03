"""
MedicX — Database Setup
SQLAlchemy async-ready engine and session management.
"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

# Use check_same_thread=False only for SQLite
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=settings.DEBUG,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency: yields a DB session and closes it after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Called on app startup."""
    Base.metadata.create_all(bind=engine)
    _run_lightweight_migrations()


def _run_lightweight_migrations():
    """Apply small, idempotent schema patches that ``create_all`` cannot.

    SQLAlchemy's ``create_all`` only adds new tables — it never alters an
    existing column. When we add a new value to a Python ``Enum`` (e.g. a new
    ``cancelled`` status), MySQL keeps the old strict ``ENUM(...)`` column
    definition, so inserts of the new value would fail until the column is
    altered. This function performs those adjustments in-place on startup.
    """
    if not settings.DATABASE_URL.startswith("mysql"):
        return  # SQLite uses CHECK constraints which are not strictly enforced.

    migrations = [
        (
            "training_runs.status",
            "ENUM('QUEUED','RUNNING','COMPLETED','FAILED','PROMOTED','CANCELLED')",
            "ALTER TABLE training_runs MODIFY COLUMN status "
            "ENUM('QUEUED','RUNNING','COMPLETED','FAILED','PROMOTED','CANCELLED') NOT NULL",
        ),
    ]

    try:
        with engine.begin() as conn:
            for label, expected_type, ddl in migrations:
                table, column = label.split(".")
                row = conn.execute(text(
                    "SELECT COLUMN_TYPE FROM information_schema.COLUMNS "
                    "WHERE TABLE_NAME = :t AND COLUMN_NAME = :c "
                    "  AND TABLE_SCHEMA = DATABASE()"
                ), {"t": table, "c": column}).first()
                if row is None:
                    continue
                current = (row[0] or "").upper().replace(" ", "")
                if expected_type.upper().replace(" ", "") in current:
                    continue
                conn.execute(text(ddl))
                print(f"[MIGRATION] Patched {label} -> {expected_type}")
    except Exception as e:
        print(f"[MIGRATION] Skipped: {e}")

    # Add the patient_code column on existing databases that pre-date it.
    # Done as a separate try/except so a failure here doesn't skip the
    # other migrations above.
    try:
        with engine.begin() as conn:
            row = conn.execute(text(
                "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
                "WHERE TABLE_NAME = 'patients' AND COLUMN_NAME = 'patient_code' "
                "  AND TABLE_SCHEMA = DATABASE()"
            )).first()
            if row is None:
                conn.execute(text(
                    "ALTER TABLE patients "
                    "ADD COLUMN patient_code VARCHAR(50) NULL"
                ))
                conn.execute(text(
                    "CREATE UNIQUE INDEX ux_patients_patient_code "
                    "ON patients(patient_code)"
                ))
                print("[MIGRATION] Added patients.patient_code (unique)")
    except Exception as e:
        print(f"[MIGRATION] patient_code column: {e}")
