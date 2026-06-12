# The Security / Trust-Boundary overlay

This overlay is Systrum's most differentiated feature. Architecture
conversations about security usually happen over stale diagrams and vibes. This
overlay replaces that with something concrete: it **renders the authentication
boundary on every single edge** and lets the map make the argument.

## What it does

When the Security overlay is active, the same graph is re-skinned to show its
**trust posture**:

### Edges → colored by authentication strength
Every edge's `auth` field (discovered from env key names, the registry, and
annotations) becomes its color and style:

| `auth` | Render | Reading |
|---|---|---|
| `mtls` | solid green, shield glyph | mutually authenticated |
| `jwt` / `bearer-token` | solid cyan, key glyph | token-authenticated |
| `api-key` / `proxy-key` | solid blue, key glyph | shared-secret authenticated |
| `device-id` | solid blue, chip glyph | device-level credential |
| `basic` | amber | weak but present |
| **`none`** | **bold red, dashed, ⚠** | **unauthenticated path — investigate** |

The instant value: scan the map for red. If there is no red between your trust
zones, every hop is authenticated — visibly, not rhetorically.

### Nodes → trust-zone framing
- **Internet-facing** nodes (`internetFacing: true`) get a distinct ring and sit
  in an "exposed" band — so it's obvious what the outside world can reach.
- **External systems** you don't own are visually separated, so "our boundary"
  vs "their boundary" is unambiguous.
- **Secret-bearing** nodes (hold API keys, device credentials, token managers)
  are tagged, so where secrets live is explicit.

### Trust zones (hulls)
Annotated zones drawn as translucent hulls: `internet`, `dmz`, `internal`,
`data`, `external`. Every edge that **crosses** a zone boundary is highlighted —
those crossings are exactly where auth matters, and the overlay makes each one
legible at a glance.

## How the data is discovered

The overlay invents nothing — it visualizes facts the providers already gather
([`DISCOVERY.md`](./DISCOVERY.md)):

- **Env-heuristic** — key names set `auth`. A service shipping `GATEWAY_API_KEY`
  → that edge is `api-key`. `PROXY_API_KEY` / `X-Proxy-Key` → `proxy-key`.
- **Registry** (`api_clients`) — the hub's own record of each client's auth,
  scopes, `bound_ip`, `active`, `expires_at`, `last_used_at`. Authoritative.
- **Annotations** (`topology.yml`) — for anything not machine-readable: that a
  proxy injects an upstream **bearer token** it manages itself; that a bridge's
  auth is **device-level**, with user authentication enforced *before* the
  bridge is called; trust-zone membership.

## Worked example — the demo stack

This is the story the overlay tells for the demo online-shop platform:

```
        INTERNET                 DMZ / EDGE              INTERNAL                 EXTERNAL
   ┌───────────────┐       ┌────────────────────┐    ┌──────────────────┐    ┌──────────────┐
   │  end users    │─jwt─▶│  storefront (web)  │    │                  │    │  Stripe      │
   └───────────────┘       └─────────┬──────────┘    │                  │    │  SendGrid    │
                                     │ jwt           │                  │    │  legacy ERP  │
                                     ▼               │                  │    │  Datadog     │
                          ┌────────────────────┐     │                  │    └──────▲───────┘
                          │  api-gateway       │◀───┤  registry-       │           │
                          │  (hub)             │     │  authenticated   │  bearer   │
                          └─────────▲──────────┘     │  clients         │  token    │
                                    │ api-key        │                  │           │
              ┌─────────────────────┼────────────────┼──────────┐       │           │
              │ api-key             │ api-key        │ api-key  │       │           │
   ┌──────────┴───────┐  ┌──────────┴──────┐  ┌──────┴────────┐ └───────┘           │
   │ payments-proxy   │──┘ billing/orders  │  │ legacy-bridge │──device-id──────────┘
   │  (proxy-key in)  │    /inventory/auth │  │ (device id)   │
   └────────┬─────────┘                    │  └───────────────┘
            └── bearer token (managed) ───────────────────────────▶ Stripe
```

What a viewer reads off it without you saying a word:

1. **No unauthenticated edges.** Every hop is api-key, jwt, proxy-key, bearer, or
   device-id. There is no red.
2. **Secrets don't sprawl.** The upstream payment token lives *only* inside the
   `payments-proxy` token manager; downstream services never hold it. The map
   shows the token edge terminating at one node.
3. **The boundary is explicit.** External systems sit in their own zone; the only
   things internet-facing are the ones that must be.
4. **Auth is centralized.** Every spoke authenticates to the hub with a
   registered, scoped, IP-bindable, expirable API client — and the registry
   proves each one was used recently and legitimately.

That turns "I think this is insecure" into a concrete, point-at-able
conversation: *"show me which edge you're worried about."* Usually there isn't
one — and where there is, you've now found a real finding instead of a vibe.

## Honest framing (so the overlay stays a tool, not a sales pitch)

The overlay shows **authentication of edges and exposure of nodes**. It does not,
by itself, prove:
- secrets are *stored* well (use it to start that conversation, per node),
- authZ/scoping is correct (it shows scopes exist, links to the registry),
- transport encryption everywhere (annotate `tls: true/false` per edge to make
  that visible too).

Used straight, it's a credibility win precisely *because* it's accurate: it
shows real auth where it exists and flags real gaps where they don't. If
something genuinely is unauthenticated, you want that red edge on the screen
before anyone else finds it.
