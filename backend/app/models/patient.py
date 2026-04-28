"""
MedicX — Patient Model
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Date, Boolean, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class PatientSex(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"


class Patient(Base):
    __tablename__ = "patients"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    full_name = Column(String(255), nullable=False, index=True)
    date_of_birth = Column(Date, nullable=False)
    sex = Column(SAEnum(PatientSex), nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    created_by_user = relationship("User", back_populates="patients", foreign_keys=[created_by])
    cases = relationship("Case", back_populates="patient", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Patient {self.full_name}>"
