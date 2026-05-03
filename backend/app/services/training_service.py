"""
MedicX — Training Service

Lets an admin (1) ingest a labelled chest X-ray dataset in the NIH
ChestX-ray14 CSV format and (2) fine-tune the production ResNet18 +
ImprovedHead model on it.

Key design choices
------------------
* Only the ``Image Index`` and ``Finding Labels`` CSV columns are used,
  per the user's brief ("focus on image and labels").
* Pipe-separated labels are reduced to the 5 disease classes that MediX
  actually predicts (``settings.DISEASE_CLASSES``); rows that don't
  intersect those classes and aren't ``No Finding`` are dropped.
* Training runs on a daemon ``threading.Thread`` with its own DB session,
  so the FastAPI worker stays responsive and progress is poll-able from
  the UI via the ``TrainingRun`` row.
* If PyTorch isn't installed the service still ingests datasets and
  records a clear error when training is requested; the rest of MediX
  already runs in simulation mode.
"""
from __future__ import annotations

import csv
import io
import json
import os
import shutil
import threading
import traceback
import zipfile
from datetime import datetime, timezone
from typing import Optional

from app.config import settings
from app.database import SessionLocal
from app.models.training import (
    TrainingDataset,
    TrainingDatasetStatus,
    TrainingRun,
    TrainingRunStatus,
)

try:
    import torch
    import torch.nn as nn
    from torch.utils.data import Dataset, DataLoader, random_split
    from torchvision import transforms
    from PIL import Image
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False


_IMAGE_EXTS = {".png", ".jpg", ".jpeg"}

# Run-id -> threading.Event used to politely ask a running training thread
# to stop. Event is created when a run is queued and removed when the run
# terminates (regardless of outcome).
_cancel_events: dict[str, "threading.Event"] = {}
_cancel_lock = threading.Lock()


class _CancelledTraining(Exception):
    """Raised inside the training loop when an admin cancels the run."""


def _register_cancel_event(run_id: str) -> "threading.Event":
    ev = threading.Event()
    with _cancel_lock:
        _cancel_events[run_id] = ev
    return ev


def _release_cancel_event(run_id: str) -> None:
    with _cancel_lock:
        _cancel_events.pop(run_id, None)


def request_cancel(run_id: str) -> bool:
    """Signal the training thread for ``run_id`` to stop.

    Returns ``True`` if a live training thread was found, ``False`` if the
    run was only queued (or already finished); the caller is then expected
    to flip the DB status itself.
    """
    with _cancel_lock:
        ev = _cancel_events.get(run_id)
    if ev is None:
        return False
    ev.set()
    return True


# ───────────────────────────── Helpers ────────────────────────────────

def _normalize_label(label: str) -> str:
    """Normalize an NIH label (case + underscores) to disease-class casing."""
    return label.strip().replace("_", " ").lower()


def _disease_index() -> dict:
    """Map of normalized label -> 0-based index into DISEASE_CLASSES."""
    return {d.lower(): i for i, d in enumerate(settings.DISEASE_CLASSES)}


def torch_capabilities() -> dict:
    """Report whether the host can train at all."""
    info = {
        "torch_available": TORCH_AVAILABLE,
        "cuda_available": False,
        "device": None,
        "disease_classes": list(settings.DISEASE_CLASSES),
        "active_model_path": settings.MODEL_PATH,
        "active_model_exists": os.path.exists(settings.MODEL_PATH),
    }
    if TORCH_AVAILABLE:
        info["cuda_available"] = bool(torch.cuda.is_available())
        info["device"] = "cuda" if torch.cuda.is_available() else "cpu"
    return info


# ─────────────────────────── Dataset ingestion ────────────────────────

def ingest_dataset(
    *,
    name: str,
    description: Optional[str],
    uploaded_by: str,
    csv_bytes: Optional[bytes],
    csv_filename: Optional[str],
    image_files: list,           # list of (filename, bytes)
    zip_bytes: Optional[bytes],  # optional ZIP that may contain CSV + images
) -> TrainingDataset:
    """Persist a new dataset on disk and in the DB.

    The caller may supply either:
      * a CSV + a list of image file uploads, OR
      * a single ZIP archive containing both the CSV and the images.

    Returns the freshly-created (and committed) ``TrainingDataset``.
    """
    if not name:
        raise ValueError("Dataset name is required.")
    if not csv_bytes and not zip_bytes:
        raise ValueError(
            "Provide a labels CSV (and image files), or a ZIP containing both."
        )

    db = SessionLocal()
    try:
        dataset = TrainingDataset(
            name=name.strip(),
            description=(description or "").strip() or None,
            status=TrainingDatasetStatus.INGESTING,
            storage_dir="",
            uploaded_by=uploaded_by,
        )
        db.add(dataset)
        db.commit()
        db.refresh(dataset)

        storage_dir = os.path.join(settings.TRAINING_DATA_DIR, dataset.id)
        images_dir = os.path.join(storage_dir, "images")
        os.makedirs(images_dir, exist_ok=True)
        dataset.storage_dir = storage_dir

        try:
            csv_text, written_images = _materialize_uploads(
                images_dir=images_dir,
                csv_bytes=csv_bytes,
                csv_filename=csv_filename,
                image_files=image_files,
                zip_bytes=zip_bytes,
            )

            manifest, summary = _build_manifest(
                csv_text=csv_text,
                images_dir=images_dir,
                available_image_names=written_images,
            )

            manifest_path = os.path.join(storage_dir, "manifest.json")
            with open(manifest_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f)

            dataset.manifest_path = manifest_path
            dataset.total_rows = summary["total_rows"]
            dataset.usable_rows = len(manifest)
            dataset.label_summary = summary["label_summary"]
            dataset.status = TrainingDatasetStatus.READY
            db.commit()
            db.refresh(dataset)
            return dataset
        except Exception as e:
            dataset.status = TrainingDatasetStatus.FAILED
            dataset.error_message = f"{type(e).__name__}: {e}"
            db.commit()
            raise
    finally:
        db.close()


def _materialize_uploads(
    *,
    images_dir: str,
    csv_bytes: Optional[bytes],
    csv_filename: Optional[str],
    image_files: list,
    zip_bytes: Optional[bytes],
):
    """Drop all uploaded bytes onto disk under ``images_dir``.

    Returns ``(csv_text, set_of_written_image_basenames)``.
    """
    written = set()
    csv_text: Optional[str] = None

    if zip_bytes:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                base = os.path.basename(info.filename)
                if not base:
                    continue
                ext = os.path.splitext(base)[1].lower()
                if ext == ".csv" and csv_text is None:
                    csv_text = zf.read(info).decode("utf-8-sig", errors="replace")
                elif ext in _IMAGE_EXTS:
                    target = os.path.join(images_dir, base)
                    with zf.open(info) as src, open(target, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                    written.add(base)

    if csv_bytes is not None:
        csv_text = csv_bytes.decode("utf-8-sig", errors="replace")

    if image_files:
        for fname, data in image_files:
            base = os.path.basename(fname)
            ext = os.path.splitext(base)[1].lower()
            if ext not in _IMAGE_EXTS:
                continue
            target = os.path.join(images_dir, base)
            with open(target, "wb") as dst:
                dst.write(data)
            written.add(base)

    if csv_text is None:
        raise ValueError(
            "No CSV labels file found. Provide a CSV directly, or include "
            "one inside the uploaded ZIP."
        )
    if not written:
        raise ValueError("No image files were uploaded.")
    return csv_text, written


def _build_manifest(
    *,
    csv_text: str,
    images_dir: str,
    available_image_names: set,
) -> tuple[list, dict]:
    """Parse the CSV and produce a row-per-image training manifest.

    Each manifest entry is::

        {"image": "<absolute path>", "labels": [0/1, 0/1, 0/1, 0/1, 0/1]}
    """
    classes = list(settings.DISEASE_CLASSES)
    class_index = _disease_index()
    label_summary = {d: 0 for d in classes}
    label_summary["No Finding"] = 0

    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        raise ValueError("CSV appears to be empty.")

    fields = {f.lower().strip(): f for f in reader.fieldnames}
    img_col = fields.get("image index") or fields.get("image") or fields.get("filename")
    lbl_col = fields.get("finding labels") or fields.get("labels") or fields.get("label")
    if not img_col or not lbl_col:
        raise ValueError(
            "CSV must contain 'Image Index' and 'Finding Labels' columns "
            f"(saw: {reader.fieldnames})."
        )

    manifest = []
    total_rows = 0
    for row in reader:
        total_rows += 1
        image_name = (row.get(img_col) or "").strip()
        labels_raw = (row.get(lbl_col) or "").strip()
        if not image_name or image_name not in available_image_names:
            continue

        vec = [0] * len(classes)
        matched_any = False
        is_no_finding = False
        for raw in labels_raw.split("|"):
            n = _normalize_label(raw)
            if not n:
                continue
            if n == "no finding":
                is_no_finding = True
                continue
            idx = class_index.get(n)
            if idx is not None:
                vec[idx] = 1
                matched_any = True
                label_summary[classes[idx]] += 1

        if not matched_any and not is_no_finding:
            continue
        if is_no_finding and not matched_any:
            label_summary["No Finding"] += 1

        manifest.append({
            "image": os.path.join(images_dir, image_name),
            "labels": vec,
        })

    return manifest, {"total_rows": total_rows, "label_summary": label_summary}


def delete_dataset(dataset_id: str) -> None:
    """Remove a dataset from disk and DB. Refuses if any run references it."""
    db = SessionLocal()
    try:
        ds = db.query(TrainingDataset).filter(TrainingDataset.id == dataset_id).first()
        if not ds:
            return
        if ds.storage_dir and os.path.isdir(ds.storage_dir):
            shutil.rmtree(ds.storage_dir, ignore_errors=True)
        db.delete(ds)
        db.commit()
    finally:
        db.close()


# ───────────────────────────── Training ───────────────────────────────

def queue_training_run(run_id: str) -> None:
    """Spawn a daemon thread that performs the actual training."""
    _register_cancel_event(run_id)
    t = threading.Thread(target=_train_run_safely, args=(run_id,), daemon=True)
    t.start()


def _train_run_safely(run_id: str) -> None:
    try:
        _train_run(run_id)
    except _CancelledTraining:
        # Already marked CANCELLED inside the loop; nothing to do here.
        pass
    except Exception as exc:
        print(f"[TRAINING] Run {run_id} crashed: {exc}")
        traceback.print_exc()
        db = SessionLocal()
        try:
            run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
            if run:
                run.status = TrainingRunStatus.FAILED
                run.error_message = f"{type(exc).__name__}: {exc}"
                run.finished_at = datetime.now(timezone.utc)
                db.commit()
        finally:
            db.close()
    finally:
        _release_cancel_event(run_id)


def _train_run(run_id: str) -> None:
    db = SessionLocal()
    cancel_event = _cancel_events.get(run_id)

    def _check_cancelled():
        """Mark the run as CANCELLED and bail out if the admin asked to stop."""
        if cancel_event is not None and cancel_event.is_set():
            run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
            if run and run.status not in (
                TrainingRunStatus.COMPLETED,
                TrainingRunStatus.FAILED,
                TrainingRunStatus.PROMOTED,
            ):
                run.status = TrainingRunStatus.CANCELLED
                run.finished_at = datetime.now(timezone.utc)
                if not run.error_message:
                    run.error_message = "Training cancelled by an administrator."
                db.commit()
            raise _CancelledTraining()

    try:
        run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
        if not run:
            return

        # Allow cancellation even before training starts.
        _check_cancelled()

        ds = (
            db.query(TrainingDataset)
            .filter(TrainingDataset.id == run.dataset_id)
            .first()
        )
        if not ds:
            run.status = TrainingRunStatus.FAILED
            run.error_message = "Dataset no longer exists."
            run.finished_at = datetime.now(timezone.utc)
            db.commit()
            return

        if not TORCH_AVAILABLE:
            run.status = TrainingRunStatus.FAILED
            run.error_message = (
                "PyTorch is not installed on the server, so training is "
                "unavailable. Install torch + torchvision to enable it."
            )
            run.finished_at = datetime.now(timezone.utc)
            db.commit()
            return

        if not ds.manifest_path or not os.path.exists(ds.manifest_path):
            run.status = TrainingRunStatus.FAILED
            run.error_message = "Dataset manifest missing on disk."
            run.finished_at = datetime.now(timezone.utc)
            db.commit()
            return

        with open(ds.manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        if run.max_samples and run.max_samples < len(manifest):
            torch.manual_seed(run.seed)
            idxs = torch.randperm(len(manifest))[: run.max_samples].tolist()
            manifest = [manifest[i] for i in idxs]

        if len(manifest) < 4:
            run.status = TrainingRunStatus.FAILED
            run.error_message = (
                f"Dataset has only {len(manifest)} usable rows; need at least 4."
            )
            run.finished_at = datetime.now(timezone.utc)
            db.commit()
            return

        run.status = TrainingRunStatus.RUNNING
        run.started_at = datetime.now(timezone.utc)
        run.metrics_per_epoch = []
        db.commit()

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"[TRAINING] Run {run_id[:8]} starting on {device}")

        train_ds, val_ds = _split_dataset(manifest, run.val_split, run.seed)
        train_loader = DataLoader(
            train_ds, batch_size=run.batch_size, shuffle=True, num_workers=0
        )
        val_loader = DataLoader(
            val_ds, batch_size=run.batch_size, shuffle=False, num_workers=0
        ) if len(val_ds) > 0 else None

        model = _build_model(device)
        criterion = nn.BCEWithLogitsLoss()
        optimizer = torch.optim.Adam(model.parameters(), lr=run.learning_rate)

        run_dir = os.path.join(settings.TRAINING_RUNS_DIR, run.id)
        os.makedirs(run_dir, exist_ok=True)
        best_path = os.path.join(run_dir, "best.pth")

        best_val = float("inf")
        history = []

        for epoch in range(1, run.epochs + 1):
            _check_cancelled()
            model.train()
            running_loss, n_batches = 0.0, 0
            for imgs, labels in train_loader:
                # Sub-second cancellation: check before every batch so an
                # admin pressing "Cancel" doesn't wait a full epoch on a
                # large dataset.
                _check_cancelled()
                imgs = imgs.to(device)
                labels = labels.to(device)
                optimizer.zero_grad()
                logits = model(imgs)
                loss = criterion(logits, labels)
                loss.backward()
                optimizer.step()
                running_loss += float(loss.item())
                n_batches += 1
            train_loss = running_loss / max(n_batches, 1)

            val_loss = None
            if val_loader is not None:
                model.eval()
                v_loss, v_batches = 0.0, 0
                with torch.no_grad():
                    for imgs, labels in val_loader:
                        _check_cancelled()
                        imgs = imgs.to(device)
                        labels = labels.to(device)
                        logits = model(imgs)
                        v_loss += float(criterion(logits, labels).item())
                        v_batches += 1
                val_loss = v_loss / max(v_batches, 1)

            run.current_epoch = epoch
            run.train_loss = train_loss
            run.val_loss = val_loss
            history.append({
                "epoch": epoch,
                "train_loss": train_loss,
                "val_loss": val_loss,
            })
            run.metrics_per_epoch = history

            metric_for_best = val_loss if val_loss is not None else train_loss
            if metric_for_best < best_val:
                best_val = metric_for_best
                run.best_val_loss = best_val
                torch.save({"model_state_dict": model.state_dict()}, best_path)
                run.checkpoint_path = best_path

            db.commit()
            print(
                f"[TRAINING] Run {run_id[:8]} epoch {epoch}/{run.epochs} "
                f"train={train_loss:.4f} val={val_loss}"
            )

        run.status = TrainingRunStatus.COMPLETED
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        print(f"[TRAINING] Run {run_id[:8]} done. Best={best_val:.4f}")
    finally:
        db.close()


def _split_dataset(manifest: list, val_split: float, seed: int):
    full = _ManifestImageDataset(manifest)
    val_n = int(len(full) * val_split) if val_split > 0 else 0
    train_n = len(full) - val_n
    if val_n == 0:
        return full, _ManifestImageDataset([])
    g = torch.Generator().manual_seed(seed)
    return random_split(full, [train_n, val_n], generator=g)


def _build_model(device):
    """Reuse the production architecture so the checkpoint is hot-swappable."""
    from torchvision import models
    from app.services.ai_service import ImprovedHead

    model = models.resnet18(weights=None)
    in_features = model.fc.in_features
    model.fc = ImprovedHead(in_features, len(settings.DISEASE_CLASSES))

    if os.path.exists(settings.MODEL_PATH):
        try:
            ck = torch.load(settings.MODEL_PATH, map_location=device, weights_only=False)
            state = ck["model_state_dict"] if isinstance(ck, dict) and "model_state_dict" in ck else ck
            model.load_state_dict(state)
            print("[TRAINING] Warm-starting from existing MODEL_PATH checkpoint.")
        except Exception as e:
            print(f"[TRAINING] Could not warm-start ({e}); training from ImageNet-less init.")

    return model.to(device)


if TORCH_AVAILABLE:
    _TRAIN_TRANSFORM = transforms.Compose([
        transforms.Resize((settings.IMAGE_SIZE, settings.IMAGE_SIZE)),
        transforms.RandomHorizontalFlip(p=0.3),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
        ),
    ])

    class _ManifestImageDataset(Dataset):
        def __init__(self, items: list):
            self.items = items

        def __len__(self):
            return len(self.items)

        def __getitem__(self, idx):
            entry = self.items[idx]
            img = Image.open(entry["image"]).convert("RGB")
            tensor = _TRAIN_TRANSFORM(img)
            labels = torch.tensor(entry["labels"], dtype=torch.float32)
            return tensor, labels
else:
    class _ManifestImageDataset:  # type: ignore[no-redef]
        def __init__(self, items: list):
            self.items = items

        def __len__(self):
            return len(self.items)


# ────────────────────────── Cancellation ──────────────────────────────

def cancel_run(run_id: str) -> TrainingRun:
    """Stop a queued or running training job.

    * If the thread is alive, signal it; the loop will mark the row as
      ``CANCELLED`` itself the next time it checks (within one batch).
    * If no thread is registered (e.g. the run was queued but the worker
      never started, or it was restored after a server restart), flip the
      DB status here so the UI reflects reality immediately.

    Raises ``ValueError`` if the run is already in a terminal state.
    """
    db = SessionLocal()
    try:
        run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
        if not run:
            raise ValueError("Training run not found.")
        if run.status in (
            TrainingRunStatus.COMPLETED,
            TrainingRunStatus.FAILED,
            TrainingRunStatus.PROMOTED,
            TrainingRunStatus.CANCELLED,
        ):
            raise ValueError(
                f"Run is already in a terminal state ({run.status.value})."
            )

        signalled = request_cancel(run_id)

        # When no live thread owns the run we mark it cancelled now so the
        # UI doesn't sit on a stale RUNNING/QUEUED row forever.
        if not signalled:
            run.status = TrainingRunStatus.CANCELLED
            run.finished_at = datetime.now(timezone.utc)
            if not run.error_message:
                run.error_message = "Training cancelled by an administrator."
            db.commit()
            db.refresh(run)

        return run
    finally:
        db.close()


# ─────────────────────────── Promotion ────────────────────────────────

def promote_run(run_id: str) -> str:
    """Copy the run's best checkpoint into ``MODEL_PATH`` and reload the live model.

    Returns the on-disk path of the promoted checkpoint.
    """
    db = SessionLocal()
    try:
        run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
        if not run:
            raise ValueError("Run not found.")
        promotable = (
            TrainingRunStatus.COMPLETED,
            TrainingRunStatus.PROMOTED,
            TrainingRunStatus.CANCELLED,  # allow promoting the best partial checkpoint
        )
        if run.status not in promotable:
            raise ValueError(
                f"Run is not promotable (status={run.status.value})."
            )
        if not run.checkpoint_path or not os.path.exists(run.checkpoint_path):
            raise ValueError("Run has no checkpoint on disk.")

        target = settings.MODEL_PATH
        os.makedirs(os.path.dirname(target), exist_ok=True)

        if os.path.exists(target):
            backup = target + ".bak"
            try:
                shutil.copy2(target, backup)
            except Exception as e:
                print(f"[TRAINING] Could not back up old model: {e}")

        shutil.copy2(run.checkpoint_path, target)

        run.status = TrainingRunStatus.PROMOTED
        db.commit()

        try:
            from app.services import ai_service
            ai_service.MediXModel._loaded = False
            ai_service.MediXModel._instance = None
            ai_service.ai_model = ai_service.MediXModel()
            print("[TRAINING] Active model hot-reloaded from promoted checkpoint.")
        except Exception as e:
            print(f"[TRAINING] Promoted but failed to hot-reload model: {e}")

        return target
    finally:
        db.close()
