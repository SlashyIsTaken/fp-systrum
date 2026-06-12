"""SQLite snapshot store. Deliberately boring: each scan writes one snapshot row."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from .model import Graph


class GraphStore:
    def __init__(self, db_path: str | Path = "data/systrum.sqlite"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS snapshots (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    generated_at TEXT NOT NULL,
                    graph_json   TEXT NOT NULL
                )
                """
            )

    def save(self, graph: Graph) -> int:
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO snapshots (generated_at, graph_json) VALUES (?, ?)",
                (graph.generatedAt or "", graph.model_dump_json()),
            )
            return int(cur.lastrowid)

    def latest(self) -> Graph | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT graph_json FROM snapshots ORDER BY id DESC LIMIT 1"
            ).fetchone()
        if not row:
            return None
        return Graph.model_validate_json(row[0])
