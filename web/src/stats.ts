/** The statistics pane: counts, growth chart, path counts, absorption, a
 * plain-language interpretation line for presets, and a card for the
 * selected state. Every figure carries a tooltip saying what it means. */

import { describeTerminal, plural, registersText } from "./describe.js";
import type { EvolutionJson, RunOk } from "./types.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const TILE_TIPS: Record<string, string> = {
  nodes:
    "Distinct configurations reached. In tree mode every path gets its own chips, " +
    "so this counts path prefixes instead.",
  edges:
    "Rule firings drawn as arrows. In states mode the same rule between the same two " +
    "states is drawn once.",
  steps: "How many steps deep the evolution went. It equals the max-steps cap when that cap fired.",
  "halt / stuck / cut":
    "Halt: reached a halting pc. Stuck: no rule applies. Cut: a cap stopped the run " +
    "before it could tell.",
  complexity:
    "The paper's branching complexity: the geometric mean over the program's instructions " +
    "of their average branch count. 1 is single-way; higher means more choice at each step.",
};

const SECTION_TIPS: Record<string, string> = {
  Growth: "How many states were first reached at each step. Hover a bar for the count.",
  "Paths to terminals":
    "How many distinct rule sequences lead from the start to each terminal state. " +
    "\"infinite\" means a cycle can be looped on the way.",
  "Halting time":
    "If every applicable rule is equally likely at each step, the chance that the run " +
    "halts at exactly that step.",
  "Uniform-branching chain (exact)":
    "Treat the evolution as a Markov chain where each state picks among its successors " +
    "uniformly. These are exact fractions, not estimates.",
};

function fibonacci(k: number): number {
  let a = 1;
  let b = 1;
  for (let i = 1; i < k; i += 1) [a, b] = [b, a + b];
  return a;
}

function binomial(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

function totalFinitePaths(evolution: EvolutionJson): number | null {
  let total = 0;
  for (const count of Object.values(evolution.path_counts)) {
    if (count === "infinite") return null;
    total += count;
  }
  return total;
}

/** Preset-specific one-liner tying the numbers to the closed form. */
export function interpretation(preset: string | null, evolution: EvolutionJson): string | null {
  const total = totalFinitePaths(evolution);
  if (preset === "fibonacci") {
    const k = evolution.parameters.initial[0]?.[1][0];
    if (k !== undefined && total !== null && total === fibonacci(k)) {
      return `paths to base cases: ${total} = F(${k})`;
    }
  }
  if (preset === "grid_paths" || preset === "custom") {
    let m = 0;
    let n = 0;
    for (const rule of evolution.machine.rules) {
      for (const condition of rule.guard) {
        if (condition.op === "<" && condition.reg === 1) m = condition.value;
        if (condition.op === "<" && condition.reg === 2) n = condition.value;
      }
    }
    if (m && n && total !== null && total === binomial(m + n, m)) {
      return `paths from (0,0) to (${m},${n}): ${total} = C(${m + n},${m})`;
    }
  }
  if (preset === "collatz_reverse") {
    const values = evolution.nodes.filter(
      ([, pc, registers]) => pc === 1 && registers[1] === 0,
    ).length;
    return `distinct Collatz-tree values reached: ${values}`;
  }
  return null;
}

/** Number of distinct paths from the start to each node, or null when the
 * graph has a cycle (then some counts would be infinite). */
export function pathsFromStart(evolution: EvolutionJson): Map<number, number> | null {
  const indegree = new Map<number, number>();
  const outgoing = new Map<number, number[]>();
  for (const [id] of evolution.nodes) indegree.set(id, 0);
  for (const [src, dst] of evolution.edges) {
    indegree.set(dst, (indegree.get(dst) ?? 0) + 1);
    const list = outgoing.get(src);
    if (list) list.push(dst);
    else outgoing.set(src, [dst]);
  }
  const counts = new Map<number, number>();
  const queue: number[] = [];
  for (const [id, degree] of indegree) {
    if (degree === 0) {
      queue.push(id);
      counts.set(id, 1);
    }
  }
  let seen = 0;
  while (queue.length) {
    const node = queue.shift() as number;
    seen += 1;
    const here = counts.get(node) ?? 0;
    for (const next of outgoing.get(node) ?? []) {
      counts.set(next, (counts.get(next) ?? 0) + here);
      const remaining = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }
  return seen === evolution.nodes.length ? counts : null;
}

export class StatsPane {
  constructor(
    private root: HTMLElement,
    private onSelectNode: (node: number | null) => void = () => {},
  ) {}

  clear(message: string): void {
    this.root.replaceChildren();
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = message;
    this.root.append(p);
  }

  show(result: RunOk, preset: string | null, selected: number | null): void {
    const evolution = result.evolution;
    this.root.replaceChildren();

    if (selected !== null) this.root.append(this.selectedCard(evolution, selected));

    const summary = document.createElement("dl");
    summary.className = "stat-grid";
    const kinds = { halt: 0, stuck: 0, cutoff: 0 };
    for (const kind of Object.values(evolution.terminals)) kinds[kind] += 1;
    const entries: [string, string][] = [
      ["nodes", String(evolution.nodes.length)],
      ["edges", String(evolution.edges.length)],
      ["steps", String(evolution.layers.length - 1)],
      ["halt / stuck / cut", `${kinds.halt} / ${kinds.stuck} / ${kinds.cutoff}`],
    ];
    if (result.complexity !== undefined) {
      entries.push(["complexity", result.complexity.toFixed(4)]);
    }
    for (const [term, value] of entries) {
      const tile = document.createElement("div");
      tile.tabIndex = 0;
      const tip = TILE_TIPS[term];
      if (tip) {
        tile.dataset["tipTitle"] = term;
        tile.dataset["tip"] = tip;
      }
      const dt = document.createElement("dt");
      dt.textContent = term;
      const dd = document.createElement("dd");
      dd.textContent = value;
      tile.append(dt, dd);
      summary.append(tile);
    }
    this.root.append(summary);

    const line = interpretation(preset, evolution);
    if (line) {
      const p = document.createElement("p");
      p.className = "interpretation";
      p.textContent = line;
      p.tabIndex = 0;
      p.dataset["tip"] =
        "The closed form this preset is known to produce. The count from the graph matches it.";
      this.root.append(p);
    }

    this.root.append(sectionTitle("Growth"), this.growthChart(evolution.growth_series));
    if (evolution.growth_series.length >= 4) this.root.append(oeisLink(evolution.growth_series));

    const counts = Object.entries(evolution.path_counts);
    if (counts.length) {
      this.root.append(sectionTitle("Paths to terminals"));
      const list = document.createElement("ul");
      list.className = "plain-list";
      const labelOf = new Map(
        evolution.nodes.map(([id, pc, registers]) => [id, `${pc} | ${registers.join(",")}`]),
      );
      for (const [id, count] of counts.slice(0, 12)) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "linkish";
        button.textContent = `${labelOf.get(Number(id)) ?? id}: ${count}`;
        button.dataset["tip"] = "Select this terminal state in the graph.";
        button.addEventListener("click", () => this.onSelectNode(Number(id)));
        item.append(button);
        list.append(item);
      }
      if (counts.length > 12) {
        const item = document.createElement("li");
        item.textContent = `and ${counts.length - 12} more`;
        list.append(item);
      }
      this.root.append(list);
    }

    if (result.absorption_times) {
      const times = result.absorption_times;
      const last = times.probabilities.map((p) => p > 1e-12).lastIndexOf(true);
      if (last >= 0) {
        this.root.append(
          sectionTitle("Halting time"),
          this.distributionChart(times.probabilities.slice(0, last + 1)),
        );
        if (times.tail > 1e-9) {
          const note = document.createElement("p");
          note.className = "muted small";
          note.textContent = `${(times.tail * 100).toFixed(1)}% of the mass never halts or was cut off`;
          this.root.append(note);
        }
      }
    }

    if (result.absorption) {
      const a = result.absorption;
      this.root.append(sectionTitle("Uniform-branching chain (exact)"));
      const list = document.createElement("ul");
      list.className = "plain-list";
      const rows: [string, string, string][] = [
        ["halting probability", a.halting, "Probability that a uniformly random walk ends at a halting state."],
        ["never halting", a.never_halting, "Probability that the walk stays in a cycle forever."],
      ];
      if (a.unresolved !== "0") {
        rows.push([
          "unresolved (capped)",
          a.unresolved,
          "Probability mass that reached a cut-off state, so the caps hid its fate.",
        ]);
      }
      if (a.expected_steps !== null) {
        rows.push([
          "expected steps",
          a.expected_steps,
          "Mean number of steps before the walk halts, given that it does.",
        ]);
      }
      for (const [label, value, tip] of rows) {
        const item = document.createElement("li");
        item.textContent = `${label}: ${value}`;
        item.dataset["tip"] = tip;
        item.tabIndex = 0;
        list.append(item);
      }
      this.root.append(list);
    }
  }

  private selectedCard(evolution: EvolutionJson, selected: number): HTMLElement {
    const card = document.createElement("section");
    card.className = "selected-card";
    card.setAttribute("aria-label", "Selected state");
    const node = evolution.nodes.find(([id]) => id === selected);
    if (!node) return card;
    const [, pc, registers] = node;
    const step = evolution.layers.findIndex((layer) => layer.includes(selected));
    const incoming = evolution.edges.filter(([, dst]) => dst === selected);
    const outgoing = evolution.edges.filter(([src]) => src === selected);
    const kind = evolution.terminals[String(selected)];
    const paths = pathsFromStart(evolution)?.get(selected);

    const head = document.createElement("div");
    head.className = "selected-head";
    const label = document.createElement("div");
    label.className = "selected-label";
    const badge = document.createElement("span");
    badge.className = "pc-badge";
    badge.textContent = String(pc);
    badge.dataset["tip"] = "Program counter";
    const regs = document.createElement("span");
    regs.className = "selected-regs";
    regs.textContent = registersText(registers);
    label.append(badge, regs);
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "quiet small-button";
    clear.textContent = "clear";
    clear.dataset["tip"] = "Deselect (or press Escape)";
    clear.addEventListener("click", () => this.onSelectNode(null));
    head.append(label, clear);
    card.append(head);

    const facts = document.createElement("ul");
    facts.className = "selected-facts";
    const items: string[] = [`state ${selected}, first reached at step ${step}`];
    if (paths !== undefined) {
      items.push(
        paths === 1
          ? "one path leads here from the start"
          : `${paths.toLocaleString()} distinct paths lead here from the start`,
      );
    }
    if (incoming.length) {
      const rules = [...new Set(incoming.map(([, , rule]) => rule))];
      items.push(
        `arrives by ${plural(incoming.length, "arrow")}: ${rules.join(", ")}`,
      );
    } else {
      items.push("this is the starting configuration");
    }
    if (outgoing.length) {
      const rules = [...new Set(outgoing.map(([, , rule]) => rule))];
      items.push(`leaves by ${plural(outgoing.length, "arrow")}: ${rules.join(", ")}`);
    }
    if (kind) items.push(describeTerminal(kind));
    for (const text of items) {
      const item = document.createElement("li");
      item.textContent = text;
      facts.append(item);
    }
    card.append(facts);

    const legend = document.createElement("p");
    legend.className = "muted small";
    legend.textContent =
      "In the graph: ancestors in orange, descendants outlined, the shortest route drawn thick.";
    card.append(legend);
    return card;
  }

  private distributionChart(probabilities: number[]): SVGSVGElement {
    const width = 260;
    const height = 72;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("class", "growth-chart");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      `Probability of halting at each step: ${probabilities
        .map((p) => p.toFixed(3))
        .join(", ")}`,
    );
    const top = Math.max(...probabilities, 1e-9);
    const barWidth = width / probabilities.length;
    probabilities.forEach((value, index) => {
      const bar = document.createElementNS(SVG_NS, "rect");
      const barHeight = Math.max(value > 0 ? 1.5 : 0.5, (value / top) * (height - 12));
      bar.setAttribute("x", String(index * barWidth + 1));
      bar.setAttribute("rx", "2");
      bar.setAttribute("y", String(height - barHeight));
      bar.setAttribute("width", String(Math.max(1, barWidth - 2)));
      bar.setAttribute("height", String(barHeight));
      bar.dataset["tip"] = `halts at step ${index}: ${(value * 100).toFixed(2)}%`;
      svg.append(bar);
    });
    return svg;
  }

  private growthChart(series: number[]): SVGSVGElement {
    const width = 260;
    const height = 80;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("class", "growth-chart");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Layer sizes per step: ${series.join(", ")}`);
    const top = Math.max(...series, 1);
    const barWidth = width / series.length;
    series.forEach((value, index) => {
      const bar = document.createElementNS(SVG_NS, "rect");
      const barHeight = Math.max(1, (value / top) * (height - 14));
      bar.setAttribute("x", String(index * barWidth + 1));
      bar.setAttribute("rx", "2");
      bar.setAttribute("y", String(height - barHeight));
      bar.setAttribute("width", String(Math.max(1, barWidth - 2)));
      bar.setAttribute("height", String(barHeight));
      bar.dataset["tip"] = `step ${index}: ${plural(value, "new state")}`;
      svg.append(bar);
    });
    return svg;
  }
}

/** A search link for the growth series, for anyone who recognizes it. */
function oeisLink(series: number[]): HTMLElement {
  const paragraph = document.createElement("p");
  paragraph.className = "muted small oeis";
  const link = document.createElement("a");
  link.href = `https://oeis.org/search?q=${series.join(",")}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "look this series up in the OEIS";
  link.dataset["tip"] =
    "Search the On-Line Encyclopedia of Integer Sequences for the growth series. Opens in a new tab.";
  paragraph.append(link);
  return paragraph;
}

function sectionTitle(text: string): HTMLHeadingElement {
  const heading = document.createElement("h3");
  heading.textContent = text;
  const tip = SECTION_TIPS[text];
  if (tip) {
    heading.dataset["tip"] = tip;
    heading.tabIndex = 0;
    heading.classList.add("has-tip");
  }
  return heading;
}
