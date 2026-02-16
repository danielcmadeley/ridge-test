"""Support types and dataclass for boundary conditions."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto

from .node import Node


class SupportType(Enum):
    """Common 2D support conditions."""

    PINNED = auto()   # fixed x, y; free rotation
    FIXED = auto()    # fixed x, y, rotation
    ROLLER_X = auto() # fixed y only (free to slide in x)
    ROLLER_Y = auto() # fixed x only (free to slide in y)


@dataclass
class Support:
    """A support applied to a node."""

    node: Node
    support_type: SupportType
