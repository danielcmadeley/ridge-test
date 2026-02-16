"""Element classes for 2D structural models."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto

from .material import Material
from .node import Node
from .section import Section


class ReleaseType(Enum):
    """Moment release (hinge) location on a frame element."""

    NONE = auto()
    START = auto()
    END = auto()
    BOTH = auto()


@dataclass
class FrameElement:
    """2D Euler-Bernoulli frame element (beam-column)."""

    name: str
    node_i: Node
    node_j: Node
    section: Section
    release: ReleaseType = ReleaseType.NONE
    tag: int = 0  # assigned by Model
    # Tags for internal hinge nodes created by _ops_builder
    _hinge_node_tags: list[int] = field(default_factory=list)


@dataclass
class TrussElement:
    """2D truss element (axial only)."""

    name: str
    node_i: Node
    node_j: Node
    material: Material
    tag: int = 0  # assigned by Model
