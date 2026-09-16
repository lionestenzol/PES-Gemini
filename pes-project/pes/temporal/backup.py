import datetime
import hashlib
import json
import os
import sqlite3
from pathlib import Path

from pes import database


def _backup_sqlite(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(source) as source_conn, sqlite3.connect(target) as target_conn:
        source_conn.backup(target_conn)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def backup_runtime(
    output_dir: str | Path,
    temporal_db: str | Path | None = None,
    query_db: str | Path | None = None,
) -> Path:
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    temporal_source = Path(temporal_db or (
        Path(os.environ.get("LOCALAPPDATA", Path.home())) / "PES" / "temporal.db"
    ))
    query_source = Path(query_db or database.DB_PATH)
    if not temporal_source.exists():
        raise FileNotFoundError(f"Temporal database not found: {temporal_source}")
    if not query_source.exists():
        raise FileNotFoundError(f"PES query database not found: {query_source}")
    temporal_target = output / "temporal.db"
    query_target = output / "pes.db"
    _backup_sqlite(temporal_source, temporal_target)
    _backup_sqlite(query_source, query_target)
    manifest = {
        "created_at": datetime.datetime.now(datetime.UTC).isoformat(),
        "temporal": {
            "file": temporal_target.name, "sha256": _sha256(temporal_target),
        },
        "query": {
            "file": query_target.name, "sha256": _sha256(query_target),
        },
    }
    manifest_path = output / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest_path


def restore_runtime(
    manifest_path: str | Path,
    temporal_target: str | Path,
    query_target: str | Path,
) -> None:
    manifest_path = Path(manifest_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for key, target in (
        ("temporal", Path(temporal_target)),
        ("query", Path(query_target)),
    ):
        source = manifest_path.parent / manifest[key]["file"]
        if _sha256(source) != manifest[key]["sha256"]:
            raise ValueError(f"{key} backup hash mismatch")
        _backup_sqlite(source, target)
