"""WebSocket fan-out — pushes reconciliation diffs to every connected client."""

from __future__ import annotations

import asyncio
import logging

from fastapi import WebSocket

from .model import GraphDiff

log = logging.getLogger("systrum.ws")


class ConnectionManager:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)
        log.info("ws client connected (%d total)", len(self._clients))

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)
        log.info("ws client disconnected (%d total)", len(self._clients))

    async def broadcast(self, diff: GraphDiff) -> None:
        if not self._clients:
            return
        payload = diff.model_dump(mode="json")
        async with self._lock:
            clients = list(self._clients)
        stale: list[WebSocket] = []
        for ws in clients:
            try:
                await ws.send_json({"type": "diff", "diff": payload})
            except Exception:  # noqa: BLE001 — a dead socket shouldn't break the others
                stale.append(ws)
        if stale:
            async with self._lock:
                for ws in stale:
                    self._clients.discard(ws)
