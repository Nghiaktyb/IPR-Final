"""
MedicX — Report Generation Router
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os
from app.database import get_db
from app.models.user import User
from app.models.case import Case, Finding, CaseStatus
from app.models.patient import Patient
from app.models.report import Report
from app.schemas.report import ReportCreate, ReportResponse
from app.middleware.auth import get_current_user, log_action, decode_token
from app.services.report_service import generate_pdf_report

router = APIRouter(prefix="/api/reports", tags=["Reports"])

@router.post("/{case_id}/generate", response_model=ReportResponse, status_code=201)
def generate_report(case_id: str, data: ReportCreate, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    patient = db.query(Patient).filter(Patient.id == case.patient_id).first()
    findings = db.query(Finding).filter(Finding.case_id == case_id).all()
    findings_data = [{
        "disease_name": f.disease_name, 
        "confidence_score": f.confidence_score, 
        "validation_status": f.validation_status.value, 
        "is_flagged": f.is_flagged, 
        "doctor_notes": f.doctor_notes,
        "heatmap_path": f.heatmap_path or (case.heatmap_paths.get(f.disease_name) if case.heatmap_paths else None),
        "rejection_drawing_paths": f.rejection_drawing_paths
    } for f in findings]
    pdf_path = generate_pdf_report(
        case_data={
            "id": case.id,
            "clinical_notes": case.clinical_notes,
            "sensitivity_threshold": case.sensitivity_threshold,
            "image_path": case.image_path,
            "patient_weight": case.patient_weight,
            "patient_height": case.patient_height,
            "blood_pressure": case.blood_pressure,
            "heart_rate": case.heart_rate,
            "temperature": case.temperature,
            "reason_for_visit": case.reason_for_visit,
        },
        patient_data={
            "id": patient.id,
            "full_name": patient.full_name,
            "date_of_birth": str(patient.date_of_birth),
            "sex": patient.sex.value,
            "blood_type": patient.blood_type,
            "medical_history": patient.medical_history,
        },
        findings=findings_data, conclusion=data.conclusion, signature=data.digital_signature or current_user.full_name,
    )
    existing = db.query(Report).filter(Report.case_id == case_id).first()
    if existing:
        existing.pdf_path = pdf_path
        existing.conclusion = data.conclusion
        existing.digital_signature = data.digital_signature or current_user.full_name
        db.commit()
        db.refresh(existing)
        report = existing
    else:
        report = Report(case_id=case_id, generated_by=current_user.id, pdf_path=pdf_path, conclusion=data.conclusion, digital_signature=data.digital_signature or current_user.full_name)
        db.add(report)
        db.commit()
        db.refresh(report)
    case.status = CaseStatus.FINALIZED
    db.commit()
    log_action(db, current_user.id, "generate_report", "report", report.id, ip_address=request.client.host if request.client else None)
    return ReportResponse.model_validate(report)

@router.get("/{report_id}/download")
def download_report(report_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not report.pdf_path or not os.path.exists(report.pdf_path):
        raise HTTPException(status_code=404, detail="PDF file not found")
    log_action(db, current_user.id, "download_report", "report", report.id)
    return FileResponse(report.pdf_path, media_type="application/pdf", filename=os.path.basename(report.pdf_path))

def _get_user_from_query_token(token: str, db: Session) -> User:
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user

@router.get("/case/{case_id}/download")
def download_report_by_case(case_id: str, token: str, db: Session = Depends(get_db)):
    user = _get_user_from_query_token(token, db)
    report = db.query(Report).filter(Report.case_id == case_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not report.pdf_path or not os.path.exists(report.pdf_path):
        raise HTTPException(status_code=404, detail="PDF file not found")
    log_action(db, user.id, "download_report", "report", report.id)
    return FileResponse(report.pdf_path, media_type="application/pdf", filename=os.path.basename(report.pdf_path))

@router.get("/case/{case_id}", response_model=ReportResponse)
def get_report_by_case(case_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    report = db.query(Report).filter(Report.case_id == case_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="No report for this case")
    return ReportResponse.model_validate(report)
