"""Generate a combined PDF design report for all elements in a structure."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

import jinja2

from .designer import ElementRole, StructureDesignResults
from .ec3 import BeamDesignEC3, ColumnDesignEC3, TrussMemberDesignEC3
from .ec3.report import _template_vars as _beam_template_vars
from .ec3.column_report import _template_vars as _column_template_vars
from .ec3.truss_member_report import _template_vars as _truss_template_vars
from .model import Model

_TEMPLATE_DIR = Path(__file__).parent / "templates"
_DEFAULT_FRONTPAGE_PATH = (
    Path(__file__).resolve().parents[2] / "web" / "public" / "export-frontpage.jpg"
)
_DEFAULT_LOGO_PATH = (
    Path(__file__).resolve().parents[2] / "web" / "public" / "ridge-logo.png"
)


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


def _build_template_vars(
    design_results: StructureDesignResults,
    model: Model,
    plot_filenames: list[str],
) -> dict:
    """Build template variables from design results."""
    fmt2 = lambda v: f"{v:.2f}"
    fmt3 = lambda v: f"{v:.3f}"

    ar = design_results.analysis_results

    # Reactions
    reactions = []
    for name, (fx, fy, mz) in ar.reactions.items():
        reactions.append(
            {
                "node": name,
                "fx": fmt2(fx / 1e3),
                "fy": fmt2(fy / 1e3),
                "mz": fmt2(mz / 1e3),
            }
        )

    # Per-element summary rows
    summary_rows = []
    for name, r in design_results.element_results.items():
        summary_rows.append(
            {
                "name": name,
                "role": r.role.name.capitalize(),
                "designation": r.designation,
                "length": fmt2(r.length_m),
                "governing": r.governing_check,
                "util": fmt3(r.max_utilisation),
                "ok": r.overall_ok,
            }
        )

    # Full step-by-step details for each element type, reusing existing
    # _template_vars functions so every calculation step is included.
    beam_details = []
    for name, r in design_results.element_results.items():
        if r.role != ElementRole.BEAM or r.design_obj is None:
            continue
        tvars = _beam_template_vars(r.design_obj)
        tvars["elem_name"] = name
        beam_details.append(tvars)

    column_details = []
    for name, r in design_results.element_results.items():
        if r.role != ElementRole.COLUMN or r.design_obj is None:
            continue
        tvars = _column_template_vars(r.design_obj)
        tvars["elem_name"] = name
        column_details.append(tvars)

    truss_details = []
    for name, r in design_results.element_results.items():
        if r.role != ElementRole.TRUSS_MEMBER or r.design_obj is None:
            continue
        tvars = _truss_template_vars(r.design_obj)
        tvars["elem_name"] = name
        truss_details.append(tvars)

    # Element counts
    n_beams = len(beam_details)
    n_columns = len(column_details)
    n_truss = len(truss_details)

    return {
        "structure_name": design_results.structure_name,
        "steel_grade": design_results.steel_grade,
        "n_elements": len(design_results.element_results),
        "n_beams": n_beams,
        "n_columns": n_columns,
        "n_truss": n_truss,
        "reactions": reactions,
        "summary_rows": summary_rows,
        "beam_details": beam_details,
        "column_details": column_details,
        "truss_details": truss_details,
        "plot_filenames": plot_filenames,
        "all_pass": design_results.all_pass,
    }


def generate_combined_report(
    design_results: StructureDesignResults,
    model: Model,
    plot_paths: dict[str, Path],
    output_path: str | Path,
    *,
    logo_path: str | Path | None = None,
    project_title: str = "",
    job_no: str = "",
    calcs_for: str = "",
    calcs_by: str = "",
    checked_by: str = "",
    approved_by: str = "",
    frontpage_path: str | Path | None = None,
) -> Path:
    """Render the combined LaTeX template and compile to PDF.

    Returns
    -------
    Path
        Absolute path to the generated PDF.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    env = _make_env()
    template = env.get_template("combined_report.tex.j2")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)

        # Copy front page image if available
        frontpage_filename = ""
        resolved_frontpage = (
            Path(frontpage_path)
            if frontpage_path is not None
            else _DEFAULT_FRONTPAGE_PATH
        )
        if resolved_frontpage.exists():
            shutil.copy2(resolved_frontpage, tmp_path / resolved_frontpage.name)
            frontpage_filename = resolved_frontpage.name

        # Copy logo (explicit path wins, otherwise default Ridge logo)
        logo_filename = ""
        resolved_logo = Path(logo_path) if logo_path is not None else _DEFAULT_LOGO_PATH
        if resolved_logo.exists():
            shutil.copy2(resolved_logo, tmp_path / resolved_logo.name)
            logo_filename = resolved_logo.name

        # Copy plot images
        plot_filenames: list[str] = []
        for key, p in plot_paths.items():
            p = Path(p)
            if p.exists():
                shutil.copy2(p, tmp_path / p.name)
                plot_filenames.append(p.name)

        # Build template variables
        tvars = _build_template_vars(design_results, model, plot_filenames)
        frontpage_project_name = project_title.strip() or "Project Example"
        tvars.update(
            has_logo=bool(logo_filename),
            logo_filename=logo_filename,
            project_title=project_title,
            job_no=job_no,
            calcs_for=calcs_for,
            calcs_by=calcs_by,
            checked_by=checked_by,
            approved_by=approved_by,
            has_frontpage=bool(frontpage_filename),
            frontpage_filename=frontpage_filename,
            frontpage_project_name=frontpage_project_name,
            frontpage_pack_title="Structural Calculation Pack",
            frontpage_date=datetime.now().strftime("%B %Y"),
        )

        tex_source = template.render(**tvars)
        tex_file = tmp_path / "report.tex"
        tex_file.write_text(tex_source, encoding="utf-8")

        # Run pdflatex twice for cross-references
        for _ in range(2):
            result = subprocess.run(
                [
                    "pdflatex",
                    "-interaction=nonstopmode",
                    "-halt-on-error",
                    "report.tex",
                ],
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
