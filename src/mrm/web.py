"""JSON glue between the engine and the explorer page.

The browser worker and the site build both call `run`, so the run that the
build stores for a preset is the same payload the page gets from the engine
once it has loaded. That lets the page draw a preset the moment it opens and
swap the live engine in underneath without the picture changing.
"""

from __future__ import annotations

import json
from typing import Any

from .analysis import absorption, absorption_time_distribution
from .counting import strongly_connected_components, successor_lists
from .evolve import Evolution, evolve
from .export import to_wl
from .figures import circle_plot_svg, rule_plot_svg
from .graph import branchial_graph
from .layout import layered_layout
from .machine import complexity
from .serialize import evolution_to_json, machine_from_json

# The settings the page starts every preset with. `mrm.weblink.app_state`
# uses the same values, and web/src/main.ts mirrors them.
DEFAULT_PARAMS: dict[str, Any] = {
    "mode": "states",
    "max_steps": 60,
    "max_states": 20_000,
    "max_frontier": 10_000,
    "analyze": True,
}

# Exact rational solves blow up on large cyclic components; past these sizes
# the page shows the evolution without the Markov-chain analysis.
MAX_ANALYSIS_NODES = 5000
MAX_ANALYSIS_COMPONENT = 250
MAX_DIAGRAM_INSTRUCTIONS = 40


def analysis_tractable(ev: Evolution) -> bool:
    """Whether the exact absorption analysis is cheap enough to run inline."""
    if len(ev.nodes) > MAX_ANALYSIS_NODES:
        return False
    succ = successor_lists(ev)
    components = strongly_connected_components(list(ev.nodes), succ)
    return all(len(component) <= MAX_ANALYSIS_COMPONENT for component in components)


def run(doc_text: str, params_text: str) -> tuple[dict[str, Any], Evolution | None]:
    """Evolve a machine document and build the payload the page renders.

    Returns the payload and the evolution (``None`` when the document or the
    settings were rejected, in which case the payload lists the problems).
    """
    params = json.loads(params_text)
    try:
        doc = machine_from_json(json.loads(doc_text))
    except (ValueError, KeyError, TypeError) as exc:
        return {"ok": False, "problems": [f"machine document: {exc}"]}, None
    problems = doc.machine.validate()
    if problems:
        return {"ok": False, "problems": problems}, None
    if doc.initial is None:
        return {"ok": False, "problems": ["no initial configuration set"]}, None
    try:
        ev = evolve(
            doc.machine,
            doc.initial,
            mode=params["mode"],
            max_steps=int(params["max_steps"]),
            max_states=int(params["max_states"]),
            max_frontier=int(params["max_frontier"]),
        )
    except ValueError as exc:
        return {"ok": False, "problems": [str(exc)]}, None

    payload: dict[str, Any] = {
        "ok": True,
        "evolution": evolution_to_json(ev),
        "layout": {str(node): [x, y] for node, (x, y) in layered_layout(ev).items()},
    }
    if params.get("analyze") and analysis_tractable(ev):
        try:
            result = absorption(ev)
            payload["absorption"] = {
                "terminals": {
                    str(node): str(p) for node, p in result.terminal_probabilities.items()
                },
                "halting": str(result.halting_probability),
                "never_halting": str(result.never_halting),
                "unresolved": str(result.unresolved),
                "expected_steps": None
                if result.expected_steps is None
                else str(result.expected_steps),
            }
            horizon = min(4 * len(ev.layers) + 12, 300)
            times = absorption_time_distribution(ev, horizon, exact=False)
            payload["absorption_times"] = {
                "probabilities": [float(p) for p in times.probabilities],
                "tail": float(times.tail),
            }
        except Exception as exc:  # the analysis is optional and must never sink a run
            payload["absorption_error"] = str(exc)
    instructions = doc.machine.instructions
    if instructions is not None:
        payload["complexity"] = complexity(instructions)
        if len(instructions) <= MAX_DIAGRAM_INSTRUCTIONS:
            payload["rule_plot"] = rule_plot_svg(instructions, doc.machine.n_registers)
            payload["circle_plot"] = circle_plot_svg(instructions, doc.machine.n_registers)
    return payload, ev


def branchial(ev: Evolution | None, step: int) -> dict[str, Any]:
    """Branchial ties at ``step`` as ``[a, b]`` pairs, empty when there are none."""
    if ev is None:
        return {"ok": False, "edges": []}
    try:
        graph = branchial_graph(ev, int(step))
    except ValueError:
        return {"ok": True, "edges": []}
    return {"ok": True, "edges": [[a, b] for a, b, _ in graph.edges]}


def wolfram_text(ev: Evolution | None) -> dict[str, Any]:
    """The evolution as a Wolfram Language association, for the WL export."""
    if ev is None:
        return {"ok": False, "text": ""}
    return {"ok": True, "text": to_wl(ev)}
