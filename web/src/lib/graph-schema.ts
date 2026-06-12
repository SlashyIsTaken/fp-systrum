/**
 * Systrum — normalized graph schema (shared contract).
 *
 * CANONICAL copy. The engine mirrors this in Pydantic (engine/systrum/model.py),
 * and docs/graph-schema.ts is a documentation duplicate — keep all three in sync.
 */

export type NodeKind =
  | "domain"
  | "service"
  | "container"
  | "datastore"
  | "queue"
  | "external"
  | "endpoint"
  | "device";

export type Layer = "edge" | "application" | "data" | "integration" | "infra";

export type Protocol =
  | "http"
  | "tcp"
  | "websocket"
  | "db"
  | "scrape"
  | "proxy"
  | "queue"
  | "browser";

export type AuthMechanism =
  | "none"
  | "api-key"
  | "proxy-key"
  | "jwt"
  | "bearer-token"
  | "basic"
  | "oauth"
  | "device-id"
  | "mtls";

export type Confidence = "declared" | "observed" | "annotated";

export type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  domain?: string;
  layer?: Layer;
  environment?: string;
  tech?: string[];
  internetFacing?: boolean;
  parentId?: string;
  health?: { status: HealthStatus; lastChecked?: string; source?: string };
  links?: { label: string; href: string }[];
  meta?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  protocol: Protocol;
  auth: AuthMechanism;
  confidence: Confidence;
  lastSeen?: string;
  label?: string;
  traffic?: { requestsPerMin?: number; p95LatencyMs?: number; errorRate?: number };
  meta?: Record<string, unknown>;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  generatedAt?: string;
  providers?: string[];
}

export interface GraphDiff {
  at: string;
  nodesAdded: GraphNode[];
  nodesRemoved: string[];
  nodesChanged: { id: string; before: Partial<GraphNode>; after: Partial<GraphNode> }[];
  edgesAdded: GraphEdge[];
  edgesRemoved: string[];
  edgesChanged: { id: string; before: Partial<GraphEdge>; after: Partial<GraphEdge> }[];
}
