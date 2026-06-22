"""Simulation provider — a synthetic 'live' source for development & demos.

The real live providers (Docker, Prometheus) read container state and metrics
off a running stack. Standing that stack up isn't always practical — for UI
work, pipeline development, or a zero-dependency demo, this provider stands in:
it overlays *observed* health and traffic onto the already-discovered topology
(`ctx.current_graph`) and evolves that state every cycle, so the diff →
WebSocket → activity-feed pipeline has real movement to push.

It changes nothing about the topology; it only enriches existing nodes/edges,
which the reconciler escalates from `declared` to `observed`. Contributors can
enable it via `systrum.yml` to develop live features with no infrastructure:

    providers:
      simulate:
        enabled: true
        seed: 42            # optional — reproducible runs
        flap: 0.15          # per-cycle probability a node changes health
        force_down: [auth]  # optional — pin these node ids to "down"

Set `seed` for determinism (handy in tests); omit it for lively, varied runs.
"""

from __future__ import annotations

import random
from datetime import datetime, timezone

from ..model import EdgeTraffic, GraphEdge, GraphFragment, GraphNode, NodeHealth
from .base import Context

# Nodes of these kinds aren't ours to health-check (third parties / groupings).
_SKIP_KINDS = {"domain", "external"}

# Weighted health transitions for the per-node random walk.
_TRANSITIONS = {
    "healthy": [("healthy", 0.80), ("degraded", 0.17), ("down", 0.03)],
    "degraded": [("healthy", 0.55), ("degraded", 0.30), ("down", 0.15)],
    "down": [("down", 0.50), ("degraded", 0.30), ("healthy", 0.20)],
    "unknown": [("healthy", 0.90), ("degraded", 0.08), ("down", 0.02)],
}


class SimulateProvider:
    name = "simulate"
    kind = "live"

    def __init__(self) -> None:
        # Health is stateful across cycles so the walk is coherent, not a reroll.
        self._health: dict[str, str] = {}
        self._rng: random.Random | None = None

    def _ensure_rng(self, cfg: dict) -> random.Random:
        if self._rng is None:
            seed = cfg.get("seed")
            self._rng = random.Random(seed)
        return self._rng

    def discover(self, ctx: Context) -> GraphFragment:
        frag = GraphFragment(provider=self.name)
        graph = ctx.current_graph
        if graph is None:
            # Nothing discovered yet (first ever cycle) — nothing to observe.
            return frag

        cfg = ctx.config or {}
        rng = self._ensure_rng(cfg)
        flap = float(cfg.get("flap", 0.15))
        force_down = set(cfg.get("force_down", []) or [])
        now = datetime.now(timezone.utc).isoformat()

        for node in graph.nodes:
            if node.kind in _SKIP_KINDS:
                continue
            status = self._next_status(node.id, rng, flap, force_down)
            frag.nodes.append(
                GraphNode(
                    id=node.id,
                    kind=node.kind,
                    name=node.name,
                    health=NodeHealth(status=status, lastChecked=now, source=self.name),
                )
            )

        # Observe every internal edge; a downed source means no live traffic.
        down = {n.id for n in frag.nodes if n.health and n.health.status == "down"}
        for edge in graph.edges:
            if edge.source == edge.target:
                continue
            flowing = edge.source not in down
            frag.edges.append(
                GraphEdge(
                    id=edge.id,
                    source=edge.source,
                    target=edge.target,
                    protocol=edge.protocol,
                    confidence="observed",
                    lastSeen=now,
                    traffic=_traffic(rng, flowing),
                )
            )
        return frag

    def _next_status(
        self, node_id: str, rng: random.Random, flap: float, force_down: set[str]
    ) -> str:
        if node_id in force_down:
            self._health[node_id] = "down"
            return "down"
        current = self._health.get(node_id, "unknown")
        # First sighting always reports healthy; afterwards it may flap.
        if current == "unknown" or rng.random() < flap:
            current = _weighted_choice(rng, _TRANSITIONS[current]) if current != "unknown" else "healthy"
        self._health[node_id] = current
        return current


def _weighted_choice(rng: random.Random, choices: list[tuple[str, float]]) -> str:
    r = rng.random()
    acc = 0.0
    for value, weight in choices:
        acc += weight
        if r <= acc:
            return value
    return choices[-1][0]


def _traffic(rng: random.Random, flowing: bool) -> EdgeTraffic:
    if not flowing:
        return EdgeTraffic(requestsPerMin=0.0, p95LatencyMs=0.0, errorRate=0.0)
    return EdgeTraffic(
        requestsPerMin=round(rng.uniform(5, 400), 1),
        p95LatencyMs=round(rng.uniform(8, 250), 1),
        errorRate=round(rng.uniform(0, 0.04), 4),
    )
