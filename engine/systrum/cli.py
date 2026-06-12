"""`python -m systrum.cli scan` — one-shot discovery to SQLite and/or JSON."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .config import load_config
from .discovery import run_discovery
from .store import GraphStore


def cmd_scan(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    print(f"• config: {config.config_path}")
    print(f"• repos:  {len(config.repo_paths)} path(s) under {config.repos_root}")

    graph = run_discovery(config)
    print(
        f"• graph:  {len(graph.nodes)} nodes, {len(graph.edges)} edges "
        f"(providers: {', '.join(graph.providers)})"
    )

    if args.db:
        snap_id = GraphStore(args.db).save(graph)
        print(f"• stored: snapshot #{snap_id} → {args.db}")
    if args.out:
        Path(args.out).write_text(graph.model_dump_json(indent=2))
        print(f"• wrote:  {args.out}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="systrum", description="Systrum discovery engine")
    sub = parser.add_subparsers(dest="command", required=True)

    scan = sub.add_parser("scan", help="run discovery once")
    scan.add_argument("-c", "--config", required=True, help="path to systrum.yml")
    scan.add_argument("--db", help="SQLite path to store the snapshot")
    scan.add_argument("-o", "--out", help="write graph.json to this path")
    scan.set_defaults(func=cmd_scan)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
