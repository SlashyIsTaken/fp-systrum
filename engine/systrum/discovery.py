"""Orchestrate providers → reconcile → one graph."""

from __future__ import annotations

from .config import Config
from .model import Graph
from .providers import (
    AnnotationsProvider,
    ComposeProvider,
    DockerProvider,
    EnvProvider,
    PrometheusProvider,
    SimulateProvider,
)
from .providers.annotations import load_annotations
from .providers.base import Context, Provider
from .reconcile import reconcile


def build_providers(config: Config) -> list[Provider]:
    """Construct the enabled providers once.

    Live providers (e.g. simulate) are stateful across cycles, so the scheduler
    builds the list once and reuses it rather than rebuilding every scan.
    """
    providers: list[Provider] = []
    if config.provider_enabled("compose"):
        providers.append(ComposeProvider())
    if config.provider_enabled("env"):
        providers.append(EnvProvider())
    ann = load_annotations(config.annotations_file)
    if config.provider_enabled("annotations") or ann is not None:
        providers.append(AnnotationsProvider(ann))
    if config.provider_enabled("simulate"):
        providers.append(SimulateProvider())
    if config.provider_enabled("docker"):
        providers.append(DockerProvider())
    if config.provider_enabled("prometheus"):
        providers.append(PrometheusProvider())
    return providers


def make_context(
    config: Config, provider_name: str, current_graph: Graph | None = None
) -> Context:
    """Build the read-only Context handed to a provider's discover()."""
    return Context(
        repo_paths=config.repo_paths,
        config=config.provider_config(provider_name),
        annotations_file=config.annotations_file,
        current_graph=current_graph,
    )


def run_discovery(
    config: Config,
    current_graph: Graph | None = None,
    providers: list[Provider] | None = None,
) -> Graph:
    ann = load_annotations(config.annotations_file)
    if providers is None:
        providers = build_providers(config)
    fragments = [
        provider.discover(make_context(config, provider.name, current_graph))
        for provider in providers
    ]
    return reconcile(fragments, ann, [p.name for p in providers])
