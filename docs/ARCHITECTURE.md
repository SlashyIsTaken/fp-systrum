# Architecture

Systrum is three things: a **discovery engine** that emits a normalized graph, a
**reconciliation core** that merges static and live sources into one trustworthy
model, and a **visualization app** that renders it as an interactive map.

```
                          ┌────────────────────────────────────────────────┐
                          │                  SYSTRUM ENGINE                │
                          │                                                │
  ┌───────────────┐       │   ┌────────────┐      ┌──────────────────┐     │
  │  Providers    │       │   │ Providers  │      │  Reconciliation  │     │
  │  (plugins)    │─────────▶│ run on a   │────▶│  core            │     │
  │               │       │   │ schedule   │      │  (merge + diff)  │     │
  │ compose       │       │   └────────────┘      └────────┬─────────┘     │
  │ env           │       │                                │               │
  │ docker        │       │                                ▼               │
  │ prometheus    │       │                       ┌──────────────────┐     │
  │ openapi       │       │                       │  Graph store     │     │
  │ registry      │       │                       │  (SQLite + JSON  │     │
  │ annotations   │       │                       │   snapshots)     │     │
  └───────────────┘       │                       └────────┬─────────┘     │
                          │                                │               │
                          │   ┌────────────────────────────┴───────────┐   │
                          │   │  HTTP API  +  WebSocket (live diffs)   │   │
                          │   └────────────────────────────┬───────────┘   │
                          └────────────────────────────────┼───────────────┘
                                                           │
                                                           ▼
                                              ┌───────────────────────────┐
                                              │  Web app (Next.js)        │
                                              │  React Flow dark canvas   │
                                              │  semantic zoom + overlays │
                                              └───────────────────────────┘
```

## Core principle: the architecture is already self-describing

Systrum's central bet is that you do **not** need to instrument anything to draw
an accurate map. The dependency graph already exists, scattered across artifacts
every team maintains anyway:

| Artifact | Nodes it reveals | Edges it reveals |
|---|---|---|
| `docker-compose.yml` | containers, images, ports, volumes, networks | container ↔ container (via `depends_on`, shared networks) |
| `.env` / `environment:` | — | **upstream URLs** (`GATEWAY_URL`, `STRIPE_API_BASE`, `ERP_HOST`) |
| `/health`, `/metrics` | live node status | request counts / latency between instrumented services |
| `/openapi.json` | API endpoints per service | — |
| service registry (e.g. an `api_clients` table) | authorized clients/services | who-talks-to-the-hub, with auth method + last-seen |
| `topology.yml` (hand-written) | external systems, domains | anything discovery can't infer |

The engine reads these, normalizes them, and reconciles. Everything else is
presentation.

## The normalized graph model

Every provider, no matter how exotic its source, emits the same two primitives.
(Full schema with types in [`graph-schema.ts`](./graph-schema.ts).)

### Node

```jsonc
{
  "id": "payments-proxy",           // stable, deterministic
  "kind": "service",                // domain | service | container | datastore
                                    //   | queue | external | endpoint | device
  "name": "Payments Proxy",
  "domain": "payments",             // business grouping
  "layer": "edge",                  // edge | application | data | integration | infra
  "environment": "production",      // for env filtering
  "tech": ["python", "fastapi"],
  "internetFacing": false,
  "meta": { "ports": ["8001:8001"], "image": "payments-proxy:latest", "repo": "payments-proxy" }
}
```

### Edge

```jsonc
{
  "source": "payments-proxy",
  "target": "stripe",               // an "external" node
  "protocol": "http",               // http | tcp | websocket | db | scrape | proxy | queue | browser
  "auth": "bearer-token",           // none | api-key | proxy-key | jwt | basic | mtls | oauth | device-id | bearer-token
  "confidence": "declared",         // declared | observed | annotated
  "lastSeen": "2026-06-12T09:14:00Z",
  "meta": { "via": "STRIPE_API_BASE", "direction": "outbound" }
}
```

The two fields that make the model *trustworthy*:

- **`confidence`** — `declared` (read from compose/env), `observed` (seen live via
  metrics/registry), or `annotated` (you asserted it by hand). The UI renders
  declared-but-never-observed edges differently from live ones, so you can spot
  dead config and undocumented-but-real traffic.
- **`lastSeen`** — turns a static diagram into a living one and powers the change feed.

## Components

### 1. Providers (plugins)

A provider is a small unit with one job: look at one kind of source and emit a
**graph fragment** (a partial set of nodes + edges). They never see each other;
the core merges their output. This is what makes Systrum both *universal*
(anyone writes a provider for Kubernetes, Consul, AWS…) and *specific*
(a preset wires up exactly your stack). Provider contract and the built-in set
are documented in [`DISCOVERY.md`](./DISCOVERY.md).

### 2. Reconciliation core

Merges all fragments into one graph each cycle and diffs against the previous
snapshot:

- **Node identity** — nodes merge on a deterministic `id` (e.g. compose service
  name, container name, or annotated id). Multiple providers enriching the same
  node combine their `meta`/`tech`/status.
- **Edge identity** — keyed on `(source, target, protocol)`. When two providers
  report the same edge, **confidence escalates**: a `declared` edge that a live
  provider also observes becomes `observed`, with `lastSeen` updated.
- **Annotations win** — anything in `topology.yml` overrides discovered labels,
  domains, and layers, and can assert edges/nodes outright.
- **Diff** — added/removed/changed nodes and edges, plus status flips
  (healthy→down) and confidence changes (declared→observed). The diff is the
  payload pushed to the UI and recorded in the activity feed.

### 3. Graph store

Deliberately boring: current graph as a JSON snapshot, history in **SQLite**
(swap for TimescaleDB later if you want long-horizon topology history). No graph
database needed at this scale (~30 containers / ~15 services is tiny).

### 4. API + WebSocket

- `GET /api/graph` — current reconciled graph
- `GET /api/graph/diff?since=…` — changes since a timestamp
- `GET /api/nodes/:id` — node detail (endpoints, env, health history)
- `WS /ws` — pushes reconciliation diffs as they happen

### 5. Web app

Next.js + React + React Flow. Covered in [`VISUALIZATION.md`](./VISUALIZATION.md).

## Tech stack

Chosen to be mainstream and approachable for contributors, while matching the
shape of a typical Python web backend.

| Layer | Choice | Why |
|---|---|---|
| Engine | **Python 3.12 + FastAPI** | ubiquitous; async polling loops are a natural fit for scheduled discovery |
| Scheduling | asyncio background loops | one loop per live provider, jittered intervals |
| Graph store | **SQLite** (→ optional TimescaleDB) | zero-ops; history without a graph DB |
| Web | **Next.js 15 + React 19** | modern, well-supported, easy to self-host |
| Graph render | **React Flow (xyflow) + elkjs** | custom React node cards, group nodes, minimap, semantic zoom |
| Realtime | **WebSocket** | push reconciliation diffs to the UI |
| Packaging | **Docker + compose** | one-command self-host |

## Deployment shape

Ships as a single `docker-compose.yml`: `engine` (FastAPI) + `web` (Next.js) +
`db` (SQLite volume, or point at Postgres/Timescale). Read-only by design — it
*observes*, it doesn't control. It needs read access to: the repo files you
mount, the Docker socket (optional, for live container state), and the HTTP
endpoints / registry you point it at.

## Non-goals

- Not an APM. It won't replace Datadog/Grafana — it *links out* to them per node.
- Not a control plane. It never mutates your services.
- Not a tracing system. It infers edges from config and coarse metrics, not
  per-request spans (though a trace-based provider could be added later).
