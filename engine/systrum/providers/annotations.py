"""Annotation layer — human ground truth from topology.yml.

Parsed into an `Annotations` object that reconcile applies last (it wins over
discovered values). The `AnnotationsProvider` also emits the external nodes and
explicit edges declared by hand, so they appear as discovery output.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from ..model import GraphEdge, GraphFragment, GraphNode
from .base import Context


@dataclass
class Annotations:
    domains: dict[str, dict[str, Any]] = field(default_factory=dict)
    zones: dict[str, dict[str, Any]] = field(default_factory=dict)
    nodes: list[dict[str, Any]] = field(default_factory=list)
    assign: dict[str, dict[str, Any]] = field(default_factory=dict)
    edges: list[dict[str, Any]] = field(default_factory=list)
    links: dict[str, list[dict[str, Any]]] = field(default_factory=dict)


def load_annotations(path: str | Path | None) -> Annotations | None:
    if not path:
        return None
    p = Path(path)
    if not p.is_file():
        return None
    data: dict[str, Any] = yaml.safe_load(p.read_text()) or {}
    return Annotations(
        domains=data.get("domains", {}) or {},
        zones=data.get("zones", {}) or {},
        nodes=data.get("nodes", []) or [],
        assign=data.get("assign", {}) or {},
        edges=data.get("edges", []) or [],
        links=data.get("links", {}) or {},
    )


class AnnotationsProvider:
    name = "annotations"
    kind = "static"

    def __init__(self, annotations: Annotations | None = None):
        self._annotations = annotations

    def discover(self, ctx: Context) -> GraphFragment:
        ann = self._annotations or load_annotations(ctx.annotations_file)
        frag = GraphFragment(provider=self.name)
        if not ann:
            return frag

        for spec in ann.nodes:
            meta = dict(spec.get("meta", {}) or {})
            if spec.get("zone"):
                meta["zone"] = spec["zone"]
            frag.nodes.append(
                GraphNode(
                    id=spec["id"],
                    kind=spec.get("kind", "external"),
                    name=spec.get("name", spec["id"]),
                    domain=spec.get("domain"),
                    layer=spec.get("layer"),
                    internetFacing=bool(spec.get("internetFacing", False)),
                    meta=meta,
                )
            )

        for spec in ann.edges:
            protocol = spec.get("protocol", "http")
            note = spec.get("note")
            frag.edges.append(
                GraphEdge(
                    id=GraphEdge.make_id(spec["source"], spec["target"], protocol),
                    source=spec["source"],
                    target=spec["target"],
                    protocol=protocol,
                    auth=spec.get("auth", "none"),
                    confidence="annotated",
                    label=note,
                    meta={"note": note} if note else {},
                )
            )
        return frag
