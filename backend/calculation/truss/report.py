"""Generate a PDF report from truss analysis results."""

from __future__ import annotations

import math
import shutil
import subprocess
import tempfile
from pathlib import Path

import jinja2

from ..model import Model
from ..results import AnalysisResults

_TEMPLATE_DIR = Path(__file__).parent / "templates"


def _make_env() -> jinja2.Environment:
    """Jinja2 environment with LaTeX-safe delimiters."""
    return jinja2.Environment(
        loader=jinja2.FileSystemLoader(str(_TEMPLATE_DIR)),
        block_start_string=r"\BLOCK{",
        block_end_string="}",
        variable_start_string=r"\VAR{",
        variable_end_string="}",
        comment_start_string=r"\#{",
        comment_end_string="}",
        line_statement_prefix="%%",
        line_comment_prefix="%#",
        trim_blocks=True,
        lstrip_blocks=True,
        autoescape=False,
    )


def _template_vars(results: AnalysisResults, model: Model) -> dict:
    """Build the flat dict of template variables from analysis results."""
    fmt2 = lambda v: f"{v:.2f}"
    fmt4 = lambda v: f"{v:.4f}"

    # Geometry summary
    all_x = [n.x for n in model.nodes.values()]
    all_y = [n.y for n in model.nodes.values()]
    span = max(all_x) - min(all_x)
    depth = max(all_y) - min(all_y)

    # Material info from first truss element
    first_elem = next(iter(model.elements.values()))
    mat = first_elem.material
    E_GPa = mat.E / 1e9
    A_cm2 = mat.A * 1e4

    # Member forces
    members = []
    for name, elem in model.elements.items():
        ni, nj = elem.node_i, elem.node_j
        L = math.hypot(nj.x - ni.x, nj.y - ni.y)
        N = results.axial_force(name)
        N_kN = N / 1e3
        if N > 1e-3:
            tc = "T"
        elif N < -1e-3:
            tc = "C"
        else:
            tc = "--"
        members.append(dict(
            name=name,
            nodes=f"{ni.name}--{nj.name}",
            length=fmt2(L),
            axial=fmt2(N_kN),
            tc=tc,
        ))

    # Reactions
    reactions = []
    for name, (fx, fy, mz) in results.reactions.items():
        reactions.append(dict(
            node=name,
            fx=fmt2(fx / 1e3),
            fy=fmt2(fy / 1e3),
            mz=fmt2(mz / 1e3),
        ))

    # Displacements
    displacements = []
    for name, (dx, dy, rz) in results.displacements.items():
        displacements.append(dict(
            node=name,
            dx=fmt4(dx * 1e3),
            dy=fmt4(dy * 1e3),
            rz=f"{rz:.6f}",
        ))

    return dict(
        truss_name=model.name,
        span=fmt2(span),
        depth=fmt2(depth),
        n_nodes=len(model.nodes),
        n_members=len(model.elements),
        E_GPa=fmt2(E_GPa),
        A_cm2=fmt2(A_cm2),
        members=members,
        reactions=reactions,
        displacements=displacements,
    )


def generate_truss_report(
    results: AnalysisResults,
    model: Model,
    output_path: str | Path,
    *,
    logo_path: str | Path | None = None,
    project_title: str = "",
    job_no: str = "",
    calcs_for: str = "",
    calcs_by: str = "",
    checked_by: str = "",
    approved_by: str = "",
    plot_paths: list[str | Path] | None = None,
) -> Path:
    """Render the LaTeX template and compile to PDF.

    Parameters
    ----------
    results : AnalysisResults
        Results from ``model.analyze()``.
    model : Model
        The truss model.
    output_path : str or Path
        Destination for the PDF (e.g. ``"output/truss_report.pdf"``).
    logo_path : str or Path, optional
        Path to a logo image (PNG/PDF/JPG) for the header.
    project_title, job_no, calcs_for, calcs_by, checked_by, approved_by : str
        Project information fields displayed in the page header.
    plot_paths : list of str or Path, optional
        PNG images to embed (e.g. model, loads, deformation plots).

    Returns
    -------
    Path
        Absolute path to the generated PDF.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    env = _make_env()
    template = env.get_template("truss_report.tex.j2")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)

        # Copy logo if provided
        logo_filename = ""
        if logo_path is not None:
            logo = Path(logo_path)
            if logo.exists():
                shutil.copy2(logo, tmp_path / logo.name)
                logo_filename = logo.name

        # Copy plot images
        plot_filenames: list[str] = []
        if plot_paths:
            for p in plot_paths:
                p = Path(p)
                if p.exists():
                    shutil.copy2(p, tmp_path / p.name)
                    plot_filenames.append(p.name)

        # Build template variables
        tvars = _template_vars(results, model)
        tvars.update(
            has_logo=bool(logo_filename),
            logo_filename=logo_filename,
            project_title=project_title,
            job_no=job_no,
            calcs_for=calcs_for,
            calcs_by=calcs_by,
            checked_by=checked_by,
            approved_by=approved_by,
            plot_filenames=plot_filenames,
        )

        tex_source = template.render(**tvars)
        tex_file = tmp_path / "report.tex"
        tex_file.write_text(tex_source, encoding="utf-8")

        # Run pdflatex twice for cross-references
        for _ in range(2):
            result = subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "report.tex"],
                cwd=tmp,
                capture_output=True,
                text=True,
                timeout=60,
            )
            if result.returncode != 0:
                debug_tex = output_path.with_suffix(".tex")
                debug_tex.write_text(tex_source, encoding="utf-8")
                raise RuntimeError(
                    f"pdflatex failed (see {debug_tex} for source).\n"
                    f"stderr: {result.stderr[-500:]}\n"
                    f"stdout: {result.stdout[-500:]}"
                )

        pdf_src = tmp_path / "report.pdf"
        output_path.write_bytes(pdf_src.read_bytes())

    print(f"  Saved: {output_path}")
    return output_path.resolve()
