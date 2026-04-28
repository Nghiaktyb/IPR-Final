"""
MedicX — Audit Log Model
Tracks every significant user action for compliance.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    action = Column(String(100), nullable=False)           # e.g., "login", "upload_xray", "validate_finding"
    resource_type = Column(String(50), nullable=True)      # e.g., "case", "patient", "report"
    resource_id = Column(String(36), nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    user = relationship("User", back_populates="audit_logs", foreign_keys=[user_id])

    def __repr__(self):
        return f"<AuditLog {self.action} by {self.user_id[:8]}>"
