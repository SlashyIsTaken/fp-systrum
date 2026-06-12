# Flarepoint Systrum

> 🚧 **In development** <br>
> Systrum is in the design phase. This repository
> currently holds the architecture and design docs, not a working build yet.
> APIs, schema, and scope may change. Star/watch to follow along.

**Systrum is a self-updating map of your software architecture.**

Point it at your repos and your running stack. It discovers your services,
containers, databases, queues and external integrations, works out how they
connect, and renders the whole thing as an interactive, continuously-synced
"Google Maps for microservices" with live health, traffic, and **security
trust-boundary** overlays.

No sidecars, no service mesh, no eBPF, no manually-maintained diagrams that rot
the day after you draw them. Systrum reads the artifacts you *already* maintain — such as Docker Compose files, environment config, Prometheus endpoints, OpenAPI
schemas — and reconciles them into one graph you can trust.

## Why this exists

Architecture diagrams are wrong the moment they're saved. Observability
platforms (Datadog, Grafana, Jaeger) show you *metrics and traces* but not an
intuitive, curated **map** of how the system is wired — and they require heavy
instrumentation to draw dependency graphs at all. Diagramming tools
(Lucidchart, draw.io, Mermaid) are beautiful but entirely manual.

There's a gap in the middle:

> **automated discovery · live topology · trustworthy reconciliation · a genuinely
> beautiful, curated UI**

All in 1 tool. Systrum fills it.

## What makes it different

| | Diagram tools | Observability (APM) | **Systrum** |
|---|:---:|:---:|:---:|
| Auto-discovers topology | ✗ | ~ (needs tracing) | ✓ |
| Requires instrumentation | ✗ | ✓ heavy | ✗ |
| Stays in sync with reality | ✗ | ✓ | ✓ |
| Curated, branded, intuitive UI | ✓ | ~ | ✓ |
| Hand-annotations + auto-discovery reconciled | ✗ | ✗ | ✓ |
| Security / auth-boundary as a first-class view | ✗ | ✗ | ✓ |
| Self-hostable & open source | ~ | ✗ | ✓ |

## Key capabilities

- **Provider-based discovery** — pluggable sources (Compose, Docker, Env,
  Prometheus, OpenAPI, service registries). Ship more by writing a plugin.
- **Static + live reconciliation** — every edge carries a *confidence*
  (`declared` vs `observed`) and a *last-seen* timestamp. You see not just what
  *should* connect, but what actually *is* connecting right now.
- **The "Google Maps" experience** — pan/zoom, minimap, search, and **semantic
  zoom**: zoom out for business domains, in for services, further for
  containers and individual API endpoints.
- **Layered overlays** — toggle Health, Traffic, Environment, Domain, and a
  **Security / Trust-Boundary** overlay that colors every edge by its
  authentication strength and flags every internet-facing surface.
- **Annotation layer** — a `topology.yml` to declare what discovery can't infer
  (external systems, business domains) and correct any mislabels. Auto-discovery
  proposes; your annotations decide.
- **Continuous sync** — pollers re-run on an interval, diff the graph, and push
  changes to the UI over WebSocket, with a "what changed" activity feed.

## How it works (60-second version)

```
  repos & running stack                 Systrum engine                   browser
 ┌─────────────────────┐        ┌──────────────────────────┐        ┌──────────────┐
 │ docker-compose.yml  │──┐     │  Providers               │        │  React Flow  │
 │ .env / environment  │  ├───▶│   Compose / Env / Docker │        │  dark canvas │
 │ /metrics  /health   │  │     │   Prometheus / OpenAPI   │──┐     │  semantic    │
 │ /openapi.json       │  │     │   Registry               │  │     │  zoom +      │
 │ service registry    │──┘     ├──────────────────────────┤  ├───▶│  overlays    │
 │ topology.yml (hand) │──────▶│  Normalized graph model  │  │     │              │
 └─────────────────────┘        │  + reconciliation engine │WS│     └──────────────┘
                                └──────────────────────────┘──┘    live diffs pushed
```

The architecture is **already self-describing** — the dependency information
lives in config you maintain anyway. Systrum's job is to read it, reconcile it,
and make it beautiful.

## Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system design, components, data flow, tech stack
- [`docs/DISCOVERY.md`](./docs/DISCOVERY.md) — the provider model, the env-heuristic, reconciliation rules
- [`docs/VISUALIZATION.md`](./docs/VISUALIZATION.md) — the dark-dashboard UI, semantic zoom, overlays
- [`docs/SECURITY-OVERLAY.md`](./docs/SECURITY-OVERLAY.md) — the trust-boundary view
- [`docs/CONFIG.md`](./docs/CONFIG.md) — `systrum.yml` config + `topology.yml` annotation schema
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — phased development plan

All examples use a neutral demo stack (a small online-shop platform). Real
deployments are described with private **presets** that live outside this repo.

## Status

📐 **Design phase.** This repository currently contains the architecture and
design documentation. Implementation begins at Phase 1 (see the roadmap).

## License

[MIT](./LICENSE).
