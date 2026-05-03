"""
MedicX — Admin Training Router

Lets an admin upload labelled chest X-ray datasets (NIH ChestX-ray14
format) and run on-device fine-tuning of the production model.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_user, require_role, log_action
from app.models.training import (
    TrainingDataset,
    TrainingDatasetStatus,
    TrainingRun,
    TrainingRunStatus,
)
from app.models.user import User, UserRole
from app.schemas.training import (
    TrainingCapabilitiesResponse,
    TrainingDatasetListResponse,
    TrainingDatasetResponse,
    TrainingRunCreate,
    TrainingRunListResponse,
    TrainingRunResponse,
)
from app.services import training_service

router = APIRouter(prefix="/api/admin/training", tags=["Admin Training"])


# ─── Capabilities ──────────────────────────────────────────────────

@router.get("/capabilities", response_model=TrainingCapabilitiesResponse)
def capabilities(current_user: User = Depends(require_role(UserRole.ADMIN))):
    return training_service.torch_capabilities()


# ─── Datasets ──────────────────────────────────────────────────────

@router.post(
    "/datasets",
    response_model=TrainingDatasetResponse,
    status_code=201,
)
async def upload_dataset(
    request: Request,
    name: str = Form(...),
    description: Optional[str] = Form(None),
    csv_file: Optional[UploadFile] = File(None),
    images: list[UploadFile] = File(default=[]),
    archive: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """
    Upload a labelled training dataset.

    Accepts EITHER:
      * ``csv_file`` + one or more ``images`` (multi-file form upload), OR
      * ``archive``: a single ZIP containing both the CSV and the images.
    """
    csv_bytes: Optional[bytes] = None
    csv_filename: Optional[str] = None
    if csv_file is not None:
        csv_bytes = await csv_file.read()
        csv_filename = csv_file.filename

    image_payloads: list = []
    for f in images or []:
        if f is None or not f.filename:
            continue
        image_payloads.append((f.filename, await f.read()))

    zip_bytes: Optional[bytes] = None
    if archive is not None and archive.filename:
        zip_bytes = await archive.read()

    try:
        dataset = training_service.ingest_dataset(
            name=name,
            description=description,
            uploaded_by=current_user.id,
            csv_bytes=csv_bytes,
            csv_filename=csv_filename,
            image_files=image_payloads,
            zip_bytes=zip_bytes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")

    log_action(
        db, current_user.id, "training_dataset_upload",
        "training_dataset", dataset.id,
        details={"name": dataset.name, "rows": dataset.usable_rows},
        ip_address=request.client.host if request.client else None,
    )
    return TrainingDatasetResponse.model_validate(dataset)


@router.get("/datasets", response_model=TrainingDatasetListResponse)
def list_datasets(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    rows = (
        db.query(TrainingDataset)
        .order_by(TrainingDataset.created_at.desc())
        .all()
    )
    return TrainingDatasetListResponse(
        datasets=[TrainingDatasetResponse.model_validate(r) for r in rows],
        total=len(rows),
    )


@router.get(
    "/datasets/{dataset_id}", response_model=TrainingDatasetResponse
)
def get_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    ds = db.query(TrainingDataset).filter(TrainingDataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return TrainingDatasetResponse.model_validate(ds)


@router.delete("/datasets/{dataset_id}", status_code=204)
def delete_dataset(
    dataset_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    ds = db.query(TrainingDataset).filter(TrainingDataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    active_run = (
        db.query(TrainingRun)
        .filter(
            TrainingRun.dataset_id == dataset_id,
            TrainingRun.status.in_([
                TrainingRunStatus.QUEUED, TrainingRunStatus.RUNNING,
            ]),
        )
        .first()
    )
    if active_run:
        raise HTTPException(
            status_code=409,
            detail="Dataset has an active training run; wait for it to finish.",
        )

    training_service.delete_dataset(dataset_id)
    log_action(
        db, current_user.id, "training_dataset_delete",
        "training_dataset", dataset_id,
        ip_address=request.client.host if request.client else None,
    )
    return None


# ─── Runs ──────────────────────────────────────────────────────────

@router.post("/runs", response_model=TrainingRunResponse, status_code=201)
def create_run(
    body: TrainingRunCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    ds = (
        db.query(TrainingDataset)
        .filter(TrainingDataset.id == body.dataset_id)
        .first()
    )
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if ds.status != TrainingDatasetStatus.READY:
        raise HTTPException(
            status_code=400,
            detail=f"Dataset is not ready (status={ds.status.value}).",
        )
    if ds.usable_rows < 4:
        raise HTTPException(
            status_code=400,
            detail="Dataset has too few usable rows to train (need ≥ 4).",
        )

    run = TrainingRun(
        dataset_id=ds.id,
        epochs=body.epochs,
        batch_size=body.batch_size,
        learning_rate=body.learning_rate,
        val_split=body.val_split,
        max_samples=body.max_samples,
        seed=body.seed,
        status=TrainingRunStatus.QUEUED,
        created_by=current_user.id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    training_service.queue_training_run(run.id)

    log_action(
        db, current_user.id, "training_run_start",
        "training_run", run.id,
        details={
            "dataset_id": ds.id,
            "epochs": run.epochs,
            "batch_size": run.batch_size,
            "lr": run.learning_rate,
        },
        ip_address=request.client.host if request.client else None,
    )
    return TrainingRunResponse.model_validate(run)


@router.get("/runs", response_model=TrainingRunListResponse)
def list_runs(
    dataset_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    q = db.query(TrainingRun).order_by(TrainingRun.created_at.desc())
    if dataset_id:
        q = q.filter(TrainingRun.dataset_id == dataset_id)
    rows = q.all()
    return TrainingRunListResponse(
        runs=[TrainingRunResponse.model_validate(r) for r in rows],
        total=len(rows),
    )


@router.get("/runs/{run_id}", response_model=TrainingRunResponse)
def get_run(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return TrainingRunResponse.model_validate(run)


@router.post("/runs/{run_id}/cancel", response_model=TrainingRunResponse)
def cancel_run(
    run_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Stop a queued or running training job.

    The training thread checks for cancellation between every batch, so the
    run typically transitions to ``cancelled`` within a second of this call
    returning. The best checkpoint observed so far (if any) is preserved
    and can still be promoted manually.
    """
    run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    try:
        training_service.cancel_run(run_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cancellation failed: {e}")

    db.refresh(run)
    log_action(
        db, current_user.id, "training_run_cancel",
        "training_run", run_id,
        details={"prior_status": run.status.value},
        ip_address=request.client.host if request.client else None,
    )
    return TrainingRunResponse.model_validate(run)


@router.post("/runs/{run_id}/promote", response_model=TrainingRunResponse)
def promote(
    run_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    try:
        target = training_service.promote_run(run_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Promotion failed: {e}")

    db.refresh(run)
    log_action(
        db, current_user.id, "training_run_promote",
        "training_run", run_id,
        details={"checkpoint": target},
        ip_address=request.client.host if request.client else None,
    )
    return TrainingRunResponse.model_validate(run)
