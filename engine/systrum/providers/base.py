"""Provider contract + shared discovery context."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from ..model import GraphFragment


@dataclass
class Context:
    """Everything a provider needs to look at the world (read-only)."""

    repo_paths: list[str]
    config: dict[str, Any] = field(default_factory=dict)
    annotations_file: Path | None = None
    docker_socket: str | None = None
    http_targets: list[str] = field(default_factory=list)


@runtime_checkable
class Provider(Protocol):
    name: str
    kind: str  # "static" | "live"

    def discover(self, ctx: Context) -> GraphFragment: ...
