"""
MedicX — User Model
Roles: technician, radiologist, admin
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Enum as SAEnum
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class UserRole(str, enum.Enum):
    TECHNICIAN = "technician"
    RADIOLOGIST = "radiologist"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.TECHNICIAN)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    patients = relationship("Patient", back_populates="created_by_user", foreign_keys="Patient.created_by")
    cases = relationship("Case", back_populates="uploaded_by_user", foreign_keys="Case.uploaded_by")
    findings_validated = relationship("Finding", back_populates="validated_by_user", foreign_keys="Finding.validated_by")
    reports = relationship("Report", back_populates="generated_by_user", foreign_keys="Report.generated_by")
    audit_logs = relationship("AuditLog", back_populates="user", foreign_keys="AuditLog.user_id")

    def __repr__(self):
        return f"<User {self.email} ({self.role.value})>"
