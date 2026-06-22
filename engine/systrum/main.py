"""FastAPI app — serves the reconciled graph and live diffs to the web UI."""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import load_config
from .diff import diff_graphs
from .discovery import build_providers
from .model import Graph, GraphDiff
from .scheduler import run_cycle, run_periodic, scan_once
from .store import GraphStore
from .ws import ConnectionManager

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("systrum")

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_CONFIG = _REPO_ROOT / "examples" / "demo-shop" / "systrum.yml"

CONFIG_PATH = os.getenv("SYSTRUM_CONFIG", str(_DEFAULT_CONFIG))
DB_PATH = os.getenv("SYSTRUM_DB", "data/systrum.sqlite")
ALLOWED_ORIGINS = os.getenv(
    "SYSTRUM_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

config = load_config(CONFIG_PATH)
store = GraphStore(DB_PATH)
# Build providers once so live (stateful) providers persist across cycles.
providers = build_providers(config)
manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        scan_once(config, store, providers)
    except Exception:  # noqa: BLE001 — server should still boot to surface the error
        log.exception("initial scan failed; /api/graph will 503 until a successful scan")

    task: asyncio.Task | None = None
    if config.has_live_provider:
        task = asyncio.create_task(
            run_periodic(config, store, manager.broadcast, config.scheduler_interval, providers)
        )
    try:
        yield
    finally:
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass


app = FastAPI(title="Systrum", version=__version__, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@app.get("/api/graph", response_model=Graph)
def get_graph() -> Graph:
    graph = store.latest()
    if graph is None:
        graph = scan_once(config, store, providers)
    return graph


@app.get("/api/graph/diff", response_model=GraphDiff)
def get_diff() -> GraphDiff:
    """Diff between the two most recent snapshots (the last recorded change)."""
    latest = store.latest()
    if latest is None:
        latest = scan_once(config, store, providers)
    return diff_graphs(store.previous(), latest)


@app.post("/api/scan", response_model=Graph)
async def rescan() -> Graph:
    graph, diff = run_cycle(config, store, providers)
    if not diff.is_empty():
        await manager.broadcast(diff)
    return graph


@app.get("/api/nodes/{node_id}")
def node_detail(node_id: str):
    graph = store.latest() or scan_once(config, store, providers)
    node = next((n for n in graph.nodes if n.id == node_id), None)
    if node is None:
        raise HTTPException(status_code=404, detail=f"node not found: {node_id}")
    related = [e for e in graph.edges if node_id in (e.source, e.target)]
    return {"node": node, "edges": related}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await manager.connect(ws)
    try:
        while True:
            # We don't expect client messages; this keeps the socket open and
            # detects disconnects.
            await ws.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(ws)
    except Exception:  # noqa: BLE001
        await manager.disconnect(ws)
