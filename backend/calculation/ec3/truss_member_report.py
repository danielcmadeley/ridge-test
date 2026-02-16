"""Generate a PDF design report from EC3 truss member design results."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import jinja2

from .truss_member import TrussMemberDesignEC3

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


def _template_vars(d: TrussMemberDesignEC3) -> dict:
    """Build the flat dict of template variables from design results."""
    sd = d.section_data
    fmt2 = lambda v: f"{v:.2f}"
    fmt3 = lambda v: f"{v:.3f}"
    fmt4 = lambda v: f"{v:.4f}"

    ct_gov = max(d.ct_h, d.ct_b)

    return dict(
        # Header
        designation=sd.designation,
        steel_grade=d.steel_grade,
        NEd_comp=fmt2(d.NEd_compression),
        NEd_tens=fmt2(d.NEd_tension),
        Lcr_ip=fmt2(d.Lcr_ip),
        Lcr_oop=fmt2(d.Lcr_oop),

        # Section properties
        h=fmt2(sd.h),
        b=fmt2(sd.b),
        t=fmt2(sd.t),
        A_sec=fmt2(sd.A),
        Iy=fmt2(sd.Iy),
        Iz_sec=fmt2(sd.Iz),
        iy=fmt2(sd.iy),
        iz=fmt2(sd.iz),
        Wel_y=fmt2(sd.Wel_y),
        Wpl_y=fmt2(sd.Wpl_y),
        Wel_z=fmt2(sd.Wel_z),
        Wpl_z=fmt2(sd.Wpl_z),
        mass=fmt2(sd.mass_per_metre),
        section_type=sd.section_type,

        # Step 1
        fy=f"{d.fy:.0f}",
        fu=f"{d.fu:.0f}",
        epsilon=fmt4(d.epsilon),

        # Step 2
        c_h=fmt2(d.c_h),
        ct_h=fmt2(d.ct_h),
        c_b=fmt2(d.c_b),
        ct_b=fmt2(d.ct_b),
        ct_gov=fmt2(ct_gov),
        limit_33e=fmt2(33 * d.epsilon),
        limit_38e=fmt2(38 * d.epsilon),
        limit_42e=fmt2(42 * d.epsilon),
        section_class=d.section_class,

        # Step 3
        NRd=fmt2(d.NRd),

        # Step 4
        lambda_1=fmt2(d.lambda_1),
        lambda_bar_ip=fmt4(d.lambda_bar_ip),
        lambda_bar_oop=fmt4(d.lambda_bar_oop),
        lambda_bar=fmt4(d.lambda_bar),
        buckling_curve=d.buckling_curve,
        alpha_imp=fmt2(d.alpha_imp),
        Phi=fmt4(d.Phi),
        chi=fmt4(d.chi),
        Nb_Rd=fmt2(d.Nb_Rd),

        # Step 5
        compression_util=fmt3(d.compression_util),
        compression_ok=d.compression_ok,

        # Step 6
        has_holes=d.has_holes,
        Nt_Rd=fmt2(d.Nt_Rd),

        # Step 7
        tension_util=fmt3(d.tension_util),
        tension_ok=d.tension_ok,

        # Overall
        overall_ok=d.overall_ok,
    )


def generate_truss_member_report(
    design: TrussMemberDesignEC3,
    output_path: str | Path,
    *,
    logo_path: str | Path | None = None,
    project_title: str = "",
    job_no: str = "",
    calcs_for: str = "",
    calcs_by: str = "",
    checked_by: str = "",
    approved_by: str = "",
) -> Path:
    """Render the LaTeX template and compile to PDF.

    Parameters
    ----------
    design : TrussMemberDesignEC3
        A design object **after** ``check_all()`` has been called.
    output_path : str or Path
        Destination for the PDF (e.g. ``"output/truss_chord_report.pdf"``).
    logo_path : str or Path, optional
        Path to a logo image (PNG/PDF/JPG) for the header.
    project_title, job_no, calcs_for, calcs_by, checked_by, approved_by : str
        Project information fields displayed in the page header.

    Returns
    -------
    Path
        Absolute path to the generated PDF.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    env = _make_env()
    template = env.get_template("truss_member_report.tex.j2")

    with tempfile.TemporaryDirectory() as tmp:
        # Copy logo if provided
        logo_filename = ""
        if logo_path is not None:
            logo = Path(logo_path)
            if logo.exists():
                shutil.copy2(logo, Path(tmp) / logo.name)
                logo_filename = logo.name

        # Build template variables
        tvars = _template_vars(design)
        tvars.update(
            has_logo=bool(logo_filename),
            logo_filename=logo_filename,
            project_title=project_title,
            job_no=job_no,
            calcs_for=calcs_for,
            calcs_by=calcs_by,
            checked_by=checked_by,
            approved_by=approved_by,
        )

        tex_source = template.render(**tvars)
        tex_file = Path(tmp) / "report.tex"
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
                # Write the .tex for debugging
                debug_tex = output_path.with_suffix(".tex")
                debug_tex.write_text(tex_source, encoding="utf-8")
                raise RuntimeError(
                    f"pdflatex failed (see {debug_tex} for source).\n"
                    f"stderr: {result.stderr[-500:]}\n"
                    f"stdout: {result.stdout[-500:]}"
                )

        pdf_src = Path(tmp) / "report.pdf"
        output_path.write_bytes(pdf_src.read_bytes())

    print(f"  Saved: {output_path}")
    return output_path.resolve()
