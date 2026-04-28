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

    # ─── AI Model ───────────────────────────────────────
    MODEL_PATH: str = str(Path(__file__).parent.parent.parent.parent / "medix" / "medix" / "medix_model.pth")
    DISEASE_CLASSES: list = ["Atelectasis", "Effusion", "Pneumonia", "Nodule", "Mass"]
    DEFAULT_THRESHOLD: float = 0.5
    IMAGE_SIZE: int = 224

    # ─── CORS ───────────────────────────────────────────
    CORS_ORIGINS: list = ["http://localhost:3000", "http://127.0.0.1:3000"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Ensure directories exist
for dir_path in [settings.UPLOAD_DIR, settings.HEATMAP_DIR, settings.REPORT_DIR]:
    os.makedirs(dir_path, exist_ok=True)
