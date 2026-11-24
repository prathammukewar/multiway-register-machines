"""The JSON glue the explorer page and the site build share."""

import json

from mrm.presets import available_presets, load_preset
from mrm.serialize import machine_to_json
from mrm.web import DEFAULT_PARAMS, branchial, run, wolfram_text
from mrm.weblink import app_state


def _run_preset(name, **overrides):
    doc_text = json.dumps(machine_to_json(load_preset(name)))
    return run(doc_text, json.dumps({**DEFAULT_PARAMS, **overrides}))


def test_default_params_match_the_permalink_defaults():
    assert app_state(load_preset("simple"))["params"] == DEFAULT_PARAMS


def test_every_preset_runs_and_serializes():
    for name in available_presets():
        payload, ev = _run_preset(name)
        assert payload["ok"], name
        assert ev is not None
        assert len(payload["layout"]) == len(payload["evolution"]["nodes"])
        json.dumps(payload)


def test_runs_are_reproducible():
    first, _ = _run_preset("collatz")
    second, _ = _run_preset("collatz")
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)


def test_grid_paths_payload_carries_the_exact_analysis():
    payload, _ = _run_preset("grid_paths")
    assert payload["evolution"]["path_counts"] == {"16": 20}
    assert payload["absorption"]["expected_steps"] == "6"
    assert payload["absorption"]["never_halting"] == "0"
    assert abs(sum(payload["absorption_times"]["probabilities"]) - 1.0) < 1e-9


def test_instruction_machines_get_diagrams_and_complexity():
    payload, _ = _run_preset("simple")
    assert payload["complexity"] > 1
    assert payload["rule_plot"].startswith("<svg")
    assert payload["circle_plot"].startswith("<svg")
    rules_only, _ = _run_preset("grid_paths")
    assert "rule_plot" not in rules_only


def test_analysis_can_be_switched_off():
    payload, _ = _run_preset("grid_paths", analyze=False)
    assert "absorption" not in payload


def test_bad_documents_report_problems_instead_of_raising():
    payload, ev = run("{}", json.dumps(DEFAULT_PARAMS))
    assert ev is None
    assert payload["ok"] is False
    assert payload["problems"]


def test_missing_initial_configuration_is_a_problem():
    doc = machine_to_json(load_preset("grid_paths"))
    doc.pop("initial", None)
    payload, ev = run(json.dumps(doc), json.dumps(DEFAULT_PARAMS))
    assert ev is None
    assert payload["problems"] == ["no initial configuration set"]


def test_branchial_and_wolfram_text():
    _, ev = _run_preset("grid_paths")
    ties = branchial(ev, 1)
    assert ties["ok"] and ties["edges"] == [[2, 3]]
    assert branchial(ev, 999) == {"ok": True, "edges": []}
    assert branchial(None, 1) == {"ok": False, "edges": []}
    text = wolfram_text(ev)
    assert text["ok"] and text["text"].startswith('<|"Nodes"')
    assert wolfram_text(None) == {"ok": False, "text": ""}
