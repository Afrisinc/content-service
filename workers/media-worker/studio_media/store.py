from __future__ import annotations

import sys
from pathlib import Path

WORKERS_ROOT = Path(__file__).resolve().parents[2]
if str(WORKERS_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKERS_ROOT))

from shared.storage import ObjectStore

_store: ObjectStore | None = None


def store() -> ObjectStore:
    global _store
    if _store is None:
        _store = ObjectStore()
    return _store


def fetch(key: str, root: Path) -> Path:
    destination = root / key
    if not destination.exists():
        store().download(key, destination)
    return destination
