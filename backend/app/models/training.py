"""
MedicX — Training Data Models

Stores datasets that an admin uploads (NIH ChestX-ray14 format) and the
training runs the admin kicks off against those datasets.
"""
import uuid
import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    String,
    Text,
    Integer,
    Float,
    DateTime,
    ForeignKey,
    JSON,
    Enum as SAEnum,
)
from sqlalchemy.orm import relationship

from app.database import Base


class TrainingDatasetStatus(str, enum.Enum):
    READY = "ready"
    INGESTING = "ingesting"
    FAILED = "failed"


class TrainingRunStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PROMOTED = "promoted"
    CANCELLED = "cancelled"


class TrainingDataset(Base):
    """A bundle of labelled X-ray images uploaded by an admin."""
    __tablename__ = "training_datasets"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(
        SAEnum(TrainingDatasetStatus),
        default=TrainingDatasetStatus.READY,
        nullable=False,
    )
    storage_dir = Column(String(512), nullable=False)
    manifest_path = Column(String(512), nullable=True)

    total_rows = Column(Integer, default=0)
    usable_rows = Column(Integer, default=0)
    label_summary = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)

    uploaded_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    runs = relationship(
        "TrainingRun", back_populates="dataset", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<TrainingDataset {self.name} ({self.usable_rows} rows)>"


class TrainingRun(Base):
    """A single fine-tuning job over a training dataset."""
    __tablename__ = "training_runs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    dataset_id = Column(
        String(36), ForeignKey("training_datasets.id"), nullable=False
    )

    status = Column(
        SAEnum(TrainingRunStatus),
        default=TrainingRunStatus.QUEUED,
        nullable=False,
    )

    # Hyperparameters
    epochs = Column(Integer, default=5, nullable=False)
    batch_size = Column(Integer, default=16, nullable=False)
    learning_rate = Column(Float, default=1e-4, nullable=False)
    val_split = Column(Float, default=0.2, nullable=False)
    max_samples = Column(Integer, nullable=True)
    seed = Column(Integer, default=42, nullable=False)

    # Live metrics
    current_epoch = Column(Integer, default=0)
    train_loss = Column(Float, nullable=True)
    val_loss = Column(Float, nullable=True)
    best_val_loss = Column(Float, nullable=True)
    metrics_per_epoch = Column(JSON, nullable=True)

    # Outputs
    checkpoint_path = Column(String(512), nullable=True)
    error_message = Column(Text, nullable=True)

    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    dataset = relationship("TrainingDataset", back_populates="runs")

    def __repr__(self):
        return f"<TrainingRun {self.id[:8]} status={self.status.value}>"
