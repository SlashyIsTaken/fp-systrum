"""Load and resolve a `systrum.yml` config file."""

from __future__ import annotations

import glob
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


@dataclass
class Config:
    name: str
    environment: str
    config_path: Path
    repos_root: Path
    repo_paths: list[str]
    providers: dict[str, dict[str, Any]]
    annotations_file: Path | None
    ui: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)

    def provider_enabled(self, name: str) -> bool:
        return bool(self.providers.get(name, {}).get("enabled", False))

    def provider_config(self, name: str) -> dict[str, Any]:
        return self.providers.get(name, {})

    @property
    def has_live_provider(self) -> bool:
        return self.provider_enabled("simulate") or self.provider_enabled("docker") or \
            self.provider_enabled("prometheus")

    @property
    def scheduler_interval(self) -> int:
        return int((self.raw.get("scheduler", {}) or {}).get("interval_s", 30))


def load_config(path: str | os.PathLike[str]) -> Config:
    config_path = Path(path).expanduser().resolve()
    if not config_path.is_file():
        raise FileNotFoundError(f"config not found: {config_path}")

    data: dict[str, Any] = yaml.safe_load(config_path.read_text()) or {}
    base_dir = config_path.parent

    repos = data.get("repos", {}) or {}
    root_raw = repos.get("root", ".")
    repos_root = (base_dir / root_raw).resolve() if not os.path.isabs(root_raw) else Path(root_raw)
    includes: list[str] = repos.get("include", ["*"]) or ["*"]

    repo_paths: list[str] = []
    for pattern in includes:
        for match in sorted(glob.glob(str(repos_root / pattern))):
            if os.path.isdir(match):
                repo_paths.append(match)
    # Always include the root itself so top-level compose files are found.
    if str(repos_root) not in repo_paths and repos_root.is_dir():
        repo_paths.insert(0, str(repos_root))

    annotations = data.get("annotations", {}) or {}
    ann_file_raw = annotations.get("file")
    annotations_file = None
    if ann_file_raw:
        annotations_file = (
            (base_dir / ann_file_raw).resolve()
            if not os.path.isabs(ann_file_raw)
            else Path(ann_file_raw)
        )

    return Config(
        name=data.get("name", "Systrum"),
        environment=data.get("environment", "production"),
        config_path=config_path,
        repos_root=repos_root,
        repo_paths=repo_paths,
        providers=data.get("providers", {}) or {},
        annotations_file=annotations_file,
        ui=data.get("ui", {}) or {},
        raw=data,
    )
