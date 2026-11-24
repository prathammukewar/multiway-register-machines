/** Application wiring: presets, editor, engine worker, graph view, stats,
 * URL state, playback, tooltips, the walkthrough, and exports. */

import { EngineClient, type EngineStage } from "./api.js";
import { describeRule, describeTerminal, plural, registersText } from "./describe.js";
import { MachineEditor } from "./editor.js";
import { GraphView, type HoverTarget } from "./graphview.js";
import { StatsPane } from "./stats.js";
import { Tooltip } from "./tooltip.js";
import { Tour, tourSeen } from "./tour.js";
import type {
  AppState,
  MachineDoc,
  PresetInfo,
  RuleJson,
  RunOk,
  RunParams,
  RunResult,
} from "./types.js";
import { decodeState, presetNameFromHash, writeStateToUrl } from "./urlstate.js";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing #${id}`);
  return found as T;
}

const DEFAULT_PARAMS: RunParams = {
  mode: "states",
  max_steps: 60,
  max_states: 20000,
  max_frontier: 10000,
  analyze: true,
};

const LOADING_STAGES: EngineStage[] = ["loading-pyodide", "loading-engine", "working"];

/** `?embed` strips the page down to the graph for iframes in posts and notes. */
const EMBED = new URLSearchParams(location.search).has("embed");

/** One experiment worth trying for each preset, shown under its description. */
const TRY_NEXT: Record<string, string> = {
  grid_paths:
    "Change both guards from <3 to <4 and the path count becomes C(8,4) = 70. Switch to " +
    "tree mode to see all 20 paths drawn separately.",
  fibonacci:
    "Set the initial register to 10 and the paths to the base cases become F(10) = 55. " +
    "Hover either rule to see how its arrows braid with the other's.",
  collatz_reverse:
    "Raise max steps to 120 and the tree reaches ten values. Every chip at pc 1 with an " +
    "empty second register is a number whose Collatz trajectory ends at 1.",
  collatz:
    "Every chip is one interleaving of the 3n + 1 section and the halving section. Click " +
    "one near the bottom to thicken the shortest route to it, then turn on branchial ties.",
  collatz_forward:
    "Set the second register to 6 and max steps to 250. The values 6, 3, 10, 5, 16, 8, 4, " +
    "2, 1 then appear in register 2 at the odometer states: pc 8 with register 1 empty.",
  fibonacci_paper:
    "Raise max steps to 400 and read register 1 at each odometer state, pc 1 with " +
    "registers 3 and 4 empty: 1, 1, 2, 3, 5, 8, 13.",
  polynomial:
    "Register 1 is the coefficient, register 2 is x, and register 5 is y. Raise max steps " +
    "to 600, set y to 4, and the machine stops with 2·2⁴ + 2 = 34 in register 1.",
  simple:
    "The notebook's warm-up. Nothing ever halts here, so watch the growth chart instead: " +
    "the frontier keeps widening step after step.",
  complete_graph:
    "Every instruction can jump to every other, so the control graph is complete. Open the " +
    "program diagrams below the rules and the circle plot shows every pair joined.",
  halting:
    "Some branches get stuck (gold chips) while others run on. The statistics pane gives " +
    "the exact odds that a uniformly random run halts, and when.",
  non_halting:
    "One changed fail branch, and nothing ever halts. Compare the halting probability " +
    "with the halting machine's, then find the branch in the rules.",
  custom:
    "An editable copy of grid paths. Add a third register, or add a rule that jumps back " +
    "to pc 1, and see what the path counts say about the cycle.",
};

/** Lookups built once per run so hover cards are instant. */
interface RunIndex {
  layerOf: Map<number, number>;
  incoming: Map<number, string[]>;
  outgoing: Map<number, string[]>;
  ruleById: Map<string, RuleJson>;
}

class App {
  private engine: EngineClient;
  private editor: MachineEditor;
  private view: GraphView;
  private stats: StatsPane;
  private tooltip = new Tooltip();
  private tour = new Tour();
  private presets: PresetInfo[] = [];
  private state: AppState = {
    doc: emptyDoc(),
    params: { ...DEFAULT_PARAMS },
    preset: null,
  };
  private lastRun: RunOk | null = null;
  private index: RunIndex | null = null;
  private playTimer: number | null = null;
  private branchialOn = false;
  private firstPaintDone = false;
  private stage: EngineStage = "loading-pyodide";
  private stageDetail: string | undefined;
  /** True while the machine is exactly a preset's file, untouched. */
  private docPristine = false;
  /** True while the graph on screen is a preset's precomputed run. */
  private precomputedShown = false;
  private runTicket = 0;
  /** The preset this machine started from, kept through edits so the
   * closed-form line still shows whenever the edited machine satisfies it. */
  private basePreset: string | null = null;
  /** True once the engine has failed to start; presets still open without it. */
  private engineDown = false;

  constructor() {
    this.engine = new EngineClient(
      new URL("public/wheels/mrm.whl", document.baseURI).toString(),
      (stage, detail) => this.showStage(stage, detail),
    );
    this.stats = new StatsPane(element("stats-body"), (node) => this.view.select(node));
    this.view = new GraphView(
      element("graph-host"),
      (node) => {
        if (this.lastRun) this.stats.show(this.lastRun, this.basePreset, node);
      },
      (target, event) => this.showGraphTip(target, event),
    );
    this.editor = new MachineEditor(element("editor-host"), this.state.doc, {
      onChange: () => {
        this.state.preset = this.state.preset === "custom" ? "custom" : null;
        this.docPristine = false;
        void this.runAndRender();
      },
      onHoverRule: (id) => this.view.highlightRule(id),
    });
  }

  async boot(): Promise<void> {
    const meta = (await fetchJson("public/site-meta.json")) as { wheel: string };
    this.engine = new EngineClient(
      new URL(`public/wheels/${meta.wheel}`, document.baseURI).toString(),
      (stage, detail) => this.showStage(stage, detail),
    );
    this.engine.start();
    this.presets = (await fetchJson("public/presets/manifest.json")) as PresetInfo[];
    this.fillPresetDropdown();

    window.addEventListener("hashchange", () => void this.openFromHash(false));
    await this.openFromHash(true);
  }

  /** Open whatever the address names: a preset by name (`#fibonacci`), a
   * full compressed state, or, on first load with neither, the default. */
  private async openFromHash(initial: boolean): Promise<void> {
    const name = presetNameFromHash(location.hash);
    if (name && this.presets.some((preset) => preset.id === name)) {
      await this.loadPreset(name);
      return;
    }
    const state = await decodeState(location.hash);
    if (state) {
      this.applyState(state);
      await this.matchPreset();
      await this.runAndRender();
      return;
    }
    if (initial) await this.loadPreset("fibonacci");
  }

  /** A full link may still describe an untouched preset; if so, treat it as
   * one, which gives it the short address and the instant first draw. */
  private async matchPreset(): Promise<void> {
    this.docPristine = false;
    const id = this.state.preset;
    if (!id || !this.presets.some((preset) => preset.id === id)) return;
    try {
      const doc = await fetchJson(`public/presets/${id}.json`);
      this.docPristine = canonical(doc) === canonical(this.state.doc);
    } catch {
      // Leave it as an edited machine; the full link still reproduces it.
    }
  }

  /** The preset name to use as the address, or null for an edited machine. */
  private shortName(): string | null {
    const id = this.state.preset;
    if (!id || !this.docPristine) return null;
    const params = this.state.params;
    const untouched =
      params.mode === DEFAULT_PARAMS.mode &&
      params.max_steps === DEFAULT_PARAMS.max_steps &&
      params.max_states === DEFAULT_PARAMS.max_states &&
      params.max_frontier === DEFAULT_PARAMS.max_frontier;
    return untouched ? id : null;
  }

  private applyState(state: AppState): void {
    this.state = state;
    this.basePreset = state.preset;
    this.state.params.analyze = true;
    element<HTMLSelectElement>("preset-select").value = this.state.preset ?? "";
    element("preset-description").textContent = this.state.doc.description ?? "";
    this.showTryHint(this.state.preset);
    this.editor.setDocument(this.state.doc);
    this.syncParamInputs();
  }

  private fillPresetDropdown(): void {
    const select = element<HTMLSelectElement>("preset-select");
    select.replaceChildren();
    const edited = document.createElement("option");
    edited.value = "";
    edited.textContent = "edited machine";
    edited.disabled = true;
    edited.hidden = true;
    select.append(edited);
    for (const preset of this.presets) {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.name;
      select.append(option);
    }
    select.addEventListener("change", () => void this.loadPreset(select.value));
  }

  private async loadPreset(id: string): Promise<void> {
    const doc = (await fetchJson(`public/presets/${id}.json`)) as MachineDoc;
    this.state = { doc, params: { ...DEFAULT_PARAMS }, preset: id };
    this.docPristine = true;
    this.basePreset = id;
    element<HTMLSelectElement>("preset-select").value = id;
    element("preset-description").textContent = doc.description ?? "";
    this.showTryHint(id);
    this.editor.setDocument(doc);
    this.syncParamInputs();
    await this.runAndRender();
  }

  private showTryHint(preset: string | null): void {
    const hint = element("preset-try");
    const text = preset ? TRY_NEXT[preset] : undefined;
    hint.hidden = !text;
    hint.replaceChildren();
    if (!text) return;
    const label = document.createElement("span");
    label.className = "try-label";
    label.textContent = "Try";
    hint.append(label, text);
  }

  /** The embed view links back to the full page on the same state. */
  private updateFullLink(): void {
    const full = new URL(location.href);
    full.search = "";
    element<HTMLAnchorElement>("open-full").href = full.toString();
  }

  private syncParamInputs(): void {
    element<HTMLSelectElement>("mode-select").value = this.state.params.mode;
    element<HTMLInputElement>("max-steps").value = String(this.state.params.max_steps);
    element<HTMLInputElement>("max-states").value = String(this.state.params.max_states);
    element<HTMLInputElement>("max-frontier").value = String(this.state.params.max_frontier);
  }

  private readParamInputs(): void {
    this.state.params.mode =
      element<HTMLSelectElement>("mode-select").value === "tree" ? "tree" : "states";
    this.state.params.max_steps = readInt("max-steps", this.state.params.max_steps);
    this.state.params.max_states = readInt("max-states", this.state.params.max_states);
    this.state.params.max_frontier = readInt("max-frontier", this.state.params.max_frontier);
  }

  async runAndRender(): Promise<void> {
    this.readParamInputs();
    this.stopPlayback();
    this.tooltip.hide();
    const ticket = ++this.runTicket;
    const short = this.shortName();
    void writeStateToUrl(this.state, short).then(() => this.updateFullLink());
    // An untouched preset can be drawn at once from the run the site build
    // stored for it; the engine catches up underneath.
    if (short && !this.engine.isReady) await this.showPrecomputed(short, ticket);
    const result = await this.engine
      .run(JSON.stringify(this.state.doc), this.state.params)
      .catch((error: Error) => {
        if (error.message === "cancelled") {
          this.showBanner("Cancelled; the engine restarted and is ready.", "warning");
        } else {
          this.showBanner(`engine error: ${error.message}`, "error");
        }
        return null;
      });
    // A newer run was asked for while this one was in flight; let it win.
    if (!result || ticket !== this.runTicket) return;
    if (!result.ok) {
      this.editor.setProblems(result.problems);
      this.stats.clear("Fix the highlighted problems and the graph will come back.");
      return;
    }
    this.editor.setProblems([]);
    if (this.precomputedShown && this.lastRun && sameEvolution(result, this.lastRun)) {
      // The engine agrees with what is on screen: keep the view as it is.
      this.precomputedShown = false;
      this.lastRun = result;
      this.index = buildIndex(result);
      if (this.branchialOn) void this.refreshBranchial();
      return;
    }
    this.precomputedShown = false;
    this.render(result);
  }

  private async showPrecomputed(id: string, ticket: number): Promise<void> {
    try {
      const stored = (await fetchJson(`public/runs/${id}.json`)) as RunResult;
      // The engine may have come up, or the user moved on, while this loaded.
      if (!stored.ok || this.engine.isReady || ticket !== this.runTicket) return;
      this.render(stored);
      this.precomputedShown = true;
    } catch {
      // No stored run for this preset: the engine draws it when it is ready.
    }
  }

  private render(result: RunOk): void {
    this.lastRun = result;
    this.index = buildIndex(result);
    this.renderDiagrams(result);
    this.view.setEvolution(result.evolution, result.layout);
    this.editor.setRuleColors(this.view.ruleColors());
    this.renderRuleLegend();
    this.stats.show(result, this.basePreset, null);
    this.renderTable(result);
    this.setupSlider(result);
    if (this.branchialOn) void this.refreshBranchial();

    const evolution = result.evolution;
    if (evolution.truncated) {
      const knob = {
        max_steps: "max steps",
        max_states: "max states",
        max_frontier: "max frontier",
      }[evolution.truncation_reason ?? ""];
      this.showBanner(
        `Stopped early by the ${knob ?? "caps"} setting: this is the start of the` +
          ` evolution, not all of it. Raise ${knob ?? "the caps"} to see more.`,
        "warning",
      );
    } else {
      this.hideBanner();
    }
    if (this.engineDown) this.showEngineDown();
    element("canvas-note").hidden = !this.view.usingCanvas;

    if (!this.firstPaintDone) {
      this.firstPaintDone = true;
      this.showStage(this.stage, this.stageDetail);
      if (!tourSeen() && !EMBED) window.setTimeout(() => this.tour.start(), 400);
    }
  }

  private showGraphTip(target: HoverTarget | null, event: MouseEvent): void {
    if (!target || !this.lastRun || !this.index) {
      this.tooltip.hide();
      return;
    }
    const evolution = this.lastRun.evolution;
    if (target.kind === "node") {
      const node = evolution.nodes.find(([id]) => id === target.id);
      if (!node) return;
      const [id, pc, registers] = node;
      const step = this.index.layerOf.get(id) ?? 0;
      const incoming = this.index.incoming.get(id) ?? [];
      const outgoing = this.index.outgoing.get(id) ?? [];
      const lines = [`pc ${pc}, ${registersText(registers)}`];
      const inText = incoming.length
        ? `${plural(incoming.length, "arrow")} in (${[...new Set(incoming)].join(", ")})`
        : "the start";
      const outText = outgoing.length
        ? `${plural(outgoing.length, "arrow")} out`
        : "no arrows out";
      lines.push(`${inText}, ${outText}`);
      const terminal = describeTerminal(evolution.terminals[String(id)]);
      if (terminal) lines.push(terminal);
      lines.push(
        this.view.selectedNode === id
          ? "Click again to clear the selection."
          : "Click to trace where it came from and where it leads.",
      );
      this.tooltip.showAt(event.clientX, event.clientY, `state ${id}, step ${step}`, lines);
      return;
    }
    const edge = evolution.edges[target.index];
    if (!edge) return;
    const [src, dst, ruleId] = edge;
    const rule = this.index.ruleById.get(ruleId);
    const lines = [rule ? describeRule(rule) : "Rule details are not available."];
    lines.push(src === dst ? `state ${src} loops back to itself` : `state ${src} to state ${dst}`);
    this.tooltip.showAt(event.clientX, event.clientY, `rule ${ruleId}`, lines);
  }

  private setupSlider(result: RunOk): void {
    const slider = element<HTMLInputElement>("step-slider");
    const last = result.evolution.layers.length - 1;
    slider.max = String(last);
    slider.value = String(last);
    element("step-readout").textContent = `step ${last} / ${last}`;
    slider.oninput = () => {
      const step = Number(slider.value);
      element("step-readout").textContent = `step ${step} / ${last}`;
      this.view.setStep(step, true);
      if (this.branchialOn) void this.refreshBranchial();
    };
  }

  private async refreshBranchial(): Promise<void> {
    const step = Number(element<HTMLInputElement>("step-slider").value);
    const edges = await this.engine.branchial(step);
    this.view.setBranchial(edges);
    this.view.setStep(step);
  }

  togglePlayback(): void {
    if (this.playTimer !== null) {
      this.stopPlayback();
      return;
    }
    const slider = element<HTMLInputElement>("step-slider");
    if (slider.value === slider.max) slider.value = "0";
    element("play-button").textContent = "pause";
    this.playTimer = window.setInterval(() => {
      const next = Number(slider.value) + 1;
      if (next > Number(slider.max)) {
        this.stopPlayback();
        return;
      }
      slider.value = String(next);
      slider.dispatchEvent(new Event("input"));
    }, 650);
  }

  private stopPlayback(): void {
    if (this.playTimer !== null) {
      clearInterval(this.playTimer);
      this.playTimer = null;
    }
    element("play-button").textContent = "play";
  }

  async toggleBranchial(on: boolean): Promise<void> {
    this.branchialOn = on;
    if (on) await this.refreshBranchial();
    else {
      this.view.setBranchial([]);
    }
  }

  private renderRuleLegend(): void {
    const legend = element("rule-legend");
    legend.replaceChildren();
    const colors = this.view.ruleColors();
    let overflow = 0;
    for (const [ruleId, slot] of colors) {
      if (slot < 0) {
        overflow += 1;
        continue;
      }
      const item = document.createElement("li");
      item.className = "legend-rule";
      item.tabIndex = 0;
      const rule = this.index?.ruleById.get(ruleId);
      item.dataset["tipTitle"] = ruleId;
      item.dataset["tip"] = rule ? describeRule(rule) : "";
      const swatch = document.createElement("span");
      swatch.className = `swatch rule-${slot}`;
      const code = document.createElement("code");
      code.textContent = ruleId;
      item.append(swatch, code);
      const light = () => this.view.highlightRule(ruleId);
      const unlight = () => this.view.highlightRule(null);
      item.addEventListener("mouseenter", light);
      item.addEventListener("mouseleave", unlight);
      item.addEventListener("focus", light);
      item.addEventListener("blur", unlight);
      legend.append(item);
    }
    if (overflow) {
      const item = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      item.append(swatch, `${overflow} more rules in gray`);
      item.dataset["tip"] = "Only the first eight rules get their own color.";
      legend.append(item);
    }
    legend.hidden = colors.size === 0 || this.view.usingCanvas;
  }

  private renderDiagrams(result: RunOk): void {
    const details = element<HTMLDetailsElement>("diagrams");
    const host = element("diagram-host");
    if (result.rule_plot || result.circle_plot) {
      details.hidden = false;
      host.innerHTML = (result.rule_plot ?? "") + (result.circle_plot ?? "");
    } else {
      details.hidden = true;
      host.replaceChildren();
    }
  }

  async copyLink(): Promise<void> {
    const button = element("copy-link");
    try {
      await navigator.clipboard.writeText(location.href);
      button.textContent = "copied";
    } catch {
      button.textContent = "copy failed";
    }
    window.setTimeout(() => {
      button.textContent = "copy link";
    }, 1300);
  }

  async importDocument(file: File): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      this.showBanner(`${file.name} is not valid JSON`, "error");
      return;
    }
    const doc = parsed as MachineDoc;
    if (doc?.schema !== "mrm/machine/1") {
      this.showBanner(
        `${file.name} is not a machine document (expected schema mrm/machine/1)`,
        "error",
      );
      return;
    }
    this.state = { doc, params: { ...DEFAULT_PARAMS }, preset: null };
    this.docPristine = false;
    this.basePreset = null;
    element<HTMLSelectElement>("preset-select").value = "";
    element("preset-description").textContent = doc.description ?? file.name;
    this.showTryHint(null);
    this.editor.setDocument(doc);
    this.syncParamInputs();
    await this.runAndRender();
  }

  zoom(factor: number): void {
    this.view.zoomBy(factor);
  }

  fit(): void {
    this.view.fitView();
  }

  clearSelection(): boolean {
    if (this.view.selectedNode === null) return false;
    this.view.select(null);
    return true;
  }

  startTour(): void {
    this.tooltip.hide();
    this.tour.start();
  }

  get tourRunning(): boolean {
    return this.tour.running;
  }

  hideTooltip(): void {
    this.tooltip.hide();
  }

  nudgeStep(delta: number): void {
    const slider = element<HTMLInputElement>("step-slider");
    const next = Number(slider.value) + delta;
    if (next < 0 || next > Number(slider.max)) return;
    slider.value = String(next);
    slider.dispatchEvent(new Event("input"));
  }

  private renderTable(result: RunOk): void {
    const host = element("table-host");
    host.replaceChildren();
    const table = document.createElement("table");
    table.createCaption().textContent = "States (text view). Click a row to select it.";
    const head = table.createTHead().insertRow();
    for (const title of ["id", "step", "pc", "registers", "terminal"]) {
      const cell = document.createElement("th");
      cell.textContent = title;
      head.append(cell);
    }
    const body = table.createTBody();
    for (const [id, pc, registers] of result.evolution.nodes.slice(0, 500)) {
      const row = body.insertRow();
      row.tabIndex = 0;
      row.className = "state-row";
      for (const value of [
        id,
        this.index?.layerOf.get(id) ?? "",
        pc,
        registers.join(", "),
        result.evolution.terminals[String(id)] ?? "",
      ]) {
        row.insertCell().textContent = String(value);
      }
      const pick = () => this.view.select(this.view.selectedNode === id ? null : id);
      row.addEventListener("click", pick);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          pick();
        }
      });
    }
    host.append(table);
    if (result.evolution.nodes.length > 500) {
      const note = document.createElement("p");
      note.className = "muted";
      note.textContent = `showing the first 500 of ${result.evolution.nodes.length} states`;
      host.append(note);
    }
  }

  private showStage(stage: EngineStage, detail?: string): void {
    this.stage = stage;
    this.stageDetail = detail;
    const overlay = element("engine-status");
    const busy = element("engine-busy");
    const runButton = element<HTMLButtonElement>("run-button");
    const cancelButton = element<HTMLButtonElement>("cancel-button");
    const working = stage === "working";
    const loading = stage === "loading-pyodide" || stage === "loading-engine";
    runButton.disabled = working;
    runButton.textContent = working ? "running" : "run";
    cancelButton.disabled = !working;

    if (this.firstPaintDone) {
      // A graph is on screen: never cover it, just say what the engine is doing.
      overlay.hidden = true;
      busy.hidden = !(working || loading);
      element("engine-busy-text").textContent = loading ? "starting the engine" : "evolving";
      if (stage === "failed") {
        this.engineDown = true;
        this.showEngineDown();
      }
      return;
    }
    busy.hidden = true;
    if (stage === "ready") return;

    overlay.hidden = false;
    overlay.classList.toggle("error", stage === "failed");
    const title = element("loading-title");
    const note = element("loading-detail");
    if (stage === "failed") {
      title.textContent = "The engine could not start";
      note.textContent = detail ?? "unknown error";
      return;
    }
    title.textContent = working ? "Almost there" : "Starting the engine";
    note.textContent = "";
    const position = LOADING_STAGES.indexOf(stage);
    for (const item of overlay.querySelectorAll<HTMLElement>("[data-stage]")) {
      const own = LOADING_STAGES.indexOf(item.dataset["stage"] as EngineStage);
      item.classList.toggle("done", own < position);
      item.classList.toggle("active", own === position);
    }
  }

  /** Say plainly that the engine is unavailable, without the Python traceback. */
  private showEngineDown(): void {
    const lines = (this.stageDetail ?? "").trim().split("\n");
    const reason = (lines[lines.length - 1] ?? "").slice(0, 120);
    this.showBanner(
      "The Python engine could not start, so edits will not run. The presets still open, " +
        `and reloading the page usually fixes it.${reason ? ` (${reason})` : ""}`,
      "error",
    );
  }

  private showBanner(text: string, kind: "warning" | "error"): void {
    const banner = element("banner");
    banner.hidden = false;
    banner.textContent = text;
    banner.className = `banner ${kind}`;
  }

  private hideBanner(): void {
    element("banner").hidden = true;
  }

  cancel(): void {
    this.engine.cancel();
    this.showBanner("Cancelled; the engine is restarting.", "warning");
  }

  downloadJson(): void {
    if (!this.lastRun) return;
    download(
      JSON.stringify(this.lastRun.evolution, null, 1),
      "evolution.json",
      "application/json",
    );
  }

  downloadSvg(): void {
    const text = this.view.exportSvg();
    if (text) download(text, "evolution.svg", "image/svg+xml");
  }

  async downloadWl(): Promise<void> {
    const text = await this.engine.wl();
    if (text) download(text, "evolution.wl", "text/plain");
  }

  async downloadPng(): Promise<void> {
    const blob = await this.view.exportPng();
    if (blob) downloadBlob(blob, "evolution.png");
  }
}

function buildIndex(result: RunOk): RunIndex {
  const evolution = result.evolution;
  const layerOf = new Map<number, number>();
  evolution.layers.forEach((layer, index) => {
    for (const node of layer) layerOf.set(node, index);
  });
  const incoming = new Map<number, string[]>();
  const outgoing = new Map<number, string[]>();
  for (const [src, dst, rule] of evolution.edges) {
    push(incoming, dst, rule);
    push(outgoing, src, rule);
  }
  const ruleById = new Map(evolution.machine.rules.map((rule) => [rule.id, rule]));
  return { layerOf, incoming, outgoing, ruleById };
}

/** Whether two runs describe the same evolution, state for state. */
function sameEvolution(a: RunOk, b: RunOk): boolean {
  return JSON.stringify(a.evolution) === JSON.stringify(b.evolution);
}

/** JSON with object keys sorted, so two documents compare by content. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (inner === null || typeof inner !== "object" || Array.isArray(inner)) return inner;
    const entries = Object.entries(inner as Record<string, unknown>);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries);
  });
}

/** On a narrow screen the graph comes first, so the preset picker moves to
 * sit above it and the preset's description sits right under it. */
function placePresetControls(): void {
  if (EMBED) return;
  const narrow = window.matchMedia("(max-width: 960px)");
  const row = element("preset-row");
  const about = element("preset-about");
  const apply = (): void => {
    if (narrow.matches) {
      element("graph-pane").prepend(row);
      element("graph-host").after(about);
    } else {
      element("editor-host").before(row, about);
    }
  };
  narrow.addEventListener("change", apply);
  apply();
}

function push(map: Map<number, string[]>, key: number, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function emptyDoc(): MachineDoc {
  return {
    schema: "mrm/machine/1",
    n_registers: 1,
    rules: [],
    halt_pcs: [],
    initial: [1, [0]],
  };
}

async function fetchJson(path: string): Promise<unknown> {
  // no-cache still allows 304 revalidation; it only forbids silent staleness.
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function readInt(id: string, fallback: number): number {
  const value = Number(element<HTMLInputElement>(id).value);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function download(text: string, filename: string, type: string): void {
  downloadBlob(new Blob([text], { type }), filename);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

if (EMBED) document.body.classList.add("embed");
placePresetControls();
const app = new App();
element("run-button").addEventListener("click", () => void app.runAndRender());
element("cancel-button").addEventListener("click", () => app.cancel());
for (const id of ["mode-select", "max-steps", "max-states", "max-frontier"]) {
  element(id).addEventListener("change", () => void app.runAndRender());
}
element("play-button").addEventListener("click", () => app.togglePlayback());
element<HTMLInputElement>("branchial-toggle").addEventListener("change", (event) => {
  void app.toggleBranchial((event.target as HTMLInputElement).checked);
});
element<HTMLInputElement>("table-toggle").addEventListener("change", (event) => {
  element("table-host").hidden = !(event.target as HTMLInputElement).checked;
});
element("copy-link").addEventListener("click", () => void app.copyLink());
element("tour-button").addEventListener("click", (event) => {
  event.preventDefault();
  app.startTour();
});
element("import-button").addEventListener("click", () => element("import-file").click());
element<HTMLInputElement>("import-file").addEventListener("change", (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void app.importDocument(file);
  (event.target as HTMLInputElement).value = "";
});
document.addEventListener("keydown", (event) => {
  if (app.tourRunning) return;
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (event.key === "Escape") {
    if (target?.closest("input, select, textarea")) {
      target.blur();
      return;
    }
    app.clearSelection();
    return;
  }
  if (target?.closest("input, select, textarea, [contenteditable]")) return;
  if (event.key === " ") {
    event.preventDefault();
    app.togglePlayback();
  } else if (event.key === "ArrowRight") {
    app.nudgeStep(1);
  } else if (event.key === "ArrowLeft") {
    app.nudgeStep(-1);
  }
});
element("zoom-in").addEventListener("click", () => app.zoom(1.25));
element("zoom-out").addEventListener("click", () => app.zoom(0.8));
element("zoom-fit").addEventListener("click", () => app.fit());
element("graph-host").addEventListener("pointerdown", () => app.hideTooltip());
element("graph-host").addEventListener("wheel", () => app.hideTooltip(), { passive: true });
element("graph-host").addEventListener("keydown", (event) => {
  if (event.key === "+" || event.key === "=") app.zoom(1.25);
  else if (event.key === "-") app.zoom(0.8);
  else if (event.key === "0") app.fit();
  else return;
  event.preventDefault();
});
element("export-svg").addEventListener("click", () => app.downloadSvg());
element("export-wl").addEventListener("click", () => void app.downloadWl());
element("export-png").addEventListener("click", () => void app.downloadPng());
element("export-json").addEventListener("click", () => app.downloadJson());
void app.boot();
