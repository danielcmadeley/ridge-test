"""Auto-incrementing tag allocator for OpenSeesPy objects."""

from __future__ import annotations


class TagManager:
    """Provides unique integer tags for nodes, elements, etc."""

    def __init__(self, start: int = 1) -> None:
        self._next = start

    def next(self) -> int:
        tag = self._next
        self._next += 1
        return tag

    def reset(self, start: int = 1) -> None:
        self._next = start
