# Roadmap

Phased so the **most useful deliverable — a generated, accurate, beautiful
static diagram — lands first**, then grows into the live, security-proving
platform.

## Phase 1 — Static map (MVP)

**Goal:** point Systrum at a set of repos, get a generated, branded, accurate
architecture diagram. No live data yet — purely from committed config.

- [x] Engine skeleton (FastAPI), provider interface, scheduler, graph store (SQLite)
- [x] **Compose provider** — containers, ports, images, tech inference
- [x] **Env-heuristic provider** — dependency edges + auth from env keys
- [x] **Annotation provider** + `topology.yml` (domains, external systems, zones)
- [x] Reconciliation core (merge + confidence) — no live escalation yet
- [x] Web app: Next.js + React Flow + elkjs auto-layout, dark theme
- [x] Custom node cards, domain group nodes, minimap, pan/zoom
- [x] Health/Confidence/Domain overlays (static values)
- [x] Present mode + PNG/SVG/Mermaid export
- [x] Demo-stack preset

**Exit:** open the app, see a real topology, present it fullscreen. Export a
diagram for a slide deck or README.

## Phase 2 — Live topology

**Goal:** the map becomes the running system, continuously.

- [ ] **Docker provider** — live container state + health from the socket
- [ ] **Prometheus provider** — `/health` + `/metrics` → node health, edge traffic
- [ ] Confidence escalation (`declared` → `observed`), `lastSeen` plumbing
- [ ] WebSocket diff push + UI live updates (animated)
- [ ] Traffic overlay (edge thickness + flow particles), activity feed
- [ ] Scheduler intervals per provider

**Exit:** kill a container → its node goes red on screen within a poll cycle,
with a line in the activity feed.

## Phase 3 — Endpoints, registry & the Security overlay

**Goal:** the feature that reframes security conversations.

- [ ] **OpenAPI provider** — per-service endpoint nodes (deepest zoom)
- [ ] **Registry provider** — `api_clients` → authoritative edges, auth, liveness
- [ ] **Security / Trust-Boundary overlay** — edges by auth, zone hulls,
      internet-facing rings, secret-bearing tags (see SECURITY-OVERLAY.md)
- [ ] Node detail: scopes, `bound_ip`, `last_used_at`, `expires_at`, deep-links

**Exit:** toggle the Security overlay live; every edge shows its auth; no red
between trust zones (or a real finding if there is).

## Phase 4 — Polish & "Google Maps" depth

- [ ] Semantic zoom (domains → services → containers → endpoints)
- [ ] `⌘K` search & fly-to
- [ ] URL-encoded view state (shareable links)
- [ ] Environment overlay + multi-env support
- [ ] Long-horizon history (optional TimescaleDB) + time-travel slider
- [ ] Per-repo `.systrum.yml` merging

## Phase 5 — Open-source readiness

- [ ] Logo + brand polish
- [ ] Generic presets + a runnable sample/demo stack
- [ ] **Kubernetes provider** (community-friendly first external provider)
- [ ] Provider-authoring guide + plugin API docs
- [ ] CI, tests, `docker compose up` one-command demo
- [ ] Screenshots/GIFs, landing README, first tagged release

## Effort sketch (rough, solo)

| Phase | Rough size |
|---|---|
| 1 — Static map | the bulk of the initial work; the thing to ship first |
| 2 — Live topology | moderate; standard metrics/WS plumbing |
| 3 — Security overlay | small-moderate; mostly rendering facts already gathered |
| 4 — Polish | ongoing |
| 5 — OSS launch | a focused push once it's proven on a real stack |

## Risks & mitigations

- **Env-heuristic false edges** — keep heuristics conservative; `topology.yml`
  corrects; mark inferred edges `declared` so they read as "configured, not
  confirmed."
- **Layout aesthetics at scale** — small graphs help; elk layered layout + domain
  sub-clustering; allow pinned positions as an escape hatch.
- **Registry coupling** — registry shapes vary; keep each registry a plugin so
  the core stays generic.
- **Scope creep** — Phase 1 is the line. Everything live/security is post-MVP
  polish that makes a demo *better*, not the diagram *exist*.
