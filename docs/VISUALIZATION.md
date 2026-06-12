# Visualization — the "Google Maps for services" UI

The visualization is the reason Systrum exists as a separate tool rather than a
Grafana panel. The goal: a map so intuitive that a developer, an architect, an
operator, **or a skeptical stakeholder** understands the system in thirty
seconds.

Design direction: **modern dark dashboard** — looks like a premium observability
product.

## Rendering stack

- **React Flow (xyflow)** — custom React components as nodes (so each node is a
  rich card, not a circle), group/parent nodes for domains, built-in minimap,
  pan/zoom, and edge routing. Ideal at this scale (~30 containers is *small*).
- **elkjs** — automatic layered layout, so the map arranges itself from the
  discovered graph (no manual placement), with per-domain sub-layouts.
- **Framer Motion** — edge-flow animation, node enter/exit, overlay transitions.

## The Google-Maps metaphor, made literal

### Semantic zoom (the signature feature)
The map shows different detail at different zoom levels — exactly like roads
appear only when you zoom into a city.

| Zoom | You see | Maps analogy |
|---|---|---|
| **Far** | Business **domains** as districts (Storefront, Payments, Fulfillment…), thick inter-domain flows | country / region |
| **Mid** | Individual **services** with health badges + tech chips | cities & highways |
| **Near** | **Containers**, ports, datastores, queues | streets |
| **Closest** | Individual **API endpoints** (`/openapi.json`) on a service | building entrances |

Implemented via React Flow's `zoom`-driven conditional rendering + node
collapsing: domain group nodes expand into their children past a zoom threshold.

### Map-like controls
- **Pan / zoom / minimap** — React Flow built-ins, themed dark.
- **Search & locate** — `⌘K` to jump to any service; the map flies to it
  (animated pan/zoom), like searching an address.
- **Layer toggles** — a control like Google Maps' map-type switch, but for
  overlays (below).
- **Fit / reset / fullscreen** — present-mode for demos (chrome hidden, big
  canvas).

## Overlays (toggleable layers)

Each overlay re-skins the *same* graph to answer a different question.

| Overlay | What it shows | Encoding |
|---|---|---|
| **Health** | who's up | node glow: green/amber/red/grey; down nodes pulse |
| **Traffic** | what's busy | edge thickness ∝ req/min; animated flow particles on active edges; idle edges dimmed |
| **Confidence** | config vs reality | solid = `observed` live, dashed = `declared`-only (configured but never seen), dotted = `annotated` |
| **Environment** | prod/staging | non-selected environment faded |
| **Domain** | business grouping | district background tints + hulls |
| **Layer** | edge/app/data/infra | horizontal bands |
| **Security** | trust boundaries | edges colored by `auth`; internet-facing nodes ringed — see [`SECURITY-OVERLAY.md`](./SECURITY-OVERLAY.md) |

Overlays compose (e.g. Health + Traffic together). State lives in the URL so a
view is shareable/bookmarkable — paste a link, land on the exact same map.

## Node cards (custom React Flow nodes)

A service node is a small card, not a dot:

```
┌──────────────────────────────────┐
│ ●  Payments Proxy                │   ● health dot (green)
│    payments · edge               │   domain · layer
│    FastAPI                       │   tech chips
│    :8001            ↑12/min      │   port · live traffic
└──────────────────────────────────┘
   ⌄ expands → endpoints, env keys, links to Datadog/repo
```

- **Header**: health dot + name + collapse caret.
- **Subline**: domain · layer.
- **Tech chips**: from inferred `tech` (logo + label).
- **Footer**: exposed port(s), live throughput.
- **Expanded**: endpoint list (OpenAPI), inferred dependencies, deep-links
  (Datadog dashboard, Grafana, source repo) pulled from node `links`.

External nodes (Stripe, SendGrid, legacy ERP, Datadog) get a distinct dashed,
muted card so "things we don't own" read instantly.

## Continuous sync in the UI

The WebSocket pushes [`GraphDiff`](./graph-schema.ts)s. The UI:
- animates new nodes/edges in, fades removed ones out,
- flips health dots in place,
- promotes an edge from dashed→solid the first time traffic is observed,
- appends a line to a collapsible **activity feed** ("`legacy-bridge` →
  api-gateway edge first observed", "`billing` health: healthy → down").

No reload, ever. The map is always the live system.

## Dark-dashboard design language

| Token | Value (starting point) |
|---|---|
| Canvas bg | `#0B0E14` with a faint dotted grid (`#1A1F2B`) |
| Surface / card | `#141925`, 1px `#222A3A` border, soft shadow |
| Text | primary `#E6EAF2`, muted `#8A93A6` |
| Accent | electric cyan `#3DD6D0` (selection, focus, active edges) |
| Health | up `#34D399` · degraded `#FBBF24` · down `#F87171` · unknown `#6B7280` |
| Auth (security overlay) | mTLS `#34D399` · token/JWT `#3DD6D0` · API-key `#60A5FA` · **none `#F87171`** |
| Typography | Geist / Inter UI; JetBrains Mono for ports, ids, endpoints |
| Motion | 150–250ms ease; flow particles ~2s loop; down-node pulse ~1.4s |

Glow/neon used sparingly and meaningfully (health, active flow, selection) — not
decoration. The result reads as a serious operations tool, not a toy.

## Export & present

- **Present mode** — fullscreen, chrome hidden, large fonts; for demos.
- **Export** — PNG/SVG of the current view; and a **Mermaid / Graphviz** dump of
  the reconciled graph so the diagram can drop into a README or wiki. (One-way:
  the live map stays the source of truth.)
