"""
MedicX — Report Model
Stores generated PDF diagnostic reports.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Report(Base):
    __tablename__ = "reports"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id = Column(String(36), ForeignKey("cases.id"), unique=True, nullable=False)
    generated_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    pdf_path = Column(String(512), nullable=True)
    conclusion = Column(Text, nullable=True)
    digital_signature = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    case = relationship("Case", back_populates="report")
    generated_by_user = relationship("User", back_populates="reports", foreign_keys=[generated_by])

    def __repr__(self):
        return f"<Report for Case {self.case_id[:8]}>"
