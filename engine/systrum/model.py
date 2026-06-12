"""The normalized graph model.

Pydantic mirror of `web/src/lib/graph-schema.ts` — keep the two in sync. Field
names are deliberately camelCase to match the wire/JSON contract the web app
consumes (FastAPI serializes these models verbatim).
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

# ─── Enumerations (mirror graph-schema.ts) ──────────────────────────────────

NodeKind = Literal[
    "domain", "service", "container", "datastore", "queue", "external", "endpoint", "device"
]
Layer = Literal["edge", "application", "data", "integration", "infra"]
Protocol = Literal["http", "tcp", "websocket", "db", "scrape", "proxy", "queue", "browser"]
AuthMechanism = Literal[
    "none", "api-key", "proxy-key", "jwt", "bearer-token", "basic", "oauth", "device-id", "mtls"
]
Confidence = Literal["declared", "observed", "annotated"]
HealthStatus = Literal["healthy", "degraded", "down", "unknown"]


class NodeHealth(BaseModel):
    status: HealthStatus = "unknown"
    lastChecked: Optional[str] = None
    source: Optional[str] = None


class NodeLink(BaseModel):
    label: str
    href: str


class GraphNode(BaseModel):
    id: str
    kind: NodeKind
    name: str
    domain: Optional[str] = None
    layer: Optional[Layer] = None
    environment: Optional[str] = None
    tech: list[str] = Field(default_factory=list)
    internetFacing: bool = False
    parentId: Optional[str] = None
    health: Optional[NodeHealth] = None
    links: list[NodeLink] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)


class EdgeTraffic(BaseModel):
    requestsPerMin: Optional[float] = None
    p95LatencyMs: Optional[float] = None
    errorRate: Optional[float] = None


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    protocol: Protocol
    auth: AuthMechanism = "none"
    confidence: Confidence = "declared"
    lastSeen: Optional[str] = None
    label: Optional[str] = None
    traffic: Optional[EdgeTraffic] = None
    meta: dict[str, Any] = Field(default_factory=dict)

    @staticmethod
    def make_id(source: str, target: str, protocol: str) -> str:
        return f"{source}->{target}:{protocol}"


class Graph(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    generatedAt: Optional[str] = None
    providers: list[str] = Field(default_factory=list)


class GraphFragment(BaseModel):
    """What a single provider returns for one discovery cycle."""

    provider: str
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
