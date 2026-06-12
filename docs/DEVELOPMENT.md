# Development & running (Phase 1)

Phase 1 is a static map: the engine scans committed config (Compose + `.env` +
`topology.yml`), reconciles it into one graph, and serves it; the web app lays it
out with elk and renders it on a dark React Flow canvas. Out of the box it maps
the committed `examples/demo-shop/` stack.

```
engine/   FastAPI discovery engine + providers + reconciliation (Python)
web/      Next.js + React Flow map UI (TypeScript)
examples/demo-shop/   synthetic stack scanned by default (and by the tests)
presets/  real/private presets (gitignored)
```

## Quickest path — Docker

```bash
docker compose up --build
# web → http://localhost:3000   engine → http://localhost:8000
```

## Local dev (no Docker)

### Engine

```bash
cd engine
python -m venv .venv
source .venv/bin/activate            # fish: source .venv/bin/activate.fish
pip install -r requirements.txt

# Run the API (defaults to examples/demo-shop/systrum.yml)
uvicorn systrum.main:app --reload --port 8000
#   GET  http://localhost:8000/api/graph
#   POST http://localhost:8000/api/scan      (re-scan)
#   GET  http://localhost:8000/api/nodes/billing
```

One-shot scan via the CLI (no server):

```bash
python -m systrum.cli scan -c ../examples/demo-shop/systrum.yml -o /tmp/graph.json
```

Run the tests (they assert the demo-shop discovers correctly):

```bash
pip install -r requirements-dev.txt
pytest
```

### Web

```bash
cd web
cp .env.example .env.local           # NEXT_PUBLIC_API_BASE=http://localhost:8000
npm install
npm run dev                          # → http://localhost:3000
```

The engine must be running first (the UI fetches `GET /api/graph`).

## What you should see

The demo-shop laid out into **domain districts** (Storefront, Payments,
Fulfillment, Platform, Data, External), dark theme, custom node cards with tech
chips and ports, external systems (Stripe, Legacy ERP, End Users) drawn dashed,
edges styled by **confidence** (solid/dashed/dotted), minimap + pan/zoom, and
**Domain** + **Confidence** overlay toggles in the top-left panel. "Re-scan"
re-runs discovery.

## Pointing it at your own stack

Write a `systrum.yml` + `topology.yml` (see [`CONFIG.md`](./CONFIG.md)) as a
**preset**, then either:

- set `SYSTRUM_CONFIG=/path/to/systrum.yml` before `uvicorn`, or
- mount the preset + repos into the engine container (see commented lines in
  `docker-compose.yml`).

Keep presets that name internal systems under `presets/` (gitignored).

## Phase 1 limitations (by design)

- No live data: every node's health is `unknown`; the Health overlay arrives in
  Phase 2 (Docker + Prometheus providers).
- No WebSocket/continuous sync yet — refresh via "Re-scan".
- "Domain group nodes", not full semantic zoom (that's Phase 4).
- The Env provider assumes a repo's directory name matches its compose service
  id (true for the demo-shop; configurable later).
