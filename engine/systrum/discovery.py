"""Orchestrate providers → reconcile → one graph."""

from __future__ import annotations

from .config import Config
from .model import Graph
from .providers import AnnotationsProvider, ComposeProvider, EnvProvider
from .providers.annotations import load_annotations
from .providers.base import Context, Provider
from .reconcile import reconcile


def build_providers(config: Config) -> list[Provider]:
    providers: list[Provider] = []
    if config.provider_enabled("compose"):
        providers.append(ComposeProvider())
    if config.provider_enabled("env"):
        providers.append(EnvProvider())
    ann = load_annotations(config.annotations_file)
    if config.provider_enabled("annotations") or ann is not None:
        providers.append(AnnotationsProvider(ann))
    return providers


def run_discovery(config: Config) -> Graph:
    ann = load_annotations(config.annotations_file)
    providers = build_providers(config)
    fragments = []
    for provider in providers:
        ctx = Context(
            repo_paths=config.repo_paths,
            config=config.provider_config(provider.name),
            annotations_file=config.annotations_file,
        )
        fragments.append(provider.discover(ctx))
    return reconcile(fragments, ann, [p.name for p in providers])
