"""Prometheus provider — live health + traffic by scraping each service.

For every configured target it hits `{url}/health` (→ node health) and
`{url}/metrics` (→ traffic). Request rate and error rate are computed as deltas
between consecutive scrapes of the counter series exposed by
prometheus-fastapi-instrumentator, so the provider keeps the previous scrape
per node across cycles.

Config (systrum.yml):

    providers:
      prometheus:
        enabled: true
        interval_s: 15
        targets:
          - node: api-gateway
            url: http://api-gateway:8000
          - node: orders
            url: http://orders:8000

Traffic is attributed to the edges *into* a node (a service's incoming request
rate thickens its inbound edges). Prometheus sees server-side load, not which
upstream produced it, so this is a deliberate, documented approximation. Like
simulate/docker it enriches the known topology and needs `ctx.current_graph`.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timezone

import httpx

from ..model import EdgeTraffic, GraphEdge, GraphFragment, GraphNode, NodeHealth
from .base import Context

log = logging.getLogger("systrum.providers.prometheus")

_SKIP_KINDS = {"domain", "external"}
# Counter series we accept as "total requests", best first.
_COUNT_METRICS = ("http_requests_total", "http_request_duration_seconds_count")
_BUCKET_METRIC = "http_request_duration_seconds_bucket"
_LABEL_RE = re.compile(r'(\w+)="((?:[^"\\]|\\.)*)"')


class PrometheusProvider:
    name = "prometheus"
    kind = "live"
    interval_s = 15

    def __init__(self) -> None:
        # node id -> (monotonic_ts, total_requests, total_errors) from last scrape.
        self._last: dict[str, tuple[float, float, float]] = {}

    def discover(self, ctx: Context) -> GraphFragment:
        frag = GraphFragment(provider=self.name)
        graph = ctx.current_graph
        if graph is None:
            return frag

        cfg = ctx.config or {}
        targets = cfg.get("targets") or []
        nodes_by_id = {n.id: n for n in graph.nodes}
        now = datetime.now(timezone.utc).isoformat()

        traffic_by_node: dict[str, EdgeTraffic] = {}
        with httpx.Client(timeout=3.0) as client:
            for target in targets:
                node_id = target.get("node")
                base = (target.get("url") or "").rstrip("/")
                if not node_id or not base:
                    continue
                node = nodes_by_id.get(node_id)
                kind = node.kind if node else "service"
                if kind in _SKIP_KINDS:
                    continue

                status, meta = self._health(client, base)
                frag.nodes.append(
                    GraphNode(
                        id=node_id,
                        kind=kind,
                        name=node.name if node else node_id,
                        health=NodeHealth(status=status, lastChecked=now, source=self.name),
                        meta=meta,
                    )
                )
                traffic = self._traffic(client, base, node_id)
                if traffic is not None:
                    traffic_by_node[node_id] = traffic

        # Attribute each node's incoming rate to the edges that target it.
        for edge in graph.edges:
            if edge.source == edge.target:
                continue
            traffic = traffic_by_node.get(edge.target)
            if traffic is None:
                continue
            frag.edges.append(
                GraphEdge(
                    id=edge.id,
                    source=edge.source,
                    target=edge.target,
                    protocol=edge.protocol,
                    confidence="observed",
                    lastSeen=now,
                    traffic=traffic,
                )
            )
        return frag

    def _health(self, client: httpx.Client, base: str) -> tuple[str, dict]:
        meta: dict = {}
        try:
            resp = client.get(f"{base}/health")
            status = "healthy" if resp.is_success else "down"
        except httpx.HTTPError as exc:
            log.debug("health scrape failed for %s: %s", base, exc)
            return "down", meta
        # Build info (version / git sha) from an `*_build_info` gauge, if present.
        try:
            for name, labels, _ in _parse_metrics(client.get(f"{base}/metrics").text):
                if name.endswith("build_info"):
                    meta.update({k: v for k, v in labels.items() if k in ("version", "git_sha", "revision")})
                    break
        except httpx.HTTPError:
            pass
        return status, meta

    def _traffic(self, client: httpx.Client, base: str, node_id: str) -> EdgeTraffic | None:
        try:
            samples = _parse_metrics(client.get(f"{base}/metrics").text)
        except httpx.HTTPError as exc:
            log.debug("metrics scrape failed for %s: %s", base, exc)
            return None

        total = _sum_counter(samples, _COUNT_METRICS)
        errors = _sum_counter(samples, _COUNT_METRICS, only_5xx=True)
        if total is None:
            return None

        now = time.monotonic()
        prev = self._last.get(node_id)
        self._last[node_id] = (now, total, errors or 0.0)

        rpm = 0.0
        err_rate = 0.0
        if prev is not None:
            dt = max(now - prev[0], 1e-6)
            d_total = max(total - prev[1], 0.0)
            d_err = max((errors or 0.0) - prev[2], 0.0)
            rpm = round(d_total / dt * 60.0, 1)
            err_rate = round(d_err / d_total, 4) if d_total > 0 else 0.0

        return EdgeTraffic(
            requestsPerMin=rpm,
            p95LatencyMs=_p95_ms(samples),
            errorRate=err_rate,
        )


def _parse_metrics(text: str) -> list[tuple[str, dict[str, str], float]]:
    """Parse Prometheus text exposition into (name, labels, value) samples."""
    out: list[tuple[str, dict[str, str], float]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            if "{" in line:
                name, rest = line.split("{", 1)
                labelstr, valstr = rest.rsplit("}", 1)
                labels = {k: v for k, v in _LABEL_RE.findall(labelstr)}
                value = float(valstr.strip().split()[0])
            else:
                name, valstr = line.split(maxsplit=1)
                labels = {}
                value = float(valstr.split()[0])
            out.append((name.strip(), labels, value))
        except (ValueError, IndexError):
            continue
    return out


def _sum_counter(
    samples: list[tuple[str, dict[str, str], float]],
    names: tuple[str, ...],
    only_5xx: bool = False,
) -> float | None:
    """Sum the first counter series present in `names` (optionally only 5xx)."""
    for name in names:
        matched = [(lbl, val) for n, lbl, val in samples if n == name]
        if not matched:
            continue
        if only_5xx:
            return sum(
                val for lbl, val in matched
                if str(lbl.get("status") or lbl.get("status_code") or "").startswith("5")
            )
        return sum(val for _, val in matched)
    return None


def _p95_ms(samples: list[tuple[str, dict[str, str], float]]) -> float | None:
    """Approximate the 0.95 latency quantile from histogram buckets (seconds→ms)."""
    buckets: dict[float, float] = {}
    total = 0.0
    for name, lbl, val in samples:
        if name != _BUCKET_METRIC or "le" not in lbl:
            continue
        le = float("inf") if lbl["le"] in ("+Inf", "Inf") else float(lbl["le"])
        buckets[le] = buckets.get(le, 0.0) + val
        total = max(total, buckets[le])
    if not buckets or total <= 0:
        return None
    threshold = 0.95 * total
    for le in sorted(buckets):
        if buckets[le] >= threshold:
            return None if le == float("inf") else round(le * 1000.0, 1)
    return None
