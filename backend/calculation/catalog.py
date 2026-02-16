"""Steel section catalog — loads UK UB/UC/SHS/RHS sections from CSV data."""

from __future__ import annotations

import csv
from pathlib import Path

from .ec3.hollow_section_data import HollowSectionData
from .ec3.section_data import SteelSectionData
from .section import Section

_DATA_DIR = Path(__file__).parent.parent / "data"

_SECTIONS: dict[str, Section] = {}
_SECTION_DATA: dict[str, SteelSectionData] = {}
_HOLLOW_DATA: dict[str, HollowSectionData] = {}


def _load_csv(path: Path) -> None:
    """Parse a single CSV file and populate both lookup dicts.

    Skips CSVs that lack I-section columns (e.g. RHS/SHS data).
    """
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if "tw[mm]" not in (reader.fieldnames or []):
            return
        for row in reader:
            designation = row["Section"].strip()
            A = float(row["A[cm2]"]) * 1e-4  # cm² → m²
            Iz = float(row["Iy[cm4]"]) * 1e-8  # cm⁴ → m⁴ (major axis)
            mass_per_metre = float(row["G[kg/m]"])
            _SECTIONS[designation] = Section(
                name=designation,
                A=A,
                Iz=Iz,
                E=210e9,
                designation=designation,
                mass_per_metre=mass_per_metre,
            )
            _SECTION_DATA[designation] = SteelSectionData(
                designation=designation,
                h=float(row["h[mm]"]),
                b=float(row["b[mm]"]),
                tw=float(row["tw[mm]"]),
                tf=float(row["tf[mm]"]),
                r=float(row["r1[mm]"]),
                d=float(row["d[mm]"]),
                hi=float(row["hi[mm]"]),
                A=float(row["A[cm2]"]),
                Iy=float(row["Iy[cm4]"]),
                Iz=float(row["Iz[cm4]"]),
                It=float(row["It[cm4]"]),
                Iw=float(row["Iω[cm6]"]),
                Wel_y=float(row["Wy[cm3]"]),
                Wpl_y=float(row["Wpl,y[cm3]"]),
                Wel_z=float(row["Wz[cm3]"]),
                Wpl_z=float(row["Wpl,z[cm3]"]),
                mass_per_metre=mass_per_metre,
            )


def _load_shs_csv(path: Path) -> None:
    """Parse an SHS CSV file and populate _HOLLOW_DATA."""
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            designation = row["Section"].strip()
            h = float(row["h[mm]"])
            t = float(row["t[mm]"])
            _HOLLOW_DATA[designation] = HollowSectionData(
                designation=designation,
                h=h,
                b=h,  # SHS: b = h
                t=t,
                A=float(row["A[cm2]"]),
                Iy=float(row["Iy[cm4]"]),
                Iz=float(row["Iy[cm4]"]),  # SHS: Iz = Iy
                iy=float(row["iy[mm]"]),
                iz=float(row["iy[mm]"]),  # SHS: iz = iy
                Wel_y=float(row["Wy[cm3]"]),
                Wpl_y=float(row["Wpl,y[cm3]"]),
                Wel_z=float(row["Wy[cm3]"]),  # SHS: Wel_z = Wel_y
                Wpl_z=float(row["Wpl,y[cm3]"]),  # SHS: Wpl_z = Wpl_y
                mass_per_metre=float(row["G[kg/m]"]),
                section_type="SHS",
            )


def _load_rhs_csv(path: Path) -> None:
    """Parse an RHS CSV file and populate _HOLLOW_DATA."""
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            designation = row["Section"].strip()
            _HOLLOW_DATA[designation] = HollowSectionData(
                designation=designation,
                h=float(row["h[mm]"]),
                b=float(row["b[mm]"]),
                t=float(row["t[mm]"]),
                A=float(row["A[cm2]"]),
                Iy=float(row["Iy[cm4]"]),
                Iz=float(row["Iz[cm4]"]),
                iy=float(row["iy[mm]"]),
                iz=float(row["iz[mm]"]),
                Wel_y=float(row["Wy[cm3]"]),
                Wpl_y=float(row["Wpl,y[cm3]"]),
                Wel_z=float(row["Wz[cm3]"]),
                Wpl_z=float(row["Wpl,z[cm3]"]),
                mass_per_metre=float(row["G[kg/m]"]),
                section_type="RHS",
            )


def _ensure_loaded() -> None:
    """Load CSV files on first access."""
    if _SECTIONS:
        return
    for csv_path in sorted(_DATA_DIR.rglob("*.csv")):
        _load_csv(csv_path)


def _ensure_hollow_loaded() -> None:
    """Load SHS/RHS CSV files on first access."""
    if _HOLLOW_DATA:
        return
    shs_dir = _DATA_DIR / "shs"
    rhs_dir = _DATA_DIR / "rhs"
    for csv_path in sorted(shs_dir.glob("*.csv")):
        _load_shs_csv(csv_path)
    for csv_path in sorted(rhs_dir.glob("*.csv")):
        _load_rhs_csv(csv_path)


def load_section(designation: str) -> Section:
    """Look up a steel section by designation (e.g. ``"UB 305x127x42"``)."""
    _ensure_loaded()
    try:
        src = _SECTIONS[designation]
    except KeyError:
        raise ValueError(
            f"Section '{designation}' not found. "
            f"Use list_sections() to see available designations."
        ) from None
    # Return a fresh copy so tag can be set independently per element
    return Section(
        name=src.name,
        A=src.A,
        Iz=src.Iz,
        E=src.E,
        designation=src.designation,
        mass_per_metre=src.mass_per_metre,
    )


def load_section_data(designation: str) -> SteelSectionData:
    """Look up full geometric properties for EC3 design checks."""
    _ensure_loaded()
    try:
        return _SECTION_DATA[designation]
    except KeyError:
        raise ValueError(
            f"Section '{designation}' not found. "
            f"Use list_sections() to see available designations."
        ) from None


def list_sections(series: str | None = None) -> list[str]:
    """Return available section designations, optionally filtered by series.

    ``series`` can be ``"UB"`` or ``"UC"`` (case-insensitive).
    """
    _ensure_loaded()
    names = sorted(_SECTIONS.keys())
    if series is not None:
        prefix = series.strip().upper()
        names = [n for n in names if n.startswith(prefix)]
    return names


def load_hollow_section_data(designation: str) -> HollowSectionData:
    """Look up full geometric properties for a hollow section (SHS/RHS)."""
    _ensure_hollow_loaded()
    try:
        return _HOLLOW_DATA[designation]
    except KeyError:
        raise ValueError(
            f"Section '{designation}' not found. "
            f"Use list_hollow_sections() to see available designations."
        ) from None


def list_hollow_sections(series: str | None = None) -> list[str]:
    """Return available hollow section designations.

    ``series`` can be ``"SHS"`` or ``"RHS"`` (case-insensitive).
    """
    _ensure_hollow_loaded()
    names = sorted(_HOLLOW_DATA.keys())
    if series is not None:
        prefix = series.strip().upper()
        names = [n for n in names if n.startswith(prefix)]
    return names
