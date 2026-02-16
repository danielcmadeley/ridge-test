"""Node dataclass for 2D structural models."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Node:
    """A 2D node with coordinates and an auto-assigned tag."""

    name: str
    x: float
    y: float
    tag: int = 0  # assigned by Model
