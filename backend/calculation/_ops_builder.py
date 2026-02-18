"""Translates domain objects into OpenSeesPy commands."""

from __future__ import annotations

import openseespy.opensees as ops

from ._frame_math import element_geometry, global_load_to_local
from ._tag_manager import TagManager
from .element import FrameElement, ReleaseType, TrussElement
from .load import DistributedLoad, NodalLoad, PointLoadOnElement
from .node import Node
from .support import Support, SupportType


def build_model(
    nodes: list[Node],
    elements: list[FrameElement | TrussElement],
    supports: list[Support],
    nodal_loads: list[NodalLoad],
    distributed_loads: list[DistributedLoad],
    point_loads_on_elements: list[PointLoadOnElement],
) -> None:
    """Wipe and rebuild the full OpenSees model from domain objects."""
    ops.wipe()
    ops.model("basic", "-ndm", 2, "-ndf", 3)

    hinge_tag_mgr = TagManager(start=_max_node_tag(nodes) + 100)
    geom_tag = 1  # single geometric transformation

    # Geometric transformation (corotational would also work)
    ops.geomTransf("Linear", geom_tag)

    # --- Nodes ---
    for nd in nodes:
        ops.node(nd.tag, nd.x, nd.y)

    # --- Elements ---
    defined_mat_tags: set[int] = set()
    for elem in elements:
        if isinstance(elem, FrameElement):
            _build_frame_element(elem, geom_tag, hinge_tag_mgr)
        elif isinstance(elem, TrussElement):
            _build_truss_element(elem, defined_mat_tags)

    # --- Constraints (supports + truss rz fix) ---
    _apply_constraints(elements, supports)

    # --- Loads ---
    ops.timeSeries("Constant", 1)
    ops.pattern("Plain", 1, 1)

    for nl in nodal_loads:
        ops.load(nl.node.tag, nl.fx, nl.fy, nl.mz)

    for dl in distributed_loads:
        # API/model loads are stored as global components (wx, wy).
        # OpenSees beamUniform expects local components (Wy, Wx), where:
        #   local x = (c, s), local y = (-s, c)
        #   Wx_local = wx*c + wy*s
        #   Wy_local = -wx*s + wy*c
        ni = dl.element.node_i
        nj = dl.element.node_j
        dx = nj.x - ni.x
        dy = nj.y - ni.y
        L, c, s = element_geometry(dx, dy)
        if L < 1e-12:
            continue
        wx_local, wy_local = global_load_to_local(dl.wx, dl.wy, c, s)
        ops.eleLoad("-ele", dl.element.tag, "-type", "-beamUniform", wy_local, wx_local)

    for pl in point_loads_on_elements:
        ops.eleLoad(
            "-ele",
            pl.element.tag,
            "-type",
            "-beamPoint",
            pl.py,
            pl.x_ratio,
            pl.px,
        )


def _max_node_tag(nodes: list[Node]) -> int:
    if not nodes:
        return 0
    return max(nd.tag for nd in nodes)


def _fixity(st: SupportType) -> tuple[int, int, int]:
    """Return (fix_x, fix_y, fix_rz) for a support type."""
    if st == SupportType.FIXED:
        return (1, 1, 1)
    if st == SupportType.PINNED:
        return (1, 1, 0)
    if st == SupportType.ROLLER_X:
        return (0, 1, 0)
    if st == SupportType.ROLLER_Y:
        return (1, 0, 0)
    return (0, 0, 0)


def _apply_constraints(
    elements: list[FrameElement | TrussElement],
    supports: list[Support],
) -> None:
    """Apply support constraints and fix rz where no rotational stiffness exists.

    Truss elements provide no rotational stiffness. Frame nodes where the
    connected frame end is released also provide no rotational stiffness at
    that node. Those rotational DOFs are kinematically free and can make the
    global stiffness matrix singular, so we restrain rz for such nodes.
    """
    # Detect where rotational stiffness is present at a node.
    rotational_frame_tags: set[int] = set()
    truss_tags: set[int] = set()
    for elem in elements:
        if isinstance(elem, FrameElement):
            start_released = elem.release in (ReleaseType.START, ReleaseType.BOTH)
            end_released = elem.release in (ReleaseType.END, ReleaseType.BOTH)
            if not start_released:
                rotational_frame_tags.add(elem.node_i.tag)
            if not end_released:
                rotational_frame_tags.add(elem.node_j.tag)
        elif isinstance(elem, TrussElement):
            truss_tags.add(elem.node_i.tag)
            truss_tags.add(elem.node_j.tag)

    all_frame_end_tags: set[int] = set()
    for elem in elements:
        if isinstance(elem, FrameElement):
            all_frame_end_tags.add(elem.node_i.tag)
            all_frame_end_tags.add(elem.node_j.tag)

    no_rotational_stiffness = (truss_tags | all_frame_end_tags) - rotational_frame_tags

    # Merge support fixity with rz-fix for nodes without rotational stiffness
    fixity: dict[int, list[int]] = {}

    for sup in supports:
        tag = sup.node.tag
        f = _fixity(sup.support_type)
        if tag in fixity:
            fixity[tag] = [max(a, b) for a, b in zip(fixity[tag], f)]
        else:
            fixity[tag] = list(f)

    for tag in no_rotational_stiffness:
        if tag in fixity:
            fixity[tag][2] = 1
        else:
            fixity[tag] = [0, 0, 1]

    for tag, (fx, fy, frz) in fixity.items():
        ops.fix(tag, fx, fy, frz)


def _build_frame_element(
    elem: FrameElement, geom_tag: int, hinge_tag_mgr: TagManager
) -> None:
    sec = elem.section
    ni = elem.node_i.tag
    nj = elem.node_j.tag

    if elem.release == ReleaseType.NONE:
        ops.element(
            "elasticBeamColumn",
            elem.tag,
            ni,
            nj,
            sec.A,
            sec.E,
            sec.Iz,
            geom_tag,
        )
    else:
        # Internal hinges: create duplicate nodes, tie translations with equalDOF
        elem._hinge_node_tags.clear()

        if elem.release in (ReleaseType.START, ReleaseType.BOTH):
            hn = hinge_tag_mgr.next()
            elem._hinge_node_tags.append(hn)
            ops.node(hn, elem.node_i.x, elem.node_i.y)
            ops.equalDOF(ni, hn, 1, 2)  # tie x, y; rotation free
            ni = hn

        if elem.release in (ReleaseType.END, ReleaseType.BOTH):
            hn = hinge_tag_mgr.next()
            elem._hinge_node_tags.append(hn)
            ops.node(hn, elem.node_j.x, elem.node_j.y)
            ops.equalDOF(nj, hn, 1, 2)
            nj = hn

        ops.element(
            "elasticBeamColumn",
            elem.tag,
            ni,
            nj,
            sec.A,
            sec.E,
            sec.Iz,
            geom_tag,
        )


def _build_truss_element(elem: TrussElement, defined_mat_tags: set[int]) -> None:
    mat = elem.material
    # Define uniaxial elastic material once per unique tag
    if mat.tag not in defined_mat_tags:
        ops.uniaxialMaterial("Elastic", mat.tag, mat.E)
        defined_mat_tags.add(mat.tag)
    ops.element("Truss", elem.tag, elem.node_i.tag, elem.node_j.tag, mat.A, mat.tag)
