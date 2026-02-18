"""Central Model class — the single entry point for users."""

from __future__ import annotations

from pathlib import Path

import openseespy.opensees as ops

from ._ops_builder import build_model
from ._frame_math import element_geometry, global_to_local_components
from ._tag_manager import TagManager
from .analysis import run_static_analysis
from .element import FrameElement, ReleaseType, TrussElement
from .load import DistributedLoad, NodalLoad, PointLoadOnElement
from .material import Material
from .node import Node
from .plotting import (
    plot_axial,
    plot_deformation,
    plot_loads,
    plot_model,
    plot_moment,
    plot_shear,
)
from .results import AnalysisResults
from .section import Section
from .support import Support, SupportType


class Model:
    """2D indeterminate structural analysis model.

    Usage:
        m = Model("My Frame")
        a = m.add_node("A", 0, 0)
        b = m.add_node("B", 6, 0)
        sec = Section("W", A=6e-3, Iz=100e-6, E=200e9)
        m.add_frame_element("AB", a, b, sec)
        m.add_support(a, SupportType.FIXED)
        m.add_support(b, SupportType.ROLLER_X)
        m.add_distributed_load(m.elements["AB"], wy=-10_000)
        results = m.analyze()
        results.print_reactions()
        m.plot_all()
        m.show()
    """

    def __init__(self, name: str = "Model") -> None:
        self.name = name

        # Tag allocators
        self._node_tags = TagManager()
        self._elem_tags = TagManager()
        self._mat_tags = TagManager()

        # Domain storage
        self.nodes: dict[str, Node] = {}
        self.elements: dict[str, FrameElement | TrussElement] = {}
        self.materials: dict[str, Material] = {}
        self._supports: list[Support] = []
        self._nodal_loads: list[NodalLoad] = []
        self._distributed_loads: list[DistributedLoad] = []
        self._point_loads: list[PointLoadOnElement] = []

        self._results: AnalysisResults | None = None

    # ── Node ─────────────────────────────────────────────────────────

    def add_node(self, name: str, x: float, y: float) -> Node:
        """Create a node and return it."""
        nd = Node(name=name, x=x, y=y, tag=self._node_tags.next())
        self.nodes[name] = nd
        return nd

    # ── Supports ─────────────────────────────────────────────────────

    def add_support(self, node: Node, support_type: SupportType) -> Support:
        sup = Support(node=node, support_type=support_type)
        self._supports.append(sup)
        return sup

    # ── Sections (auto-tag) ──────────────────────────────────────────

    def _ensure_section_tag(self, section: Section) -> None:
        if section.tag == 0:
            section.tag = self._elem_tags.next()  # not critical, just unique

    # ── Materials ────────────────────────────────────────────────────

    def add_material(self, name: str, E: float, A: float) -> Material:
        mat = Material(name=name, E=E, A=A, tag=self._mat_tags.next())
        self.materials[name] = mat
        return mat

    # ── Elements ─────────────────────────────────────────────────────

    def add_frame_element(
        self,
        name: str,
        node_i: Node,
        node_j: Node,
        section: Section,
        release: ReleaseType = ReleaseType.NONE,
    ) -> FrameElement:
        elem = FrameElement(
            name=name,
            node_i=node_i,
            node_j=node_j,
            section=section,
            release=release,
            tag=self._elem_tags.next(),
        )
        self.elements[name] = elem
        return elem

    def add_truss_element(
        self,
        name: str,
        node_i: Node,
        node_j: Node,
        material: Material,
    ) -> TrussElement:
        elem = TrussElement(
            name=name,
            node_i=node_i,
            node_j=node_j,
            material=material,
            tag=self._elem_tags.next(),
        )
        self.elements[name] = elem
        return elem

    # ── Loads ────────────────────────────────────────────────────────

    def add_nodal_load(
        self, node: Node, fx: float = 0.0, fy: float = 0.0, mz: float = 0.0
    ) -> NodalLoad:
        nl = NodalLoad(node=node, fx=fx, fy=fy, mz=mz)
        self._nodal_loads.append(nl)
        return nl

    def add_distributed_load(
        self, element: FrameElement, wx: float = 0.0, wy: float = 0.0
    ) -> DistributedLoad:
        dl = DistributedLoad(element=element, wx=wx, wy=wy)
        self._distributed_loads.append(dl)
        return dl

    def add_point_load_on_element(
        self,
        element: FrameElement,
        py: float = 0.0,
        px: float = 0.0,
        x_ratio: float = 0.5,
    ) -> PointLoadOnElement:
        pl = PointLoadOnElement(element=element, py=py, px=px, x_ratio=x_ratio)
        self._point_loads.append(pl)
        return pl

    # ── Self-weight ────────────────────────────────────────────────────

    def apply_self_weight(self) -> None:
        """Add distributed self-weight loads for elements with mass_per_metre."""
        for elem in self.elements.values():
            if isinstance(elem, FrameElement) and elem.section.mass_per_metre > 0:
                wy = -elem.section.mass_per_metre * 9.81  # N/m downward
                self._distributed_loads.append(
                    DistributedLoad(element=elem, wx=0.0, wy=wy)
                )

    # ── Analysis ─────────────────────────────────────────────────────

    def analyze(self, include_self_weight: bool = True) -> AnalysisResults:
        """Build the OpenSees model, run static analysis, extract results."""
        if include_self_weight:
            self.apply_self_weight()

        all_nodes = list(self.nodes.values())
        all_elements = list(self.elements.values())

        build_model(
            nodes=all_nodes,
            elements=all_elements,
            supports=self._supports,
            nodal_loads=self._nodal_loads,
            distributed_loads=self._distributed_loads,
            point_loads_on_elements=self._point_loads,
        )

        rc = run_static_analysis()
        if rc != 0:
            raise RuntimeError(
                "Analysis failed (possible unstable frame/mechanism from supports or end releases) "
                f"with return code {rc}"
            )

        self._results = self._extract_results()
        return self._results

    def _extract_results(self) -> AnalysisResults:
        results = AnalysisResults(
            supports=self._supports,
            elements=self.elements,
            distributed_loads=self._distributed_loads,
        )

        # Displacements for all nodes
        for nd in self.nodes.values():
            disp = ops.nodeDisp(nd.tag)
            results.displacements[nd.name] = (disp[0], disp[1], disp[2])

        # Reactions at supported nodes
        ops.reactions()
        for sup in self._supports:
            nd = sup.node
            rxn = ops.nodeReaction(nd.tag)
            results.reactions[nd.name] = (rxn[0], rxn[1], rxn[2])

        # Element end-forces [N_i, V_i, M_i, N_j, V_j, M_j].
        # For frame elements, request local forces directly from OpenSees.
        # For truss elements, keep global forces and project in axial_force().
        for name, elem in self.elements.items():
            if isinstance(elem, FrameElement):
                local_forces = ops.eleResponse(elem.tag, "localForces")
                if local_forces is not None and len(local_forces) >= 6:
                    results.element_forces[name] = tuple(local_forces[:6])
                else:
                    # Fallback: rotate global end-forces to local (2D frame)
                    forces = ops.eleForce(elem.tag)
                    ni, nj = elem.node_i, elem.node_j
                    dx = nj.x - ni.x
                    dy = nj.y - ni.y
                    L, c, s = element_geometry(dx, dy)
                    if L < 1e-12:
                        results.element_forces[name] = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
                        continue
                    n_i, v_i = global_to_local_components(forces[0], forces[1], c, s)
                    n_j, v_j = global_to_local_components(forces[3], forces[4], c, s)
                    results.element_forces[name] = (
                        n_i,
                        v_i,
                        forces[2],
                        n_j,
                        v_j,
                        forces[5],
                    )
            else:
                # Truss: keep global (axial_force() does its own transform)
                forces = ops.eleForce(elem.tag)
                results.element_forces[name] = tuple(forces)

        return results

    # ── Plotting ─────────────────────────────────────────────────────

    def plot_model(self, output_dir: str | Path = "output") -> Path:
        return plot_model(self, Path(output_dir))

    def plot_loads(self, output_dir: str | Path = "output") -> Path:
        return plot_loads(self, Path(output_dir))

    def plot_deformation(
        self, scale: float = 100.0, output_dir: str | Path = "output"
    ) -> Path:
        return plot_deformation(self, Path(output_dir), scale=scale)

    def plot_axial(
        self, scale: float = 0.0001, output_dir: str | Path = "output"
    ) -> Path:
        return plot_axial(self, Path(output_dir), scale=scale)

    def plot_shear(
        self, scale: float = 0.0001, output_dir: str | Path = "output"
    ) -> Path:
        return plot_shear(self, Path(output_dir), scale=scale)

    def plot_moment(
        self, scale: float = 0.0001, output_dir: str | Path = "output"
    ) -> Path:
        return plot_moment(self, Path(output_dir), scale=scale)

    def plot_all(
        self,
        output_dir: str | Path = "output",
        defo_scale: float = 100.0,
        force_scale: float = 0.0001,
        renderer: str = "plotly",
    ) -> list[Path]:
        """Generate all six standard plots and save as PNG files."""
        d = Path(output_dir)
        if renderer == "plotly":
            from .plotting_plotly import plot_combined_diagram

            return [
                self.plot_model(d),
                self.plot_loads(d),
                plot_combined_diagram(self, "deflection", d),
                plot_combined_diagram(self, "axial", d),
                plot_combined_diagram(self, "shear", d),
                plot_combined_diagram(self, "moment", d),
            ]

        if renderer != "matplotlib":
            raise ValueError("renderer must be 'plotly' or 'matplotlib'")

        return [
            self.plot_model(d),
            self.plot_loads(d),
            self.plot_deformation(scale=defo_scale, output_dir=d),
            self.plot_axial(scale=force_scale, output_dir=d),
            self.plot_shear(scale=force_scale, output_dir=d),
            self.plot_moment(scale=force_scale, output_dir=d),
        ]
