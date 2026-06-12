# Configuration

Two files drive Systrum:

- **`systrum.yml`** — what to discover (providers, targets, schedule).
- **`topology.yml`** — the human annotation layer (domains, external systems,
  trust zones, corrections). Optional but high-value.

Both are version-controllable. Ship a generic default plus **presets** for real
environments. The examples below describe the neutral demo stack; a real
deployment lives in its own preset (kept private when it maps internal systems).

## `systrum.yml`

```yaml
# What environment Systrum is mapping, and how to render it.
name: "Demo Shop"
environment: production

# Where the source lives (mounted read-only into the engine container).
repos:
  root: /workspace          # parent of the service repos
  include: ["*-service", "api-gateway", "storefront", "*-proxy", "*-bridge"]

# Providers — enable + configure. Disabled ones are simply omitted.
providers:
  compose:
    enabled: true
  env:
    enabled: true
    # Extra heuristics on top of the built-ins (*_URL, *_HOST, *_API_KEY…).
    upstream_keys: ["GATEWAY_URL", "STRIPE_API_BASE", "ERP_HOST"]
    auth_keys:                      # key-name → edge auth mechanism
      PROXY_API_KEY: proxy-key
      GATEWAY_API_KEY: api-key
      X_API_KEY: api-key
      ERP_DEVICE_ID: device-id
  docker:
    enabled: true
    socket: unix:///var/run/docker.sock   # read-only
  prometheus:
    enabled: true
    targets:                         # base URLs; /metrics + /health appended
      - http://api-gateway:8000
      - http://payments-proxy:8001
      - http://legacy-bridge:8001
    interval_s: 30
  openapi:
    enabled: true
    targets:
      - http://api-gateway:8000
      - http://orders:8000
  registry:
    enabled: true
    kind: postgres                   # introspect the api_clients table
    dsn_env: SYSTRUM_REGISTRY_DSN    # secret via env, never inline
    query: |
      select name, client_type, key_prefix, active, bound_ip,
             last_used_at, expires_at
      from api_clients
    maps_to_hub: api-gateway         # all these clients → edges into this node

annotations:
  file: ./topology.yml

ui:
  theme: dark
  default_overlays: [health, domain]
```

## `topology.yml` — the annotation layer

Everything here is `confidence: annotated` and wins over discovery. Use it for
what machines can't infer: business meaning, external systems, trust zones, and
corrections.

```yaml
# Business domains (the "districts" at far zoom).
domains:
  storefront:   { label: "Storefront",   color: "#A78BFA" }
  payments:     { label: "Payments",     color: "#3DD6D0" }
  fulfillment:  { label: "Fulfillment",  color: "#60A5FA" }
  platform:     { label: "Platform / Infra", color: "#6B7280" }

# Trust zones (hulls in the security overlay).
zones:
  internet:  { label: "Internet" }
  edge:      { label: "DMZ / Edge" }
  internal:  { label: "Internal" }
  data:      { label: "Data" }
  external:  { label: "External (not ours)" }

# External systems discovery sees only as URLs — give them identity.
nodes:
  - id: stripe
    kind: external
    name: "Stripe"
    zone: external
    meta: { vendor: "Stripe", note: "api.stripe.com" }
  - id: legacy-erp
    kind: external
    name: "Legacy ERP"
    zone: external
    meta: { protocol: "TCP" }
  - id: sendgrid
    kind: external
    name: "SendGrid"
    zone: external
  - id: datadog
    kind: external
    name: "Datadog"
    layer: infra
    zone: external

# Map discovered services onto domains/zones + correct anything.
assign:
  payments-proxy: { domain: payments,    zone: edge, internetFacing: false }
  legacy-bridge:  { domain: fulfillment, zone: internal }
  billing:        { domain: payments,    zone: internal }
  orders:         { domain: fulfillment, zone: internal }
  inventory:      { domain: fulfillment, zone: internal }
  api-gateway:    { domain: platform,    zone: edge, internetFacing: true, label: "API Gateway (hub)" }
  storefront:     { domain: storefront,  zone: edge, internetFacing: true }

# Edges discovery can't infer (or whose nuance needs stating).
edges:
  - { source: payments-proxy, target: stripe, protocol: http,
      auth: bearer-token, note: "Proxy injects a self-managed token; downstream never sees it" }
  - { source: legacy-bridge, target: legacy-erp, protocol: tcp,
      auth: device-id, note: "Device-level credential; end-user auth enforced before the bridge is called" }

# Per-node deep links surfaced in the node card.
links:
  api-gateway:
    - { label: "Datadog", href: "https://app.datadoghq.com/..." }
    - { label: "Repo",    href: "https://github.com/.../api-gateway" }
```

## Per-repo annotations (optional)

A repo can describe itself with a `.systrum.yml` at its root; the engine merges
these into the central `topology.yml`. This keeps domain/zone metadata next to
the code that owns it.

```yaml
# payments-proxy/.systrum.yml
service:
  id: payments-proxy
  domain: payments
  zone: edge
  summary: "Auth-managing reverse proxy to the payment provider"
```

## Presets

A **preset** is just a `systrum.yml` + `topology.yml` pair for a specific
environment, dropped under `presets/<name>/` and selected at run time. Keep a
preset **private** (gitignored, or in a separate repo) when it names internal
hosts, vendors, or security posture — the engine and the demo preset stay public,
your real topology stays yours.

## Secrets

Never inline. DSNs, tokens, and registry credentials come from environment
variables referenced by name (`dsn_env: …`). Systrum is read-only and needs only
read scopes on everything it touches.
