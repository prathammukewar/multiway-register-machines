# Multiway Register Machines

[![CI](https://github.com/prathammukewar/multiway-register-machines/actions/workflows/ci.yml/badge.svg)](https://github.com/prathammukewar/multiway-register-machines/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue.svg)](pyproject.toml)

A register machine that may jump to several places at once no longer has
one next state. It has a graph of them. This package evolves that graph,
counts the paths through it exactly, works out halting probabilities as
exact fractions, and draws all of it, in plain Python with no dependencies
and in a browser page that runs the very same code.

It is the companion code for my Wolfram Summer Research Program article
["State Evolution in Multiway Register Machines Featuring Applications to
Recursive Functions"](https://community.wolfram.com/groups/-/m/t/3499350)
and a Mathematica-free port of the Wolfram Function Repository resource
[MultiwayRegisterMachine](https://resources.wolframcloud.com/FunctionRepository/resources/MultiwayRegisterMachine/).

**Try it in the browser:**
[prathammukewar.github.io/multiway-register-machines](https://prathammukewar.github.io/multiway-register-machines/).
Nothing to install. The page fetches a Python runtime once and then works
offline.

![The Fibonacci states graph revealing itself step by step](docs/figures/fibonacci-reveal.svg)

## Three things to look at first

Each link opens the explorer on that machine. Hover anything on the page for
an explanation, press play to watch the evolution unfold, and click a chip to
trace where it came from.

<table>
<tr>
<td width="33%" valign="top"><a href="https://prathammukewar.github.io/multiway-register-machines/#jVLLTsMwEPyVlU-tZJUklXqI4Iz4Ag5VFbnxklj4JXuNKFX_nXUCBw4gctodT2bGu74KHUbRX0UeZ3RK9MIld-fUOBuPd62QwiuHDD8moyEqmjNjGvOYTCQTPB89K_sKLyk42DQSmi1QgM1ewn4L5wsUbwgyYcyQzDQThAQl7uDJM6oIM7igEWjGRR7GUDxViYoQJme8smAynI0Pzii7OSzSD9A1u5pvSDgZNkhZ9J0UqVjk6ngVRnO4xZNpcRxqRNG3UkxFJb1Q-NcFCZGp90x7U7bwdfe3kxQl6prvB1GjJZ5SW89ZkkKt5ZdXiX8bdf816n4x4npWloY4VjJ3hofLI-GmlcdGNqfTjekqKZfrUutk2W-dM5s69T4sqxD9ofluV-uu4W-FOL4ng4kdV1DxBi4frESpYDVImJFYeOJHMayP4vYJ"><img src="docs/figures/grid-paths.svg" alt="States graph of the grid-paths machine"></a></td>
<td width="33%" valign="top"><a href="https://prathammukewar.github.io/multiway-register-machines/#tVLLasMwEPyVRacGnNZ2aQqB9tgv6K2EsJE3sYglGWndV8i_d-QQaD-gPki7M6Md7Von00Vr1ieTbS-ezdr45O88294FuWtMZQJ7AfzidjGwtY6S2CllFwPITrJNbtSSQXNzXNDymbAvm0U17-2CPpz2tOMsZLFkYqUjPVFDHLo5am_ptRfKygr6kHjsyUFHAy5BcU9tTSHCq6IvUVJow-R3kgrXuawuWKWRtc-kceZ_2aHSy01bL2C0elw93JaetkkOOCcpm3VTmTQNgujtZFyHPval79Fu9yn6mT9MnLqZx7kZiSN0z0_QvfMwYUD3501lprErLfxRdjIo5rpsigBFNQI-V1er9h-s2j9WiHsedDvaokbmglPHA5KmemvrzeYMNSf2uTwEj0HD8PIzYOr5c4tJjSBX9TW9WLc1vguE-wd1kmB4ATnw8PWNSpomKQZJsmjp-PqQzPkH"><img src="docs/figures/fibonacci-dag.svg" alt="States graph of the Fibonacci machine"></a></td>
<td width="33%" valign="top"><a href="https://prathammukewar.github.io/multiway-register-machines/#rZXditswEIVfZdBNd6m6azmO4wS2UPoKvTMhaG0lEUiykeTdZkPevSPnxzZNizckF2E0mvnOHCGsPSmrgiz2xBVboTlZEG31s-bFVhrxzAglhmuB6Z-VUtx_wINulJfvfEdhbSsNfiug5rWwj1hbCldYWXtZGWz5dd764uDcfiI_wQ8PAmOoykoLLyw4z72Ah7qADN6l34IVG-nCDgOha797BOnh1XKDkzrwFbxWWBX0Jwa-YhU3ZbvccvUmzQacKMIkFDbCCMt9yHGlQBqkKsFDkXsKFldnLUcWMSW2UQKjfE9kiT4kc-Eg6mIVHJMFo2TTcFu2FdjZ9lQ1Vn7HsjeuGjyw6LCkpKlLNOUGhaVQHs_5GwsFyPQVpg_0orUeqfXy8k-xDpx14HhoIu7A1wZll0H7c0463GSIm9yCSzpcMsQlt-BYh5sOcdNbcGmHS4e49O4XYNbTWo_U-uwFmA1NzO5uYtrTWo_U-qyJbGgi-wvMxppg103Me1rrkVqjTCR9cHxHcO-ezoenM___tY-vXvssxPgJ9au6OAlJ47xt2o9pyOQxZTSPlzTPlvjHaETzySVKLhG7RGmI2q7ZuatdTTsGruYYJPRUG7U7rbj0kivUzWge0elyecBZueXahXdLV2V4ntrXw6F5zX-v8Ete42YanZdH33GEv2MKz8d4KSxaPya54Wr3gSQ0KoKAFU54BBfHh4sc_gA"><img src="docs/figures/collatz-multiway.svg" alt="States graph of the paper's multiway Collatz machine"></a></td>
</tr>
<tr>
<td valign="top"><a href="https://prathammukewar.github.io/multiway-register-machines/#jVLLTsMwEPyVlU-tZJUklXqI4Iz4Ag5VFbnxklj4JXuNKFX_nXUCBw4gctodT2bGu74KHUbRX0UeZ3RK9MIld-fUOBuPd62QwiuHDD8moyEqmjNjGvOYTCQTPB89K_sKLyk42DQSmi1QgM1ewn4L5wsUbwgyYcyQzDQThAQl7uDJM6oIM7igEWjGRR7GUDxViYoQJme8smAynI0Pzii7OSzSD9A1u5pvSDgZNkhZ9J0UqVjk6ngVRnO4xZNpcRxqRNG3UkxFJb1Q-NcFCZGp90x7U7bwdfe3kxQl6prvB1GjJZ5SW89ZkkKt5ZdXiX8bdf816n4x4npWloY4VjJ3hofLI-GmlcdGNqfTjekqKZfrUutk2W-dM5s69T4sqxD9ofluV-uu4W-FOL4ng4kdV1DxBi4frESpYDVImJFYeOJHMayP4vYJ">Grid paths</a>. Walk from (0, 0) to (3, 3) by unit steps. Sixteen states, and exactly C(6, 3) = 20 paths through them.</td>
<td valign="top"><a href="https://prathammukewar.github.io/multiway-register-machines/#tVLLasMwEPyVRacGnNZ2aQqB9tgv6K2EsJE3sYglGWndV8i_d-QQaD-gPki7M6Md7Von00Vr1ieTbS-ezdr45O88294FuWtMZQJ7AfzidjGwtY6S2CllFwPITrJNbtSSQXNzXNDymbAvm0U17-2CPpz2tOMsZLFkYqUjPVFDHLo5am_ptRfKygr6kHjsyUFHAy5BcU9tTSHCq6IvUVJow-R3kgrXuawuWKWRtc-kceZ_2aHSy01bL2C0elw93JaetkkOOCcpm3VTmTQNgujtZFyHPval79Fu9yn6mT9MnLqZx7kZiSN0z0_QvfMwYUD3501lprErLfxRdjIo5rpsigBFNQI-V1er9h-s2j9WiHsedDvaokbmglPHA5KmemvrzeYMNSf2uTwEj0HD8PIzYOr5c4tJjSBX9TW9WLc1vguE-wd1kmB4ATnw8PWNSpomKQZJsmjp-PqQzPkH">Fibonacci recursion</a>. A line of twenty states that F(20) = 6765 distinct paths run through.</td>
<td valign="top"><a href="https://prathammukewar.github.io/multiway-register-machines/#rZXditswEIVfZdBNd6m6azmO4wS2UPoKvTMhaG0lEUiykeTdZkPevSPnxzZNizckF2E0mvnOHCGsPSmrgiz2xBVboTlZEG31s-bFVhrxzAglhmuB6Z-VUtx_wINulJfvfEdhbSsNfiug5rWwj1hbCldYWXtZGWz5dd764uDcfiI_wQ8PAmOoykoLLyw4z72Ah7qADN6l34IVG-nCDgOha797BOnh1XKDkzrwFbxWWBX0Jwa-YhU3ZbvccvUmzQacKMIkFDbCCMt9yHGlQBqkKsFDkXsKFldnLUcWMSW2UQKjfE9kiT4kc-Eg6mIVHJMFo2TTcFu2FdjZ9lQ1Vn7HsjeuGjyw6LCkpKlLNOUGhaVQHs_5GwsFyPQVpg_0orUeqfXy8k-xDpx14HhoIu7A1wZll0H7c0463GSIm9yCSzpcMsQlt-BYh5sOcdNbcGmHS4e49O4XYNbTWo_U-uwFmA1NzO5uYtrTWo_U-qyJbGgi-wvMxppg103Me1rrkVqjTCR9cHxHcO-ezoenM___tY-vXvssxPgJ9au6OAlJ47xt2o9pyOQxZTSPlzTPlvjHaETzySVKLhG7RGmI2q7ZuatdTTsGruYYJPRUG7U7rbj0kivUzWge0elyecBZueXahXdLV2V4ntrXw6F5zX-v8Ete42YanZdH33GEv2MKz8d4KSxaPya54Wr3gSQ0KoKAFU54BBfHh4sc_gA">Collatz, multiway</a>. The paper's machine explores the 3n + 1 section and the halving section at every branch point.</td>
</tr>
</table>

Two more from the paper: the [reverse Collatz tree](
https://prathammukewar.github.io/multiway-register-machines/#pVTbitswEP2VQVDYUjcbX9gHw_ZlH_oHfSnBKNZsLJAlo0vSbPC_d2Tn4tzYwBo_SDNHZ87R2LNjwtSs3DFXN9hyVrLWts8trxup8TllCdO8RQq_GaW4_wBvEeHJ4hqtw--UF-hqKzsvjSbYb2s24BuEM3zoNtwKeLemhbQEYcJSIXC9hTVXARNaCghaGMg1_IAUNg3qgWbIg3RQQGsEvAxIvjRrhGIGf4as89yjA25xOFIb_S5XwfIoicIeujpSSt8MeZLLfd2AxZV0Hi1g2_ntLFqtDjHHyixhNiik1d8dk4K8jbIJ19VVtMLKNGGrQM4Is0hY6EQUMm4I4w2x9Mn-dLSX6_TO8R2j0kPEdAT-9vpKwME8K4uEkfegAlG_RL4z6K8JsD9TcQIKVJ56-zPtT8qKozKxVDNliGwiLbsrbVJv_nm9g9rsGMz6W7cTNQij8TEN09u5EHEiz4_ktem2Vw7zK_bsUYfZLYcn29NbvhBxafG-iIcspkd230grrjwW97s4oc8_a2N-o423P6VRxqXL4quNpHXDla-6ep-RWnrJFW3ShN75YtETnFveujjM6HeJM2scDFSh5f8q-q07SqbZ_LAfC2VzesYQqdVeoiXUGOSaq-0HUXkbMFaw6NAPzRymW7Wfg6z_Dw), grown upward from 1, and the
[polynomial evaluator](https://prathammukewar.github.io/multiway-register-machines/#rVbLbtswEPwVgpcmLZtoSfkJpMeee-jNSAxGomICekGim6SB_7278kOUrQZEEMOwucvVzM7IWvONp1XCl2-8TTam0HzJi6a4LXSysaW5BS54qQuD6V9V_lpWhdU5ky8Pr-wbe2FXWVMVzG0Mq3VtmmusTk2bNLZ2tirxot_HrS8tq3uAAzx73NrcsQ6krp5NI1ib6Fzjty5TptP0hv2kzSsQ7EoKhu-oe6vra2Yd2-jctezZug2TX-WDwqYku2MwZ7ZkjXmyrTMNgxtSsT7GLV9OBG-2ucHV6o3bFBu10JLWOllTN3wJgj9tdZN2FXhld01VY-UPLPuj8y16Eu3uBd_WqXYHqGNhanKHVn4HKkBMV_Gl3IkTVxbIdXf3X7IeGKIeWQ5VyAtkCFUB4yqUx5UFcgWpmPfAaihCXQDLUBFyXETscWWBXEEipj1wPBQR98BjjapTo36fkx5uMoSbvA8Xj8J59246hJteyFahFqtxi2ceVxbIFWSx9xjNhiJm73siRz3x7th8CDe_6DMO9SQe92ThcWWBXGEToAdeDEUs3vcERj3xHkWIzsZi9OmuAPh0WShdmDHeTx7OJzx8xBvwx_jZtAX5IURvfMPZ6IPPn33gDT84G1IQf0iAooD-itd1cvDflq1rtgmdAiizmggQK3kvVhDd0yeFChdziiRFMS6mFCkRidWEVjGt1D6HFTMq3ddHh9qY8gsC3KNGB8QuD0A5ddoB2S-jEy8Qcb-B5V371uE5BTuntgURRgK3dihaN7po6cBUVCmdi1rXmSR4oV_WeL6ocXMaHcO9gTLC1z6FTpfOmoZufJfUpc5f_yISGmaIoDGtcQjcn5f47h8), which halts with 2·2³ + 2 = 18
in register 1.

## What a multiway register machine is

A register machine holds non-negative integers in a few registers and runs a
program of increment and decrement instructions, where a decrement on an
empty register takes a separate fail branch. A multiway register machine
makes one change: an instruction may list several jump targets instead of
one. The machine no longer has a single next state, so evolution produces a
graph of every reachable configuration, where an ordinary machine would
produce one sequence.

Two views of that evolution matter. The tree keeps every computational path
separate, so it grows as fast as the paths multiply. The states graph merges
configurations that coincide, which can collapse an exponential tree into
something small while the number of distinct paths through it stays
exponential. The Fibonacci model is the sharpest example: at k = 20 the
states graph is a line of 20 nodes, and the number of paths through it to
the base cases is F(20) = 6765.

## Install

```bash
pip install multiway-register-machines
```

The import name is `mrm`. To run the development version instead:

```bash
pip install git+https://github.com/prathammukewar/multiway-register-machines
```

The core package needs Python 3.10 or newer and nothing else: no NumPy, no
graph library, no Mathematica.

## Five lines of Python

```python
from mrm import Config, evolve, terminal_path_counts, absorption
from mrm.builders import grid_paths_machine

ev = evolve(grid_paths_machine(3, 3), Config(1, (0, 0)))
terminal_path_counts(ev)          # {16: 20}
absorption(ev).expected_steps     # Fraction(6, 1), exactly
```

Presets load by name, so the paper's machines are one call away:

```python
from mrm.presets import load_preset

doc = load_preset("collatz")
ev = evolve(doc.machine, doc.initial, max_steps=60)
len(ev.nodes), ev.growth_series()
```

## Command line

```bash
mrm run fibonacci --analyze        # evolve a preset, with exact halting stats
mrm verify                         # all model invariants, nonzero exit on failure
mrm path collatz_forward --to "8|0,1" --max-steps 2000   # shortest rule path
mrm link grid_paths                # a URL that reopens this machine in the explorer
mrm ensemble --count 200 --out study   # random machines: complexity vs branching
mrm export ev.json --format dot    # DOT, GraphML, WL, or evolution JSON
mrm figure all --out figures       # regenerate every figure, byte-identical
```

The formal model, written for a referee, is in
[docs/semantics.md](docs/semantics.md).

## What the analysis adds

Some of what is here goes further than the WFR resource:

* `mrm.absorption` treats every applicable rule as equally probable, which
  turns the states graph into a Markov chain, then solves that chain in
  exact rational arithmetic: the probability of halting in each terminal,
  the probability of running forever, and the exact expected number of
  steps. The WFR probability plots are the transient face of the same
  chain, and `mrm.probability_table` reproduces those tables as exact
  fractions.
* `mrm.absorption_time_distribution` gives the whole halting-time
  distribution exactly, step by step, and the explorer charts it. Its mean
  recovers the expected step count.
* Path counts respect rule multiplicity, and on cyclic graphs the affected
  nodes report an explicit infinite sentinel together with a concrete cycle
  witness, never a wrong number.
* `mrm.branchial_graph` connects same-layer states that share a parent, and
  `mrm.reconvergence` measures how often the two sides of a branch meet
  again, which is the property that decides whether state merging pays off.
* `mrm.causal_analysis` reads the data dependencies along a path: an event
  depends on the latest earlier event that wrote a register it reads. This
  separates the two reasons branches reconverge. Grid paths split into two
  independent chains, so merging happens because the updates commute;
  Fibonacci paths form one total chain, so merging is pure value collision.
* `mrm ensemble` samples seeded random machines and plots the paper's
  complexity measure against the branching their path trees actually
  realize.
* Figures come from a fixed-pass layered layout with no randomness, so the
  same evolution always renders to the same bytes.

## The models

Three models carry closed-form invariants that `mrm verify` checks against
the engine's own output:

* Grid paths walks from (0, 0) to (m, n) by unit steps right or up. The
  path count to the terminal must equal binomial(m + n, m), and the suite
  checks every m and n up to 8.
* Fibonacci recursion sends k to both k - 1 and k - 2, with base cases at
  1 and 2. The path count to the base cases must equal F(k), checked up to
  k = 20.
* Collatz comes in three flavors: the paper's multiway machine, which
  explores the 3n + 1 section and the halving section at every branch
  point; a deterministic variant whose parity test is written as modular
  guard rules; and a reverse machine that grows the Collatz tree upward
  from 1. The suite checks trajectories against the arithmetic map and the
  reverse tree against forward return.

The paper's own machines ship as presets too: the polynomial evaluator built
from `power`, `scalar`, and `add`, the Fibonacci adder, and the notebook's
halting, non-halting, and complete-graph examples. Presets are plain
`machine.json` files under `src/mrm/presets/`, so adding a model means
dropping in one file and listing its name in `PRESET_ORDER`.

## Parity with the Wolfram original

The engine was ported from the published source of the WFR resource, and its
behavior is pinned by golden tests to the evaluated outputs recorded in the
resource's definition notebook and the research notebook: frontier lists to
depth 15, state graphs up to 71 nodes with identical node numbering and edge
order, complexity values to full double precision, the Collatz trajectory of
101, and the paper's Fibonacci and polynomial machines. Every place the
original left semantics implicit is written down in
[ASSUMPTIONS.md](ASSUMPTIONS.md), and
[docs/porting-notes.md](docs/porting-notes.md) maps each Wolfram function to
its Python equivalent.

## Files and formats

Machines serialize to a versioned JSON format
([docs/machine.schema.json](docs/machine.schema.json)). Evolutions serialize
with their parameters, derived data, and a hash of the machine that produced
them ([docs/evolution.schema.json](docs/evolution.schema.json)), and export
to DOT, GraphML, and Wolfram Language text.

## The explorer

The site under `web/` is static and framework-free. It does not reimplement
any mathematics in JavaScript: a Web Worker loads Pyodide, installs the same
`mrm` wheel that CI builds, and every run on the page goes through the exact
code in this repository, so the site and the paper cannot disagree.

The page keeps the full machine and every evolution setting in the URL,
compressed, so any view can be cited by link and reproduced exactly. Step
playback reveals the evolution layer by layer, hovering a chip or an arrow
explains it, and selecting a state shows its ancestors, its descendants, and
the shortest path that reaches it. For machines in instruction form the page
also draws the program itself, the same rule and circle diagrams the WFR
resource plots. The current view exports as SVG, PNG, evolution JSON, or a
Wolfram Language association, and a copy-link button hands you the
reproduction URL.

### Embedding a live graph

Add `?embed` before the hash and the page shows only the graph, with a link
back to the full explorer. The hash comes from the copy-link button or from
`mrm link`.

```html
<iframe src="https://prathammukewar.github.io/multiway-register-machines/?embed#<hash>"
        width="100%" height="560" loading="lazy"
        title="Multiway register machine evolution"></iframe>
```

To work on the site locally: `npm install && npm run build` inside `web/`,
build a wheel with `python -m build`, then `python scripts/build_site.py`
and serve `web/dist` with any static file server. Releases are described in
[docs/releasing.md](docs/releasing.md).

## Citing

For the software, GitHub's "Cite this repository" button reads
[CITATION.cff](CITATION.cff). For the ideas, cite the article:

```bibtex
@misc{mukewar2025multiway,
  author       = {Mukewar, Pratham},
  title        = {State Evolution in Multiway Register Machines Featuring
                  Applications to Recursive Functions},
  year         = {2025},
  howpublished = {Wolfram Community, Wolfram Summer Research Program},
  url          = {https://community.wolfram.com/groups/-/m/t/3499350}
}
```

## License

MIT. See [LICENSE](LICENSE).
