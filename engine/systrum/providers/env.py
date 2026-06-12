"""Env-heuristic provider — infer dependency edges (and their auth) from config.

The bet: env var *values* that look like upstreams name the dependency, and env
*key names* reveal how that hop is authenticated. No instrumentation required.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from ..model import GraphEdge, GraphFragment
from .base import Context

_UPSTREAM_SUFFIXES = ("_URL", "_HOST", "_BASE", "_ENDPOINT", "_DSN", "_URI")
_CREDS_RE = re.compile(r"://[^/@\s]+:[^/@\s]+@")


class EnvProvider:
    name = "env"
    kind = "static"

    def discover(self, ctx: Context) -> GraphFragment:
        frag = GraphFragment(provider=self.name)
        cfg = ctx.config or {}
        targets: dict[str, str] = cfg.get("targets", {}) or {}
        auth_keys: dict[str, str] = cfg.get("auth_keys", {}) or {}

        for repo in ctx.repo_paths:
            repo_path = Path(repo)
            env = _read_env(repo_path)
            if not env:
                continue
            source = repo_path.name  # assumes dir name == compose service id

            for var, value in env.items():
                target = targets.get(var)
                if not target or not _looks_upstream(var):
                    continue
                protocol = _protocol(var, value)
                auth = _resolve_auth(var, value, protocol, env, auth_keys)
                frag.edges.append(
                    GraphEdge(
                        id=GraphEdge.make_id(source, target, protocol),
                        source=source,
                        target=target,
                        protocol=protocol,
                        auth=auth,
                        confidence="declared",
                        meta={"via": var, "direction": "outbound"},
                    )
                )
        return frag


def _read_env(repo: Path) -> dict[str, str]:
    """Prefer .env.example (committed); overlay .env if present locally."""
    env: dict[str, str] = {}
    for fname in (".env.example", ".env"):
        f = repo / fname
        if f.is_file():
            env.update(_parse_env(f.read_text(errors="ignore")))
    return env


def _parse_env(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        out[key.strip()] = val.strip().strip('"').strip("'")
    return out


def _looks_upstream(var: str) -> bool:
    return any(var.endswith(s) for s in _UPSTREAM_SUFFIXES)


def _protocol(key: str, value: str) -> str:
    v = value.strip().lower()
    if v.startswith(("postgres://", "postgresql://", "mysql://", "mariadb://", "mongodb://", "redis://")):
        return "db"
    if v.startswith(("amqp://", "kafka://", "nats://")):
        return "queue"
    if v.startswith(("ws://", "wss://")):
        return "websocket"
    if v.startswith(("http://", "https://")):
        return "http"
    if key.endswith(("_DSN", "_URI")):
        return "db"
    if key.endswith("_HOST"):
        return "tcp"
    return "http"


def _resolve_auth(
    var: str, value: str, protocol: str, env: dict[str, str], auth_keys: dict[str, str]
) -> str:
    # Datastore / queue hops: credentials (if any) ride in the DSN.
    if protocol in ("db", "queue"):
        return "basic" if _CREDS_RE.search(value) else "none"

    # HTTP/TCP/WS upstream: read the *key names* to find the auth mechanism.
    prefix = var
    for suffix in _UPSTREAM_SUFFIXES:
        if prefix.endswith(suffix):
            prefix = prefix[: -len(suffix)]
            break

    sibling = f"{prefix}_API_KEY"
    if sibling in env:
        return auth_keys.get(sibling, "api-key")

    # Any explicitly-mapped auth key present in this service's env.
    for key in env:
        if key in auth_keys:
            return auth_keys[key]

    # Generic shared-secret fallback.
    if any(k.endswith(("_API_KEY", "_APIKEY")) for k in env):
        return "api-key"
    return "none"
