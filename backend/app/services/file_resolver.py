"""
MedicX — Cross-Machine File Path Resolver

The database stores absolute paths for uploaded X-rays, Grad-CAM heatmaps,
and generated PDF reports. Those paths are valid only on the machine that
created them — they break as soon as the project is opened on another
machine (different OS user, different drive layout, OneDrive sync from a
different account, etc.).

This helper takes a stored path (absolute or relative, Windows or POSIX
separators) and returns the actual file location on the *current* machine
by:

    1. Trying the stored path as-is.
    2. Detecting a "uploads" / "heatmaps" / "reports" segment inside the
       stored path and re-rooting it under the local storage directory,
       preserving any sub-folders (e.g. ``heatmaps/<case_id>/file.png``).
    3. Looking up the basename directly inside each storage directory.
    4. Recursively walking each storage directory for the basename.

The function returns ``None`` if the file truly cannot be located.
"""
from __future__ import annotations

import os
from typing import Optional

from app.config import settings


_STORAGE_DIRS = {
    "uploads": settings.UPLOAD_DIR,
    "heatmaps": settings.HEATMAP_DIR,
    "reports": settings.REPORT_DIR,
}


def _normalize(path: str) -> str:
    """Normalize separators so we can split a path that came from another OS."""
    return path.replace("\\", "/")


def resolve_storage_path(path: Optional[str]) -> Optional[str]:
    """Find the real on-disk location for a stored file path.

    Returns the absolute local path if found, else ``None``.
    """
    if not path:
        return None

    if os.path.exists(path):
        return path

    norm = _normalize(path)
    if os.path.exists(norm):
        return norm

    parts = [p for p in norm.split("/") if p]
    for idx, segment in enumerate(parts):
        key = segment.lower()
        if key in _STORAGE_DIRS:
            sub_parts = parts[idx + 1 :]
            if sub_parts:
                candidate = os.path.join(_STORAGE_DIRS[key], *sub_parts)
                if os.path.exists(candidate):
                    return candidate

    filename = os.path.basename(norm)
    if filename:
        for storage_dir in _STORAGE_DIRS.values():
            candidate = os.path.join(storage_dir, filename)
            if os.path.exists(candidate):
                return candidate

        for storage_dir in _STORAGE_DIRS.values():
            if not os.path.isdir(storage_dir):
                continue
            for root, _dirs, files in os.walk(storage_dir):
                if filename in files:
                    return os.path.join(root, filename)

    print(f"[FILE RESOLVER] Could not resolve path: {path}")
    return None
