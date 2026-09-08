/** Application wiring: presets, editor, engine worker, graph view, stats,
 * URL state, playback, tooltips, the walkthrough, and exports. */

import { EngineClient, type EngineStage } from "./api.js";
import { describeRule, describeTerminal, plural, registersText } from "./describe.js";
import { MachineEditor } from "./editor.js";
import { GraphView, type HoverTarget } from "./graphview.js";
import { StatsPane } from "./stats.js";
import { Tooltip } from "./tooltip.js";
import { Tour, tourSeen } from "./tour.js";
import type { AppState, MachineDoc, PresetInfo, RuleJson, RunOk, RunParams } from "./types.js";
import { decodeState, writeStateToUrl } from "./urlstate.js";

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
  private firstRunDone = false;

  constructor() {
    this.engine = new EngineClient(
      new URL("public/wheels/mrm.whl", document.baseURI).toString(),
      (stage, detail) => this.showStage(stage, detail),
    );
    this.stats = new StatsPane(element("stats-body"), (node) => this.view.select(node));
    this.view = new GraphView(
      element("graph-host"),
      (node) => {
        if (this.lastRun) this.stats.show(this.lastRun, this.state.preset, node);
      },
      (target, event) => this.showGraphTip(target, event),
    );
    this.editor = new MachineEditor(element("editor-host"), this.state.doc, {
      onChange: () => {
        this.state.preset = this.state.preset === "custom" ? "custom" : null;
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

    window.addEventListener("hashchange", () => void this.applyHash());
    const fromUrl = await decodeState(location.hash);
    if (fromUrl) {
      this.applyState(fromUrl);
      await this.runAndRender();
    } else {
      await this.loadPreset("fibonacci");
    }
  }

  private applyState(state: AppState): void {
    this.state = state;
    this.state.params.analyze = true;
    element<HTMLSelectElement>("preset-select").value = this.state.preset ?? "";
    element("preset-description").textContent = this.state.doc.description ?? "";
    this.editor.setDocument(this.state.doc);
    this.syncParamInputs();
  }

  /** A pasted or back/forward link changes the hash without a reload. */
  private async applyHash(): Promise<void> {
    const state = await decodeState(location.hash);
    if (!state) return;
    this.applyState(state);
    await this.runAndRender();
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
    element<HTMLSelectElement>("preset-select").value = id;
    element("preset-description").textContent = doc.description ?? "";
    this.editor.setDocument(doc);
    this.syncParamInputs();
    await this.runAndRender();
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
    void writeStateToUrl(this.state);
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
    if (!result) return;
    if (!result.ok) {
      this.editor.setProblems(result.problems);
      this.stats.clear("Fix the highlighted problems and the graph will come back.");
      return;
    }
    this.editor.setProblems([]);
    this.lastRun = result;
    this.index = buildIndex(result);
    this.renderDiagrams(result);
    this.view.setEvolution(result.evolution, result.layout);
    this.editor.setRuleColors(this.view.ruleColors());
    this.renderRuleLegend();
    this.stats.show(result, this.state.preset, null);
    this.renderTable(result);
    this.setupSlider(result);
    if (this.branchialOn) await this.refreshBranchial();

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
    element("canvas-note").hidden = !this.view.usingCanvas;

    if (!this.firstRunDone) {
      this.firstRunDone = true;
      this.hideOverlay();
      if (!tourSeen()) window.setTimeout(() => this.tour.start(), 400);
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
    element<HTMLSelectElement>("preset-select").value = "";
    element("preset-description").textContent = doc.description ?? file.name;
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
    const overlay = element("engine-status");
    const busy = element("engine-busy");
    const runButton = element<HTMLButtonElement>("run-button");
    const cancelButton = element<HTMLButtonElement>("cancel-button");
    const working = stage === "working";
    runButton.disabled = working;
    runButton.textContent = working ? "running" : "run";
    cancelButton.disabled = !working;
    busy.hidden = !working || !this.firstRunDone;

    if (stage === "ready" && this.firstRunDone) {
      overlay.hidden = true;
      return;
    }
    if (stage === "ready") return;
    if (working && this.firstRunDone) return;

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

  private hideOverlay(): void {
    element("engine-status").hidden = true;
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
element("export-png").addEventListener("click", () => void app.downloadPng());
element("export-json").addEventListener("click", () => app.downloadJson());
void app.boot();
