"""Provider contract + shared discovery context."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

from ..model import GraphFragment

if TYPE_CHECKING:
    from ..model import Graph


@dataclass
class Context:
    """Everything a provider needs to look at the world (read-only)."""

    repo_paths: list[str]
    config: dict[str, Any] = field(default_factory=dict)
    annotations_file: Path | None = None
    docker_socket: str | None = None
    http_targets: list[str] = field(default_factory=list)
    # The most recent reconciled snapshot, so live providers (simulate, and
    # later prometheus) can overlay observations onto the known topology.
    current_graph: "Graph | None" = None


@runtime_checkable
class Provider(Protocol):
    name: str
    kind: str  # "static" | "live"

    def discover(self, ctx: Context) -> GraphFragment: ...
