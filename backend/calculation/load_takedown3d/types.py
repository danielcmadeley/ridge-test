"""Typed models for 3D load takedown analysis."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Vec3:
    x: float
    y: float
    z: float


@dataclass(frozen=True)
class MaterialProps:
    name: str
    E: float
    nu: float
    rho: float


@dataclass(frozen=True)
class Slab:
    id: str
    name: str
    origin: Vec3
    width: float
    depth: float
    thickness: float
    elevation: float
    material: MaterialProps


@dataclass(frozen=True)
class Column:
    id: str
    name: str
    base: Vec3
    height: float
    size_x: float
    size_y: float
    material: MaterialProps


@dataclass(frozen=True)
class Wall:
    id: str
    name: str
    origin: Vec3
    length: float
    thickness: float
    height: float
    rotation_z: float
    material: MaterialProps


@dataclass(frozen=True)
class Storey:
    id: str
    name: str
    elevation: float


@dataclass(frozen=True)
class LoadTakedownModel:
    version: str
    units: str
    grid_size: float
    storeys: list[Storey]
    slabs: list[Slab]
    columns: list[Column]
    walls: list[Wall]
    slab_udl: float


@dataclass(frozen=True)
class LevelForce:
    elevation: float
    n_down: float


@dataclass(frozen=True)
class ColumnReaction:
    id: str
    n_base: float
    vx_base: float
    vy_base: float
    level_forces: list[LevelForce]


@dataclass(frozen=True)
class WallReaction:
    id: str
    n_base: float
    vx_base: float
    vy_base: float


@dataclass(frozen=True)
class LoadTakedownResult:
    total_vertical_reaction: float
    total_applied_load: float
    columns: list[ColumnReaction]
    walls: list[WallReaction]
    warnings: list[str]
