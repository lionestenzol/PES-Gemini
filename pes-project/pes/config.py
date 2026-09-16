from __future__ import annotations
import os
import tomllib
from pathlib import Path


DEFAULTS = {
    "working_hours": "09:00-17:00",
    "default_mode": "Full",
    "work_time_unit": 0.25,
}
VALID_MODES = {"Full", "Reduced", "Recovery", "Admin", "Field", "Review"}


def config_path() -> Path:
    override = os.environ.get("PES_CONFIG_PATH")
    return Path(override).expanduser() if override else Path.home() / ".config" / "pes" / "config.toml"


def load_config(path: str | Path | None = None) -> dict:
    target = Path(path) if path else config_path()
    data = dict(DEFAULTS)
    if target.exists():
        with target.open("rb") as stream:
            parsed = tomllib.load(stream)
        section = parsed.get("pes", parsed)
        data.update(section)
    if data["default_mode"] not in VALID_MODES:
        raise ValueError(f"invalid default_mode {data['default_mode']!r}")
    if not isinstance(data["working_hours"], str) or "-" not in data["working_hours"]:
        raise ValueError("working_hours must look like 09:00-17:00")
    unit = float(data["work_time_unit"])
    if unit <= 0:
        raise ValueError("work_time_unit must be positive")
    data["work_time_unit"] = unit
    data["path"] = str(target)
    return data
