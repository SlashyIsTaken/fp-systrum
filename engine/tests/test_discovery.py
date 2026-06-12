"""End-to-end discovery test against the committed demo-shop fixtures.

Doubles as the executable spec for the demo stack: if you change the fixtures,
keep these assertions true (or update them deliberately).
"""

from pathlib import Path

from systrum.config import load_config
from systrum.discovery import run_discovery

DEMO_CONFIG = Path(__file__).resolve().parents[2] / "examples" / "demo-shop" / "systrum.yml"


def _graph():
    return run_discovery(load_config(DEMO_CONFIG))


def test_core_nodes_discovered():
    ids = {n.id for n in _graph().nodes}
    expected = {
        "storefront", "api-gateway", "orders", "inventory", "billing", "auth",
        "payments-proxy", "legacy-bridge", "postgres", "redis", "rabbitmq",
        "stripe", "legacy-erp",
    }
    assert expected <= ids, f"missing: {expected - ids}"


def test_datastores_classified():
    nodes = {n.id: n for n in _graph().nodes}
    assert nodes["postgres"].kind == "datastore"
    assert nodes["rabbitmq"].kind == "queue"


def test_domain_groups_created():
    nodes = _graph().nodes
    domain_ids = {n.id for n in nodes if n.kind == "domain"}
    assert "domain:payments" in domain_ids
    # children point at their district
    billing = next(n for n in nodes if n.id == "billing")
    assert billing.parentId == "domain:payments"


def test_env_heuristic_infers_auth():
    edges = {(e.source, e.target): e for e in _graph().edges}
    # proxy-key from billing's PROXY_API_KEY
    assert edges[("billing", "payments-proxy")].auth == "proxy-key"
    # api-key from the gateway's *_API_KEY siblings
    assert edges[("api-gateway", "orders")].auth == "api-key"
    # db hop with credentials in the DSN → basic
    assert edges[("orders", "postgres")].protocol == "db"
    assert edges[("orders", "postgres")].auth == "basic"


def test_annotations_win_over_discovery():
    edges = {(e.source, e.target): e for e in _graph().edges}
    stripe = edges[("payments-proxy", "stripe")]
    assert stripe.auth == "bearer-token"
    assert stripe.confidence == "annotated"
    erp = edges[("legacy-bridge", "legacy-erp")]
    assert erp.auth == "device-id"
    assert erp.protocol == "tcp"
