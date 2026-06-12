/**
 * Systrum — normalized graph schema (shared contract)
 *
 * Documentation copy. The CANONICAL TypeScript contract the app imports lives at
 * `web/src/lib/graph-schema.ts`; the engine mirrors it in `engine/systrum/model.py`.
 * Keep all three in sync.
 */

// ─── Enumerations ────────────────────────────────────────────────────────────

/** What a node represents. Drives icon, shape, and semantic-zoom level. */
export type NodeKind =
  | "domain"     // a business grouping (storefront, payments, fulfillment…) — a "district"
  | "service"    // a logical microservice (may be >1 container)
  | "container"  // a running container
  | "datastore"  // database, cache
  | "queue"      // message broker / queue
  | "external"   // a system you don't own (a payment provider, an email API, a legacy ERP)
  | "endpoint"   // a single API route (revealed at deepest zoom)
  | "device";    // a physical/edge device or device-bound client

/** Architectural layer — used by the "Layer" grouping overlay. */
export type Layer =
  | "edge"         // proxies, gateways, internet-facing
  | "application"  // app/business services
  | "data"         // datastores, queues
  | "integration"  // bridges/collectors to external systems
  | "infra";       // observability, auth, shared platform

/** How two nodes communicate. Drives edge style + the protocol legend. */
export type Protocol =
  | "http"
  | "tcp"
  | "websocket"
  | "db"
  | "scrape"   // metrics/health polling
  | "proxy"    // pass-through reverse proxy
  | "queue"
  | "browser"; // headless-browser automation (e.g. scraping/credential capture)

/** Authentication on an edge. Drives the Security / Trust-Boundary overlay. */
export type AuthMechanism =
  | "none"          // ⚠ unauthenticated — flagged red in the security overlay
  | "api-key"
  | "proxy-key"     // X-Proxy-Key style
  | "jwt"
  | "bearer-token"  // upstream token (e.g. an injected, proxy-managed token)
  | "basic"
  | "oauth"
  | "device-id"     // device-level credential
  | "mtls";

/** Where a fact came from — the trust level of the data itself. */
export type Confidence =
  | "declared"   // parsed from compose/env — config says so
  | "observed"   // seen live via metrics/registry — it actually happens
  | "annotated"; // asserted by a human in topology.yml

export type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

// ─── Core entities ───────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;                 // stable & deterministic
  kind: NodeKind;
  name: string;
  domain?: string;            // business grouping (district)
  layer?: Layer;
  environment?: string;       // "production" | "staging" | …
  tech?: string[];            // ["python","fastapi"] — drives logo chips
  internetFacing?: boolean;   // flagged in the security overlay
  parentId?: string;          // for nesting (container → service → domain)
  health?: {
    status: HealthStatus;
    lastChecked?: string;     // ISO 8601
    source?: string;          // which provider reported it
  };
  links?: { label: string; href: string }[];  // deep-links to Datadog/Grafana/repo
  meta?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;                 // `${source}->${target}:${protocol}`
  source: string;
  target: string;
  protocol: Protocol;
  auth: AuthMechanism;
  confidence: Confidence;
  lastSeen?: string;          // ISO 8601 — undefined ⇒ never observed live
  label?: string;
  traffic?: {                 // populated by metrics providers
    requestsPerMin?: number;
    p95LatencyMs?: number;
    errorRate?: number;
  };
  meta?: Record<string, unknown>;  // e.g. { via: "STRIPE_API_BASE" }
}

/** What a single provider returns for one cycle. */
export interface GraphFragment {
  provider: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** The reconciled whole, served by GET /api/graph. */
export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  generatedAt: string;        // ISO 8601
  providers: string[];        // which providers contributed this cycle
}

// ─── Diffs (pushed over WebSocket) ───────────────────────────────────────────

export interface GraphDiff {
  at: string;
  nodesAdded: GraphNode[];
  nodesRemoved: string[];
  nodesChanged: { id: string; before: Partial<GraphNode>; after: Partial<GraphNode> }[];
  edgesAdded: GraphEdge[];
  edgesRemoved: string[];
  edgesChanged: { id: string; before: Partial<GraphEdge>; after: Partial<GraphEdge> }[];
}
