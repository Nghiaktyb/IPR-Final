"""
MedicX — AI Radiology Diagnostic Suite
Main FastAPI Application Entry Point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.config import settings
from app.database import init_db
from app.routers import auth, patients, cases, reports, admin

# ─── Create App ─────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-powered chest X-ray analysis platform for disease detection and medical diagnosis support.",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# ─── CORS Middleware ────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Static File Serving ───────────────────────────────
for dir_name, dir_path in [
    ("uploads", settings.UPLOAD_DIR),
    ("heatmaps", settings.HEATMAP_DIR),
    ("reports", settings.REPORT_DIR),
]:
    os.makedirs(dir_path, exist_ok=True)
    app.mount(f"/static/{dir_name}", StaticFiles(directory=dir_path), name=dir_name)

# ─── Register Routers ──────────────────────────────────
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(cases.router)
app.include_router(reports.router)
app.include_router(admin.router)


# ─── Startup Event ─────────────────────────────────────
@app.on_event("startup")
def startup():
    print("[MedicX] Starting AI Radiology Diagnostic Suite")
    print(f"   Version: {settings.APP_VERSION}")
    print(f"   Database: {settings.DATABASE_URL}")
    print(f"   Model: {settings.MODEL_PATH}")
    init_db()
    print("[OK] Database tables initialized")
    print("[OK] Server ready at http://localhost:8000")
    print("[OK] API docs at http://localhost:8000/api/docs")


@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


@app.get("/api")
def api_info():
    """API information."""
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "diseases": settings.DISEASE_CLASSES,
        "endpoints": {
            "docs": "/api/docs",
            "auth": "/api/auth",
            "patients": "/api/patients",
            "cases": "/api/cases",
            "reports": "/api/reports",
            "admin": "/api/admin",
        },
    }
