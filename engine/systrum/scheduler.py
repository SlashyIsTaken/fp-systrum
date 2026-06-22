"""Discovery scheduler.

Phase 1 ran a single pass. Phase 2 polls the *live* providers continuously, each
on its **own interval**, and pushes what changed to a broadcaster (the WebSocket
layer).

Static providers (compose/env/annotations) are cheap, idempotent file reads, so
every reconcile re-runs them fresh — that keeps the topology current and means a
manual re-scan or an edited compose file is picked up automatically. Live
providers (simulate, later docker/prometheus) are the ones with independent
cadences: each gets its own loop and its latest fragment is cached between polls.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Awaitable, Callable

from .config import Config
from .diff import diff_graphs
from .discovery import build_providers, make_context, run_discovery
from .model import Graph, GraphDiff, GraphFragment
from .providers.annotations import load_annotations
from .providers.base import Provider
from .reconcile import reconcile
from .store import GraphStore

log = logging.getLogger("systrum.scheduler")

Broadcaster = Callable[[GraphDiff], Awaitable[None]]


@dataclass
class _LiveCache:
    """Latest fragment per live provider, guarded so loops can't interleave."""

    fragments: dict[str, GraphFragment] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


def scan_once(
    config: Config,
    store: GraphStore,
    providers: list[Provider] | None = None,
) -> Graph:
    """Run all providers a single time and persist the snapshot (one-shot)."""
    graph = run_discovery(config, current_graph=store.latest(), providers=providers)
    store.save(graph)
    log.info(
        "scan complete: %d nodes, %d edges (providers: %s)",
        len(graph.nodes),
        len(graph.edges),
        ", ".join(graph.providers),
    )
    return graph


def run_cycle(
    config: Config,
    store: GraphStore,
    providers: list[Provider],
) -> tuple[Graph, GraphDiff]:
    """One discovery cycle: discover → diff vs latest → persist if changed."""
    previous = store.latest()
    graph = run_discovery(config, current_graph=previous, providers=providers)
    diff = diff_graphs(previous, graph)
    if not diff.is_empty():
        store.save(graph)
    return graph, diff


def _provider_interval(provider: Provider, config: Config, default: int) -> int:
    """Poll cadence for a live provider: provider config wins, then a class
    default (`interval_s`), then the global scheduler interval."""
    cfg = config.provider_config(provider.name)
    if cfg.get("interval_s") is not None:
        return int(cfg["interval_s"])
    return int(getattr(provider, "interval_s", default))


def _reconcile_live(
    config: Config, cache: _LiveCache, providers: list[Provider], current_graph: Graph | None
) -> Graph:
    """Reconcile fresh static fragments + the cached live fragments, in provider
    order so live observations escalate the declared topology."""
    ann = load_annotations(config.annotations_file)
    fragments: list[GraphFragment] = []
    for p in providers:
        if p.kind == "static":
            fragments.append(p.discover(make_context(config, p.name, current_graph)))
        elif p.name in cache.fragments:
            fragments.append(cache.fragments[p.name])
    return reconcile(fragments, ann, [p.name for p in providers])


async def _live_loop(
    provider: Provider,
    config: Config,
    store: GraphStore,
    cache: _LiveCache,
    providers: list[Provider],
    broadcast: Broadcaster,
    interval_s: int,
) -> None:
    """Poll one live provider forever, reconciling + broadcasting its changes."""
    log.info("live provider '%s' polling every %ss", provider.name, interval_s)
    while True:
        await asyncio.sleep(interval_s)
        try:
            # discover() is sync and may do I/O (socket/HTTP) — keep it off the loop.
            frag = await asyncio.to_thread(
                provider.discover, make_context(config, provider.name, store.latest())
            )
            async with cache.lock:
                cache.fragments[provider.name] = frag
                graph = _reconcile_live(config, cache, providers, store.latest())
                diff = diff_graphs(store.latest(), graph)
                if not diff.is_empty():
                    store.save(graph)
            if not diff.is_empty():
                log.info(
                    "diff [%s]: %dn/%de changed, +%dn/-%dn +%de/-%de",
                    provider.name,
                    len(diff.nodesChanged), len(diff.edgesChanged),
                    len(diff.nodesAdded), len(diff.nodesRemoved),
                    len(diff.edgesAdded), len(diff.edgesRemoved),
                )
                await broadcast(diff)
        except Exception:  # noqa: BLE001 — a bad poll must not kill the loop
            log.exception("live provider '%s' poll failed", provider.name)


async def run_periodic(
    config: Config,
    store: GraphStore,
    broadcast: Broadcaster,
    interval_s: int = 30,
    providers: list[Provider] | None = None,
) -> None:
    """Seed the live cache once, then run one loop per live provider — each on
    its own interval — until cancelled."""
    if providers is None:
        providers = build_providers(config)
    live = [p for p in providers if p.kind != "static"]

    cache = _LiveCache()
    current = store.latest()
    for p in live:
        cache.fragments[p.name] = p.discover(make_context(config, p.name, current))
    graph = _reconcile_live(config, cache, providers, current)
    diff = diff_graphs(store.latest(), graph)
    if not diff.is_empty():
        store.save(graph)
        await broadcast(diff)

    if not live:
        log.info("no live providers; scheduler idle")
        return

    log.info("scheduler started: live providers=%s", ", ".join(p.name for p in live))
    tasks = [
        asyncio.create_task(
            _live_loop(
                p, config, store, cache, providers, broadcast,
                _provider_interval(p, config, interval_s),
            )
        )
        for p in live
    ]
    try:
        await asyncio.gather(*tasks)
    except asyncio.CancelledError:
        for t in tasks:
            t.cancel()
        raise
