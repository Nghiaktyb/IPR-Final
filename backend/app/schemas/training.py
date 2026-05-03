"""MedicX — Training Pydantic Schemas."""
from datetime import datetime
from typing import Optional, Any

from pydantic import BaseModel, Field


class TrainingDatasetResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    status: str
    total_rows: int
    usable_rows: int
    label_summary: Optional[dict] = None
    error_message: Optional[str] = None
    uploaded_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class TrainingDatasetListResponse(BaseModel):
    datasets: list[TrainingDatasetResponse]
    total: int


class TrainingRunCreate(BaseModel):
    dataset_id: str
    epochs: int = Field(default=5, ge=1, le=100)
    batch_size: int = Field(default=16, ge=1, le=256)
    learning_rate: float = Field(default=1e-4, gt=0, lt=1)
    val_split: float = Field(default=0.2, ge=0.0, lt=1.0)
    max_samples: Optional[int] = Field(default=None, ge=1)
    seed: int = Field(default=42)


class TrainingRunResponse(BaseModel):
    id: str
    dataset_id: str
    status: str
    epochs: int
    batch_size: int
    learning_rate: float
    val_split: float
    max_samples: Optional[int] = None
    seed: int
    current_epoch: int
    train_loss: Optional[float] = None
    val_loss: Optional[float] = None
    best_val_loss: Optional[float] = None
    metrics_per_epoch: Optional[Any] = None
    checkpoint_path: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class TrainingRunListResponse(BaseModel):
    runs: list[TrainingRunResponse]
    total: int


class TrainingCapabilitiesResponse(BaseModel):
    """Reports whether the host has PyTorch and where the active model lives."""
    torch_available: bool
    cuda_available: bool
    device: Optional[str] = None
    disease_classes: list[str]
    active_model_path: str
    active_model_exists: bool
