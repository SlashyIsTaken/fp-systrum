"""Reconciliation core — merge fragments into one graph, annotations win last."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from .model import Graph, GraphEdge, GraphFragment, GraphNode, NodeLink
from .providers.annotations import Annotations

_CONFIDENCE_RANK = {"declared": 1, "observed": 2, "annotated": 3}


def reconcile(
    fragments: list[GraphFragment],
    annotations: Annotations | None = None,
    providers_used: list[str] | None = None,
) -> Graph:
    nodes: dict[str, GraphNode] = {}
    edges: dict[str, GraphEdge] = {}

    for frag in fragments:
        for node in frag.nodes:
            _merge_node(nodes, node)
        for edge in frag.edges:
            _merge_edge(edges, edge)

    if annotations:
        _apply_assign(nodes, annotations)
        _apply_links(nodes, annotations)

    _ensure_endpoints(nodes, edges.values())
    _build_domain_groups(nodes, annotations)

    return Graph(
        nodes=list(nodes.values()),
        edges=list(edges.values()),
        generatedAt=datetime.now(timezone.utc).isoformat(),
        providers=providers_used or [f.provider for f in fragments],
    )


def _merge_node(nodes: dict[str, GraphNode], incoming: GraphNode) -> None:
    existing = nodes.get(incoming.id)
    if existing is None:
        nodes[incoming.id] = incoming.model_copy(deep=True)
        return
    # Enrich: fill gaps, never clobber a real value with an empty one.
    for fld in ("domain", "layer", "environment", "name", "health"):
        if getattr(existing, fld) in (None, "") and getattr(incoming, fld) not in (None, ""):
            setattr(existing, fld, getattr(incoming, fld))
    if incoming.internetFacing:
        existing.internetFacing = True
    if incoming.kind == "datastore" or incoming.kind == "queue":
        existing.kind = incoming.kind  # compose classification beats a stub
    for t in incoming.tech:
        if t not in existing.tech:
            existing.tech.append(t)
    for k, v in incoming.meta.items():
        if v is not None and k not in existing.meta:
            existing.meta[k] = v


def _merge_edge(edges: dict[str, GraphEdge], incoming: GraphEdge) -> None:
    existing = edges.get(incoming.id)
    if existing is None:
        edges[incoming.id] = incoming.model_copy(deep=True)
        return
    inc_rank = _CONFIDENCE_RANK.get(incoming.confidence, 0)
    cur_rank = _CONFIDENCE_RANK.get(existing.confidence, 0)
    if inc_rank > cur_rank:
        # Higher-trust source wins on the descriptive fields.
        existing.confidence = incoming.confidence
        if incoming.auth and incoming.auth != "none":
            existing.auth = incoming.auth
        if incoming.label:
            existing.label = incoming.label
    if incoming.lastSeen:
        existing.lastSeen = incoming.lastSeen
    if incoming.traffic:
        existing.traffic = incoming.traffic
    for k, v in incoming.meta.items():
        existing.meta.setdefault(k, v)


def _apply_assign(nodes: dict[str, GraphNode], ann: Annotations) -> None:
    for node_id, overrides in ann.assign.items():
        node = nodes.get(node_id)
        if node is None:
            continue
        if "domain" in overrides:
            node.domain = overrides["domain"]
        if "layer" in overrides:
            node.layer = overrides["layer"]
        if "internetFacing" in overrides:
            node.internetFacing = bool(overrides["internetFacing"])
        if overrides.get("zone"):
            node.meta["zone"] = overrides["zone"]
        if overrides.get("label"):
            node.name = overrides["label"]


def _apply_links(nodes: dict[str, GraphNode], ann: Annotations) -> None:
    for node_id, items in ann.links.items():
        node = nodes.get(node_id)
        if node is None:
            continue
        node.links = [NodeLink(label=i["label"], href=i["href"]) for i in items]


def _ensure_endpoints(nodes: dict[str, GraphNode], edges) -> None:
    for edge in edges:
        for endpoint in (edge.source, edge.target):
            if endpoint not in nodes:
                nodes[endpoint] = GraphNode(
                    id=endpoint,
                    kind="external",
                    name=_titleize(endpoint),
                    meta={"_stub": True},
                )


def _build_domain_groups(nodes: dict[str, GraphNode], ann: Annotations | None) -> None:
    palette = (ann.domains if ann else {}) or {}
    domains = sorted(
        {n.domain for n in nodes.values() if n.domain and n.kind != "domain"}
    )
    for domain in domains:
        group_id = f"domain:{domain}"
        if group_id not in nodes:
            spec = palette.get(domain, {})
            nodes[group_id] = GraphNode(
                id=group_id,
                kind="domain",
                name=spec.get("label", _titleize(domain)),
                domain=domain,
                meta={"color": spec.get("color")},
            )
    for node in nodes.values():
        if node.kind != "domain" and node.domain:
            node.parentId = f"domain:{node.domain}"


def _titleize(slug: str) -> str:
    return re.sub(r"[-_]+", " ", slug).strip().title()
