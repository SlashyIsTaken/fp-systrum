"""Snapshot diffing — compares two reconciled graphs and emits a GraphDiff.

Powers the WebSocket live channel and the "what changed" activity feed. We only
report *meaningful* changes: node health flips and the descriptive edge fields
(confidence escalation, auth). Per-cycle traffic numbers are deliberately not
treated as changes so the feed stays signal, not noise.
"""

from __future__ import annotations

from datetime import datetime, timezone

from .model import EdgeChange, Graph, GraphDiff, GraphEdge, GraphNode, NodeChange

# Fields whose change is worth surfacing.
_NODE_FIELDS = ("name", "domain", "layer", "internetFacing", "kind")
_EDGE_FIELDS = ("confidence", "auth", "protocol")


def _node_health(node: GraphNode) -> str:
    return node.health.status if node.health else "unknown"


def _node_changes(before: GraphNode, after: GraphNode) -> NodeChange | None:
    b: dict = {}
    a: dict = {}
    for field in _NODE_FIELDS:
        if getattr(before, field) != getattr(after, field):
            b[field] = getattr(before, field)
            a[field] = getattr(after, field)
    bh, ah = _node_health(before), _node_health(after)
    if bh != ah:
        b["health"] = bh
        a["health"] = ah
    if not a:
        return None
    return NodeChange(id=after.id, before=b, after=a)


def _edge_changes(before: GraphEdge, after: GraphEdge) -> EdgeChange | None:
    b: dict = {}
    a: dict = {}
    for field in _EDGE_FIELDS:
        if getattr(before, field) != getattr(after, field):
            b[field] = getattr(before, field)
            a[field] = getattr(after, field)
    # Sync live traffic so the UI can re-thickness edges and run flow particles.
    # This is intentionally *not* a feed-worthy field — the activity feed only
    # reacts to confidence/auth/health, so per-cycle traffic stays out of it.
    bt = before.traffic.model_dump() if before.traffic else None
    at = after.traffic.model_dump() if after.traffic else None
    if at != bt:
        b["traffic"] = bt
        a["traffic"] = at
    if not a:
        return None
    return EdgeChange(id=after.id, before=b, after=a)


def diff_graphs(before: Graph | None, after: Graph) -> GraphDiff:
    at = after.generatedAt or datetime.now(timezone.utc).isoformat()
    diff = GraphDiff(at=at)
    if before is None:
        diff.nodesAdded = list(after.nodes)
        diff.edgesAdded = list(after.edges)
        return diff

    old_nodes = {n.id: n for n in before.nodes}
    new_nodes = {n.id: n for n in after.nodes}
    for node_id, node in new_nodes.items():
        if node_id not in old_nodes:
            diff.nodesAdded.append(node)
        else:
            change = _node_changes(old_nodes[node_id], node)
            if change:
                diff.nodesChanged.append(change)
    diff.nodesRemoved = [nid for nid in old_nodes if nid not in new_nodes]

    old_edges = {e.id: e for e in before.edges}
    new_edges = {e.id: e for e in after.edges}
    for edge_id, edge in new_edges.items():
        if edge_id not in old_edges:
            diff.edgesAdded.append(edge)
        else:
            change = _edge_changes(old_edges[edge_id], edge)
            if change:
                diff.edgesChanged.append(change)
    diff.edgesRemoved = [eid for eid in old_edges if eid not in new_edges]

    return diff
