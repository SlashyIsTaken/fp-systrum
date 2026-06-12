"""Compose provider — parse docker-compose files into container/service nodes."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import yaml

from ..model import GraphEdge, GraphFragment, GraphNode
from .base import Context

# image substring → (node kind, tech tag)
_DATASTORE_IMAGES = {
    "postgres": "postgresql",
    "mysql": "mysql",
    "mariadb": "mariadb",
    "mongo": "mongodb",
    "redis": "redis",
    "memcached": "memcached",
    "elasticsearch": "elasticsearch",
}
_QUEUE_IMAGES = {
    "rabbitmq": "rabbitmq",
    "kafka": "kafka",
    "nats": "nats",
    "redpanda": "redpanda",
}

_COMPOSE_GLOBS = ("docker-compose*.yml", "docker-compose*.yaml", "compose*.yml", "compose*.yaml")


class ComposeProvider:
    name = "compose"
    kind = "static"

    def discover(self, ctx: Context) -> GraphFragment:
        frag = GraphFragment(provider=self.name)
        seen_files: set[Path] = set()

        for repo in ctx.repo_paths:
            for pattern in _COMPOSE_GLOBS:
                for path in Path(repo).rglob(pattern):
                    if "node_modules" in path.parts or path in seen_files:
                        continue
                    seen_files.add(path)
                    self._parse_file(path, frag)
        return frag

    def _parse_file(self, path: Path, frag: GraphFragment) -> None:
        try:
            data = yaml.safe_load(path.read_text()) or {}
        except yaml.YAMLError:
            return
        services = data.get("services", {}) or {}
        repo_name = path.parent.name

        for svc_name, svc in services.items():
            svc = svc or {}
            image = str(svc.get("image", "") or "")
            kind, image_tech = _classify(image)

            ctx_dir = self._build_dir(path, svc)
            tech = self._infer_tech(ctx_dir)
            if image_tech and image_tech not in tech:
                tech.append(image_tech)

            ports = _as_list(svc.get("ports"))
            node = GraphNode(
                id=svc_name,
                kind=kind,
                name=_titleize(svc_name),
                tech=tech,
                meta={
                    "image": image or None,
                    "ports": ports,
                    "restart": svc.get("restart"),
                    "networks": list(svc.get("networks", []) or []),
                    "repo": repo_name,
                    "composeFile": str(path),
                },
            )
            frag.nodes.append(node)

            for dep in _depends_on(svc):
                frag.edges.append(
                    GraphEdge(
                        id=GraphEdge.make_id(svc_name, dep, "http"),
                        source=svc_name,
                        target=dep,
                        protocol="http",
                        auth="none",
                        confidence="declared",
                        meta={"via": "depends_on"},
                    )
                )

    @staticmethod
    def _build_dir(compose_path: Path, svc: dict[str, Any]) -> Path:
        build = svc.get("build")
        if isinstance(build, dict) and build.get("context"):
            return (compose_path.parent / build["context"]).resolve()
        if isinstance(build, str):
            return (compose_path.parent / build).resolve()
        return compose_path.parent

    @staticmethod
    def _infer_tech(ctx_dir: Path) -> list[str]:
        tech: list[str] = []
        dockerfile = ctx_dir / "Dockerfile"
        if dockerfile.is_file():
            head = dockerfile.read_text(errors="ignore")[:2000].lower()
            m = re.search(r"^from\s+([^\s]+)", head, re.MULTILINE)
            if m:
                base = m.group(1)
                if "python" in base:
                    tech.append("python")
                elif "node" in base:
                    tech.append("node")
        if (ctx_dir / "requirements.txt").is_file():
            if "python" not in tech:
                tech.append("python")
            reqs = (ctx_dir / "requirements.txt").read_text(errors="ignore").lower()
            if "fastapi" in reqs:
                tech.append("fastapi")
        pkg = ctx_dir / "package.json"
        if pkg.is_file():
            if "node" not in tech:
                tech.append("node")
            try:
                deps = json.loads(pkg.read_text(errors="ignore")).get("dependencies", {})
            except (json.JSONDecodeError, AttributeError):
                deps = {}
            if "next" in deps:
                tech.append("nextjs")
            elif "react" in deps:
                tech.append("react")
        return tech


def _classify(image: str) -> tuple[str, str | None]:
    low = image.lower()
    for needle, tag in _DATASTORE_IMAGES.items():
        if needle in low:
            return "datastore", tag
    for needle, tag in _QUEUE_IMAGES.items():
        if needle in low:
            return "queue", tag
    return "service", None


def _depends_on(svc: dict[str, Any]) -> list[str]:
    dep = svc.get("depends_on")
    if isinstance(dep, dict):
        return list(dep.keys())
    if isinstance(dep, list):
        return list(dep)
    return []


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    return [str(value)]


def _titleize(slug: str) -> str:
    return re.sub(r"[-_]+", " ", slug).strip().title()
