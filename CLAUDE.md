# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**formandfunction** is a structural engineering analysis and design application with a Python backend (OpenSeesPy + FastAPI) and a React/TypeScript frontend. It performs 2D frame analysis, EC3 steel design checks, and supports BS EN 1990 load combinations via superposition.

## Commands

This project uses **uv** as the package manager (not pip).

- **Install dependencies:** `uv sync`
- **Run the project:** `uv run python main.py`
- **Run the backend API:** `cd backend && uv run uvicorn api.main:app --reload`
- **Run the frontend:** `cd web && npm run dev`
- **Add a dependency:** `uv add <package>`

## Tech Stack

### Backend (`backend/`)
- Python 3.12 (pinned in `.python-version`)
- **openseespy** — finite element analysis for structural/earthquake engineering
- **FastAPI** — REST API serving analysis and design endpoints
- **Pydantic** — request/response validation
- **numpy** — numerical arrays and linear algebra
- **matplotlib** — plotting and figure generation
- **Jinja2 + pdflatex** — PDF report generation

### Frontend (`web/`)
- **React 19** + **TypeScript**
- **TanStack Router** — file-based routing
- **react-konva** — 2D canvas for structure drawing
- **TanStack Query** — API data fetching
- **Tailwind CSS** + **shadcn/ui** — styling and components

## Architecture

### Backend structure
- `backend/formandfunction/` — core analysis engine (Model, StructureDesigner, EC3 design)
- `backend/api/` — FastAPI application layer
  - `schemas.py` — Pydantic request/response models
  - `builder.py` — converts JSON input to StructureDesigner calls (legacy + combinations paths)
  - `combiner.py` — superposition logic for load case combination
  - `main.py` — API endpoints (`/api/analyze`, `/api/diagrams`, `/api/report`, `/api/sections`)

### Frontend structure
- `web/src/lib/types.ts` — TypeScript types matching backend schemas
- `web/src/lib/structure-store.ts` — React context + reducer for structure state (nodes, elements, loads, load cases, combinations)
- `web/src/lib/api.ts` — API client functions
- `web/src/components/canvas/` — Konva-based structure drawing canvas
- `web/src/components/properties/` — properties panel (load case selector, section picker, load editor, combination editor)
- `web/src/components/results/` — results panel (reactions, design summary, force diagrams, combination selector)

## Load Combinations (BS EN 1990)

The app supports load cases (G, Q, W, S) and load combinations per BS EN 1990 UK NA. Key design decisions:

- **Superposition**: one OpenSees analysis per load case, then linearly combine factored results
- **Self-weight**: included only in the G (permanent) case via `Model.apply_self_weight()`
- **`include_self_weight` parameter**: `Model.analyze(include_self_weight=False)` prevents double-counting when self-weight is manually applied
- **Governing envelope**: for design, the ULS combination with highest `max(|M_i|, |M_j|)` governs each element
- **Backward compatibility**: when `load_cases` is `None` in the request, the legacy flat-load path is used unchanged
- **Preset combinations**: 4 ULS (6.10a, 6.10b variants) + 3 SLS (characteristic, frequent, quasi-permanent)
- **Frontend state**: loads are assigned to the active load case; canvas renders loads color-coded by case (G=blue, Q=red, W=green, S=purple)
