"""
MedicX — Admin Router
User management, audit logs, AI performance, and dashboard stats.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.user import User, UserRole
from app.models.patient import Patient
from app.models.case import Case, Finding, CaseStatus, ValidationStatus
from app.models.audit import AuditLog
from app.schemas.user import UserResponse, UserUpdate, UserListResponse
from app.schemas.report import AuditLogResponse, AuditLogListResponse, DashboardStats, AIPerformanceStats
from app.middleware.auth import get_current_user, require_role, log_action
from app.config import settings

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total_cases = db.query(func.count(Case.id)).scalar()
    pending = db.query(func.count(Case.id)).filter(Case.status.in_([CaseStatus.PENDING, CaseStatus.ANALYZED])).scalar()
    flagged = db.query(func.count(Finding.id)).filter(Finding.is_flagged == "true", Finding.validation_status == ValidationStatus.PENDING).scalar()
    completed = db.query(func.count(Case.id)).filter(Case.status == CaseStatus.FINALIZED).scalar()
    total_patients = db.query(func.count(Patient.id)).filter(Patient.is_archived == False).scalar()
    total_users = db.query(func.count(User.id)).filter(User.is_active == True).scalar()
    return DashboardStats(total_cases=total_cases, pending_review=pending, flagged_urgent=flagged, completed=completed, total_patients=total_patients, total_users=total_users)


@router.get("/users", response_model=UserListResponse)
def list_users(skip: int = 0, limit: int = 50, db: Session = Depends(get_db), current_user: User = Depends(require_role(UserRole.ADMIN))):
    total = db.query(func.count(User.id)).scalar()
    users = db.query(User).order_by(User.created_at.desc()).offset(skip).limit(limit).all()
    return UserListResponse(users=[UserResponse.model_validate(u) for u in users], total=total)


@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(user_id: str, data: UserUpdate, request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_role(UserRole.ADMIN))):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    log_action(db, current_user.id, "update_user", "user", user_id, details=update_data, ip_address=request.client.host if request.client else None)
    return UserResponse.model_validate(user)


@router.post("/users/{user_id}/deactivate")
def deactivate_user(user_id: str, request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_role(UserRole.ADMIN))):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    user.is_active = False
    db.commit()
    log_action(db, current_user.id, "deactivate_user", "user", user_id, ip_address=request.client.host if request.client else None)
    return {"message": "User deactivated", "user_id": user_id}


@router.get("/audit-logs", response_model=AuditLogListResponse)
def get_audit_logs(user_id: str = None, action: str = None, skip: int = 0, limit: int = 50, db: Session = Depends(get_db), current_user: User = Depends(require_role(UserRole.ADMIN))):
    query = db.query(AuditLog)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action == action)
    total = query.count()
    logs = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
    result = []
    for log in logs:
        user = db.query(User).filter(User.id == log.user_id).first()
        resp = AuditLogResponse(id=log.id, user_id=log.user_id, action=log.action, resource_type=log.resource_type, resource_id=log.resource_id, details=log.details, ip_address=log.ip_address, created_at=log.created_at, user_name=user.full_name if user else None)
        result.append(resp)
    return AuditLogListResponse(logs=result, total=total)


@router.get("/ai-performance", response_model=list[AIPerformanceStats])
def get_ai_performance(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stats = []
    for disease in settings.DISEASE_CLASSES:
        findings = db.query(Finding).filter(Finding.disease_name == disease).all()
        total = len(findings)
        accepted = sum(1 for f in findings if f.validation_status == ValidationStatus.ACCEPTED)
        rejected = sum(1 for f in findings if f.validation_status == ValidationStatus.REJECTED)
        edited = sum(1 for f in findings if f.validation_status == ValidationStatus.EDITED)
        pending = sum(1 for f in findings if f.validation_status == ValidationStatus.PENDING)
        stats.append(AIPerformanceStats(
            disease=disease, total_findings=total, accepted=accepted, rejected=rejected, edited=edited, pending=pending,
            accept_rate=round(accepted / total, 4) if total > 0 else 0,
            reject_rate=round(rejected / total, 4) if total > 0 else 0,
        ))
    return stats
