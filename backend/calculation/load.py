"""Load classes for 2D structural models."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Union

from .element import FrameElement, TrussElement
from .node import Node

Element = Union[FrameElement, TrussElement]


@dataclass
class NodalLoad:
    """Point load applied directly to a node."""

    node: Node
    fx: float = 0.0  # horizontal force (N)
    fy: float = 0.0  # vertical force (N)
    mz: float = 0.0  # moment about z-axis (N-m)


@dataclass
class DistributedLoad:
    """Uniform distributed load on a frame element (global coords)."""

    element: FrameElement
    wx: float = 0.0  # global X component (N/m)
    wy: float = 0.0  # global Y component (N/m)


@dataclass
class PointLoadOnElement:
    """Concentrated load at a fractional position along a frame element."""

    element: FrameElement
    py: float = 0.0  # transverse force (N)
    px: float = 0.0  # axial force (N)
    x_ratio: float = 0.5  # 0.0 = node_i, 1.0 = node_j
