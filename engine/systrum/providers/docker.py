"""Docker provider — live container truth from the Docker socket (read-only).

Talks to the Docker Engine API over the unix socket via httpx — no `docker` SDK
dependency and no writes. It overlays *observed* health onto the already-known
topology: each container is matched to a node (by its compose-service label or
container name) and escalates that node declared → observed, attaching real
state, uptime and restart count.

Config (systrum.yml):

    providers:
      docker:
        enabled: true
        socket: /var/run/docker.sock   # default
        interval_s: 5

Like simulate, it enriches existing nodes only — it never invents topology, so
it needs `ctx.current_graph` (the reconciled snapshot) to map containers onto
known nodes.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

from ..model import GraphFragment, GraphNode, NodeHealth
from .base import Context

log = logging.getLogger("systrum.providers.docker")

_DEFAULT_SOCKET = "/var/run/docker.sock"
_SKIP_KINDS = {"domain", "external"}


class DockerProvider:
    name = "docker"
    kind = "live"
    interval_s = 5

    def discover(self, ctx: Context) -> GraphFragment:
        frag = GraphFragment(provider=self.name)
        graph = ctx.current_graph
        if graph is None:
            return frag

        socket = (ctx.config or {}).get("socket", _DEFAULT_SOCKET)
        try:
            containers = self._list_containers(socket)
        except Exception as exc:  # noqa: BLE001 — a missing daemon is non-fatal
            log.warning("docker socket unreachable (%s): %s", socket, exc)
            return frag

        # Index containers by every name we might match a node on (lowercased).
        by_key: dict[str, dict] = {}
        for c in containers:
            for key in self._keys(c):
                by_key.setdefault(key, c)

        now = datetime.now(timezone.utc).isoformat()
        for node in graph.nodes:
            if node.kind in _SKIP_KINDS:
                continue
            info = by_key.get(node.id.lower()) or by_key.get(node.name.lower())
            if info is None:
                continue
            status, meta = self._health(info)
            frag.nodes.append(
                GraphNode(
                    id=node.id,
                    kind=node.kind,
                    name=node.name,
                    health=NodeHealth(status=status, lastChecked=now, source=self.name),
                    meta=meta,
                )
            )
        return frag

    def _list_containers(self, socket: str) -> list[dict]:
        transport = httpx.HTTPTransport(uds=socket)
        with httpx.Client(transport=transport, base_url="http://docker", timeout=3.0) as client:
            resp = client.get("/containers/json", params={"all": "true"})
            resp.raise_for_status()
            out: list[dict] = []
            for summary in resp.json():
                cid = summary.get("Id")
                try:
                    out.append(client.get(f"/containers/{cid}/json").json())
                except Exception:  # noqa: BLE001 — fall back to the summary form
                    out.append(summary)
            return out

    @staticmethod
    def _keys(c: dict) -> list[str]:
        keys: list[str] = []
        labels = (c.get("Config", {}) or {}).get("Labels") or c.get("Labels") or {}
        svc = labels.get("com.docker.compose.service")
        if svc:
            keys.append(str(svc).lower())
        names = c.get("Names") or ([c["Name"]] if c.get("Name") else [])
        keys.extend(str(n).lstrip("/").lower() for n in names)
        return keys

    @staticmethod
    def _health(c: dict) -> tuple[str, dict]:
        state = c.get("State")
        if isinstance(state, dict):  # detailed /json form
            running = bool(state.get("Running"))
            health = (state.get("Health") or {}).get("Status")  # healthy|unhealthy|starting
            started = state.get("StartedAt")
            state_label = state.get("Status")
        else:  # summary form: State is a string like "running"
            running = state == "running"
            health = None
            started = None
            state_label = state

        if health == "healthy":
            status = "healthy"
        elif health == "unhealthy":
            status = "down"
        elif health == "starting":
            status = "degraded"
        else:  # no healthcheck — fall back to liveness
            status = "healthy" if running else "down"

        meta = {
            "dockerState": state_label,
            "restartCount": c.get("RestartCount", 0),
            "startedAt": started,
        }
        return status, meta
