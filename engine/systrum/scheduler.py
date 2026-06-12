"""Discovery scheduler.

Phase 1 only ever runs a single pass (`scan_once`). The async interval loop is
stubbed here so the Phase 2 live providers (Docker, Prometheus) slot in without
reshaping the engine — each live provider gets its own jittered loop.
"""

from __future__ import annotations

import asyncio
import logging

from .config import Config
from .discovery import run_discovery
from .model import Graph
from .store import GraphStore

log = logging.getLogger("systrum.scheduler")


def scan_once(config: Config, store: GraphStore) -> Graph:
    """Run all providers a single time and persist the reconciled snapshot."""
    graph = run_discovery(config)
    store.save(graph)
    log.info(
        "scan complete: %d nodes, %d edges (providers: %s)",
        len(graph.nodes),
        len(graph.edges),
        ", ".join(graph.providers),
    )
    return graph


async def run_periodic(config: Config, store: GraphStore, interval_s: int = 60) -> None:
    """Phase 2+: keep re-scanning on an interval. Not started in Phase 1."""
    while True:
        try:
            scan_once(config, store)
        except Exception:  # noqa: BLE001 — a bad cycle must not kill the loop
            log.exception("scheduled scan failed")
        await asyncio.sleep(interval_s)
