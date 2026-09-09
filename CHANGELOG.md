# Changelog

## 0.1.0

First public release.

- Engine: multiway evolution in tree and states modes with step, state, and
  frontier caps, ported from the Wolfram Function Repository resource
  `MultiwayRegisterMachine` and pinned to its recorded outputs by golden
  tests.
- Analysis: exact path counts with an explicit infinite sentinel and cycle
  witness, exact absorption probabilities and expected halting time, the
  full halting-time distribution, branchial graphs, reconvergence, causal
  data-dependency chains, and a random-machine ensemble study.
- Models: grid paths, Fibonacci recursion, three Collatz machines, and the
  paper's own polynomial, Fibonacci, halting, non-halting, and complete
  graph programs, all shipped as `machine.json` presets.
- Command line: `mrm run`, `verify`, `path`, `link`, `ensemble`, `export`,
  and `figure`.
- Explorer: a static site that runs the same package in the browser through
  Pyodide, with step playback, selection tracing, rule-colored graphs,
  hover explanations, a walkthrough, permalinks, embedding, and SVG, PNG,
  JSON, and Wolfram Language export.
