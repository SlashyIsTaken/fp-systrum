# Discovery — the provider model

Discovery is the heart of Systrum. A **provider** is a plugin that looks at one
kind of source and emits a [`GraphFragment`](./graph-schema.ts) (some nodes +
some edges). Providers are blind to each other; the reconciliation core merges
their output. This single abstraction is what makes Systrum simultaneously:

- **universal** — add a provider for Kubernetes, Consul, AWS, Nomad… and the
  whole platform works against a new environment, and
- **specific** — a preset wires up exactly the sources your stack already
  exposes, lighting it up with zero changes to your services.

> Examples below use a neutral **demo stack**: a small online-shop platform with
> a `storefront` web app, an `api-gateway`, `orders` / `inventory` / `billing` /
> `auth` services, a `payments-proxy` (an auth-managing reverse proxy to an
> external payment provider), a `legacy-bridge` (a TCP bridge to a legacy ERP),
> `postgres` / `redis` / `rabbitmq`, and external systems Stripe, SendGrid and
> Datadog.

## Provider contract

```python
# engine/providers/base.py  (illustrative)
from dataclasses import dataclass
from typing import Protocol

@dataclass
class Context:
    repo_paths: list[str]          # mounted source roots
    docker_socket: str | None
    http_targets: list[str]        # base URLs to poll
    config: dict                   # provider-specific settings from systrum.yml
    current_graph: Graph | None    # last reconciled snapshot — live providers
                                   #   overlay observations onto the known topology

class Provider(Protocol):
    name: str
    kind: str                      # "static" | "live"
    interval_s: int                # how often the scheduler re-runs it

    async def discover(self, ctx: Context) -> "GraphFragment": ...
```

`static` providers (Compose, Env, OpenAPI-from-file) run rarely; `live`
providers (Docker, Prometheus, Registry) run on a short interval and drive the
real-time overlays.

## Built-in providers

### 1. Compose provider  · `static`
Parses every `docker-compose.yml` under the mounted repo paths.

- **Nodes:** one `container` per service; `image`, `ports`, `volumes`,
  `restart`, `networks` → `meta`. `build.context` ties it back to a repo.
- **Edges:** `depends_on` and shared-network membership → `declared` edges.
- **Tech inference:** Dockerfile base image + `requirements.txt` / `package.json`
  → `tech` chips (`python`, `fastapi`, `nextjs`…).

> _On the demo stack:_ immediately yields `api-gateway`, `orders`, `inventory`,
> `billing`, `payments-proxy`, `legacy-bridge`, `storefront`, etc., with their
> real port mappings and images.

### 2. Env-heuristic provider  · `static` · *the secret sauce*
Reads `.env`, `.env.example`, and compose `environment:` blocks and infers
**dependency edges from configuration**, with no instrumentation at all.

The trick: env var **values that look like upstreams** name the dependency.

| Pattern | Inferred edge |
|---|---|
| `GATEWAY_URL=…` | this service → **api-gateway** hub |
| `STRIPE_API_BASE=https://api.stripe.com` | → external **Stripe** |
| `ERP_HOST=erp.internal` | → external **legacy ERP** |
| `DATADOG_SITE=…` | → external **Datadog** (infra layer) |
| `*_API_KEY`, `X_API_KEY`, `PROXY_API_KEY` | sets the edge's **`auth`** field |
| `*_URL`, `*_HOST`, `*_BASE`, `*_ENDPOINT`, `*_DSN` | generic upstream edge |

Heuristics are configurable and overridable. The provider also reads the *key
names* to set edge `auth`: a service that ships `GATEWAY_API_KEY` is talking to
the gateway **with an API key** — which the security overlay then renders.

> This is what existing tools miss. Your `.env.example` files are an
> almost-complete, hand-maintained dependency manifest; nobody was reading them
> as one.

### 3. Docker provider  · `live`
Talks to the Docker socket (read-only) for ground truth on what's *actually*
running: container state, health-check status, uptime, restart counts, real
published ports. Upgrades Compose's `declared` containers to `observed` and
attaches `health`.

### 4. Prometheus provider  · `live`
Scrapes each target's `/metrics` and `/health`.

- **Health** → node `health.status` (and a build-info gauge, e.g.
  `app_build_info`, → version/git-sha in node detail).
- **Traffic** → request rate, p95 latency, error rate from the
  `prometheus-fastapi-instrumentator` series → edge `traffic` (drives edge
  thickness + the Traffic overlay).
- Observing traffic on an edge escalates its `confidence` to `observed`.

### 5. OpenAPI provider  · `static`/`live`
Pulls `/openapi.json` from each FastAPI service (free with FastAPI) → one
`endpoint` node per route, parented to the service. These appear only at the
deepest semantic-zoom level. Lets you answer "who exposes `/admin/api-clients`?"
visually.

### 6. Registry provider  · `live` · *authoritative edges*
Introspects a **service/client registry** to get the ground-truth list of who is
allowed to talk to a hub, with **auth method** and **liveness**.

> _On the demo stack:_ reads the gateway's `api_clients` table →
> - each `service`/`device` client → a confirmed `observed` edge into the hub,
> - `client_type`, scopes/roles → edge `auth` + labels,
> - `last_used_at` → edge `lastSeen` (proves the edge is alive, not just configured),
> - `bound_ip`, `active`, `expires_at` → security-overlay annotations.

This is the strongest signal in the whole system: a registry row is the hub
*itself* asserting "this client authenticated, with this key, at this time."

### 7. Annotation provider  · `static` · *human ground truth*
Loads `topology.yml`. Always wins on labels, domains, and layers, and can assert
nodes/edges discovery can't infer — external systems, the human-readable domain
names, trust zones. See [`CONFIG.md`](./CONFIG.md) for the schema.

### 8. Simulation provider  · `live` · *dev / demo fixture*
A synthetic stand-in for the real live providers, for when standing up an
instrumented stack isn't practical — UI work, pipeline development, or a
zero-dependency demo. It reads `ctx.current_graph` and overlays **`observed`
health** (a coherent per-node random walk) and **edge `traffic`** onto the
already-discovered topology, evolving it each cycle so the diff → WebSocket →
activity-feed pipeline has real movement to push. It never alters topology —
only enriches existing nodes/edges, which the reconciler escalates
`declared → observed`.

```yaml
providers:
  simulate:
    enabled: true
    seed: 7            # optional — reproducible flapping (omit for random)
    flap: 0.2          # per-cycle probability a node changes health
    force_down: [auth] # optional — pin these node ids to "down"
```

Disabled by default; the demo-shop preset turns it on so the map comes alive out
of the box. When the real **Docker**/**Prometheus** providers are configured,
disable `simulate` — they emit the same `observed` shape into the same pipeline.

## Reconciliation rules

Each cycle, the core merges all fragments and diffs against the last snapshot.

1. **Node merge** — by `id`. Later providers enrich (never silently overwrite)
   `meta`, `tech`, `health`. Conflicts are kept in `meta._conflicts` and
   surfaced in node detail rather than hidden.
2. **Edge merge** — by `(source, target, protocol)`.
3. **Confidence escalation** — `declared` + a live observation → `observed`;
   `lastSeen` updated to the live timestamp. `annotated` edges keep their
   asserted fields but still accept live `traffic`/`lastSeen`.
4. **Annotation overlay** — `topology.yml` applied last; wins on labels/domain/
   layer/auth; can force-add or force-hide nodes/edges.
5. **Diff** — added/removed/changed nodes & edges, health flips, confidence
   changes → pushed over WebSocket, appended to the activity feed.

### Trust ordering (highest to lowest)
```
annotated  >  observed (registry)  >  observed (metrics)  >  declared (compose/env)
```
When two sources disagree on a *fact* (not just enrich), the higher-trust source
wins and the disagreement is recorded — never dropped.

## Writing a new provider

1. Implement `Provider.discover()` returning a `GraphFragment`.
2. Drop it in `engine/providers/`, register its name.
3. Enable it in `systrum.yml` with any provider-specific config.

That's the whole extension story. A Kubernetes provider (read pods/services/
ingresses from the API server) or a Traefik/Nginx provider (parse routing
config) are obvious community first-PRs.
