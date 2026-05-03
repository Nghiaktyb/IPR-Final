"""
MedicX — Case & Finding Models
A Case holds an uploaded X-ray image and its AI analysis results.
A Finding represents one disease prediction that can be validated by a doctor.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, Float, Integer, DateTime, ForeignKey, JSON, Enum as SAEnum
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class CaseStatus(str, enum.Enum):
    PENDING = "pending"          # Uploaded, awaiting AI analysis
    ANALYZED = "analyzed"        # AI analysis complete
    REVIEWED = "reviewed"        # Doctor has reviewed findings
    FINALIZED = "finalized"      # Diagnosis locked


class ValidationStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EDITED = "edited"


class Case(Base):
    __tablename__ = "cases"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("patients.id"), nullable=False)
    uploaded_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    image_path = Column(String(512), nullable=False)
    image_filename = Column(String(255), nullable=False)
    clinical_notes = Column(Text, nullable=True)
    status = Column(SAEnum(CaseStatus), default=CaseStatus.PENDING, nullable=False)
    ai_results = Column(JSON, nullable=True)         # Raw AI output
    heatmap_paths = Column(JSON, nullable=True)       # Dict of disease -> heatmap path
    sensitivity_threshold = Column(Float, default=0.5)
    
    # Visit Specific Vitals
    patient_weight = Column(Float, nullable=True)
    patient_height = Column(Float, nullable=True)
    blood_pressure = Column(String(20), nullable=True)
    heart_rate = Column(Integer, nullable=True)
    temperature = Column(Float, nullable=True)
    reason_for_visit = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    patient = relationship("Patient", back_populates="cases")
    uploaded_by_user = relationship("User", back_populates="cases", foreign_keys=[uploaded_by])
    findings = relationship("Finding", back_populates="case", cascade="all, delete-orphan")
    # Cascade so deleting a Case wipes its Report too — without this,
    # SQLAlchemy tries to UPDATE reports.case_id = NULL, which violates the
    # NOT NULL constraint on the FK and rolls the whole delete back.
    report = relationship(
        "Report",
        back_populates="case",
        uselist=False,
        cascade="all, delete-orphan",
        single_parent=True,
    )

    def __repr__(self):
        return f"<Case {self.id[:8]} — {self.status.value}>"


class Finding(Base):
    __tablename__ = "findings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id = Column(String(36), ForeignKey("cases.id"), nullable=False)
    disease_name = Column(String(100), nullable=False)
    confidence_score = Column(Float, nullable=False)
    heatmap_path = Column(String(512), nullable=True)
    is_flagged = Column(String(10), default="false")  # "true" if above threshold
    validation_status = Column(SAEnum(ValidationStatus), default=ValidationStatus.PENDING, nullable=False)
    validated_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    doctor_notes = Column(Text, nullable=True)
    rejection_drawing_paths = Column(JSON, nullable=True)
    validated_at = Column(DateTime, nullable=True)

    # Relationships
    case = relationship("Case", back_populates="findings")
    validated_by_user = relationship("User", back_populates="findings_validated", foreign_keys=[validated_by])

    def __repr__(self):
        return f"<Finding {self.disease_name}: {self.confidence_score:.1%}>"
