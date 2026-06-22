"""Discovery providers — each emits a GraphFragment from one kind of source."""

from .annotations import AnnotationsProvider
from .base import Context, Provider
from .compose import ComposeProvider
from .docker import DockerProvider
from .env import EnvProvider
from .prometheus import PrometheusProvider
from .simulate import SimulateProvider

__all__ = [
    "Context",
    "Provider",
    "ComposeProvider",
    "EnvProvider",
    "AnnotationsProvider",
    "SimulateProvider",
    "DockerProvider",
    "PrometheusProvider",
]
