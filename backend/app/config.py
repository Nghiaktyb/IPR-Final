"""
MedicX — Application Configuration
Loads settings from environment variables with sensible defaults.
"""
from pydantic_settings import BaseSettings
from pathlib import Path
import os


class Settings(BaseSettings):
    # ─── App ────────────────────────────────────────────
    APP_NAME: str = "MedicX — AI Radiology Diagnostic Suite"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # ─── Database ───────────────────────────────────────
    DATABASE_URL: str = "sqlite:///./medix.db"

    # ─── JWT Auth ───────────────────────────────────────
    SECRET_KEY: str = "medix-super-secret-key-change-in-production-2024"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # ─── File Storage ───────────────────────────────────
    UPLOAD_DIR: str = str(Path(__file__).parent.parent / "uploads")
    HEATMAP_DIR: str = str(Path(__file__).parent.parent / "heatmaps")
    REPORT_DIR: str = str(Path(__file__).parent.parent / "reports")
    TRAINING_DATA_DIR: str = str(Path(__file__).parent.parent / "training_data")
    TRAINING_RUNS_DIR: str = str(Path(__file__).parent.parent / "training_runs")

    # ─── AI Model ───────────────────────────────────────
    # Default model location lives INSIDE the project so a fresh clone has
    # a predictable, OS-agnostic path. Override via the MODEL_PATH env var
    # if your trained checkpoint lives elsewhere. The file is intentionally
    # not committed (see .gitignore) — drop your `.pth` here or use the
    # admin "AI Training" page to create one. If the file is missing the
    # AI engine falls back to simulation mode.
    MODEL_PATH: str = str(Path(__file__).parent.parent / "models" / "medix_model.pth")
    DISEASE_CLASSES: list = ["Atelectasis", "Effusion", "Pneumonia", "Nodule", "Mass"]
    DEFAULT_THRESHOLD: float = 0.5
    IMAGE_SIZE: int = 224

    # ─── Data Retention ─────────────────────────────────
    # Default cutoff for "expired" patient data. Many medical-record retention
    # statutes land in the 5–10 year range; the admin can adjust this
    # per-purge from the UI.
    DEFAULT_RETENTION_YEARS: int = 7
    RETENTION_MIN_YEARS: int = 1
    RETENTION_MAX_YEARS: int = 30

    # ─── CORS ───────────────────────────────────────────
    CORS_ORIGINS: list = ["http://localhost:3000", "http://127.0.0.1:3000"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Ensure directories exist (idempotent — runs every import).
for dir_path in [
    settings.UPLOAD_DIR,
    settings.HEATMAP_DIR,
    settings.REPORT_DIR,
    settings.TRAINING_DATA_DIR,
    settings.TRAINING_RUNS_DIR,
    # Parent of MODEL_PATH so the training service can drop a promoted
    # checkpoint here even if the user hasn't created the folder yet.
    os.path.dirname(settings.MODEL_PATH),
]:
    if dir_path:
        os.makedirs(dir_path, exist_ok=True)
