/** The machine editor: an editable rule table plus machine-level inputs.
 * Guards and updates use a compact text syntax that round-trips with the
 * JSON document:
 *   guard    "r1>0 & r2%2==1"     (comparisons: > >= == < and r%k==c)
 *   updates  "r1-=1, r2+=2"
 * Each rule row carries a color dot matching its arrows in the graph, and
 * hovering a row asks the app to light those arrows up.
 */

import { describeRule } from "./describe.js";
import type { ConditionJson, MachineDoc, RuleJson, UpdateJson } from "./types.js";

const GUARD_ATOM = /^r(\d+)\s*(?:%\s*(\d+)\s*==\s*(\d+)|(>=|==|<|>)\s*(\d+))$/;
const UPDATE_ATOM = /^r(\d+)\s*([+-]=)\s*(\d+)$/;

const MACHINE_TIPS = {
  registers: "How many registers the machine has. Every register starts at the value below.",
  pc: "The program counter the run starts from. Rules fire from the pc they are attached to.",
  initial: "Starting register values, comma separated, one per register.",
  halt: "Program counters that end the run. A state at one of these is drawn in gold.",
};

const COLUMN_TIPS: Record<string, string> = {
  id: "A name for the rule. It labels the arrows in the graph and the legend.",
  from: "The rule can only fire when the program counter equals this.",
  guard:
    "Conditions on the registers, all of which must hold. Write r1>0 & r2%2==1. " +
    "Leave it empty for a rule that always applies.",
  updates:
    "What the rule does to the registers, like r1-=1, r2+=2. Registers never go below zero, " +
    "so guard a decrement with r>0.",
  to: "Where the program counter goes after the rule fires.",
};

export function formatGuard(guard: ConditionJson[]): string {
  return guard
    .map((c) =>
      c.op === "%==" ? `r${c.reg}%${c.modulus}==${c.value}` : `r${c.reg}${c.op}${c.value}`,
    )
    .join(" & ");
}

export function formatUpdates(updates: UpdateJson[]): string {
  return updates
    .map((u) => `r${u.reg}${u.delta < 0 ? "-=" : "+="}${Math.abs(u.delta)}`)
    .join(", ");
}

export function parseGuard(text: string): ConditionJson[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.split(/[&,;]/).map((part) => {
    const match = GUARD_ATOM.exec(part.trim());
    if (!match) throw new Error(`cannot read condition "${part.trim()}"`);
    if (match[2] !== undefined) {
      return {
        reg: Number(match[1]),
        op: "%==" as const,
        value: Number(match[3]),
        modulus: Number(match[2]),
      };
    }
    return {
      reg: Number(match[1]),
      op: match[4] as ">" | ">=" | "==" | "<",
      value: Number(match[5]),
    };
  });
}

export function parseUpdates(text: string): UpdateJson[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.split(/[,;]/).map((part) => {
    const match = UPDATE_ATOM.exec(part.trim());
    if (!match) throw new Error(`cannot read update "${part.trim()}"`);
    const magnitude = Number(match[3]);
    return { reg: Number(match[1]), delta: match[2] === "-=" ? -magnitude : magnitude };
  });
}

export interface EditorCallbacks {
  onChange(): void;
  onHoverRule(id: string | null): void;
}

/** Renders and maintains the rule table plus the machine-level inputs.
 * The document object is mutated in place; `onChange` fires after every
 * successful edit so the app can re-run and refresh the URL. */
export class MachineEditor {
  private doc: MachineDoc;
  private rowErrors = new Map<number, string>();
  private serverProblems: string[] = [];
  private ruleSlots = new Map<string, number>();
  private renderQueued = false;

  constructor(
    private root: HTMLElement,
    doc: MachineDoc,
    private callbacks: EditorCallbacks,
  ) {
    this.doc = doc;
  }

  get document(): MachineDoc {
    return this.doc;
  }

  setDocument(doc: MachineDoc): void {
    this.doc = doc;
    this.rowErrors.clear();
    this.serverProblems = [];
    this.render();
  }

  setProblems(problems: string[]): void {
    this.serverProblems = problems;
    this.render();
  }

  /** Recolor the dots without rebuilding the table, so typing is undisturbed. */
  setRuleColors(slots: Map<string, number>): void {
    this.ruleSlots = slots;
    for (const dot of this.root.querySelectorAll<HTMLElement>(".rule-dot")) {
      const rule = dot.dataset["rule"] ?? "";
      dot.className = `rule-dot ${dotClass(this.ruleSlots.get(rule))}`;
    }
  }

  private input(
    value: string,
    label: string,
    apply: (text: string) => void,
    options: { size?: number; numeric?: boolean } = {},
  ): HTMLInputElement {
    const element = window.document.createElement("input");
    element.type = "text";
    element.value = value;
    element.setAttribute("aria-label", label);
    if (options.size) element.size = options.size;
    if (options.numeric) element.inputMode = "numeric";
    element.addEventListener("change", () => apply(element.value));
    return element;
  }

  private applyRowEdit(index: number, edit: (rule: RuleJson) => void): void {
    const rule = this.doc.rules[index];
    if (!rule) return;
    try {
      edit(rule);
      this.rowErrors.delete(index);
      this.callbacks.onChange();
    } catch (error) {
      this.rowErrors.set(index, error instanceof Error ? error.message : String(error));
    }
    this.queueRender();
  }

  /** Re-render after the browser finishes moving focus, then put focus back
   * on the matching field so Tab keeps working through the table. */
  private queueRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    window.setTimeout(() => {
      this.renderQueued = false;
      this.render();
    }, 0);
  }

  render(): void {
    const doc = this.doc;
    const active = window.document.activeElement;
    const activeLabel =
      active instanceof HTMLElement && this.root.contains(active)
        ? active.getAttribute("aria-label")
        : null;
    this.root.replaceChildren();

    const machineRow = window.document.createElement("div");
    machineRow.className = "editor-machine-row";
    machineRow.append(
      labeled(
        "Registers",
        MACHINE_TIPS.registers,
        this.input(String(doc.n_registers), "Register count", (text) => {
          const count = Number(text);
          if (!Number.isInteger(count) || count < 1) return;
          doc.n_registers = count;
          const [pc, regs] = doc.initial ?? [1, []];
          doc.initial = [pc, resize(regs, count)];
          this.callbacks.onChange();
          this.queueRender();
        }, { size: 3, numeric: true }),
      ),
      labeled(
        "Initial pc",
        MACHINE_TIPS.pc,
        this.input(String(doc.initial?.[0] ?? 1), "Initial program counter", (text) => {
          const pc = Number(text);
          if (!Number.isInteger(pc) || pc < 1) return;
          doc.initial = [pc, doc.initial?.[1] ?? new Array(doc.n_registers).fill(0)];
          this.callbacks.onChange();
        }, { size: 3, numeric: true }),
      ),
      labeled(
        "Initial registers",
        MACHINE_TIPS.initial,
        this.input(
          (doc.initial?.[1] ?? []).join(", "),
          "Initial register values, comma separated",
          (text) => {
            const values = text.split(",").map((v) => Number(v.trim()));
            if (values.some((v) => !Number.isInteger(v) || v < 0)) return;
            doc.initial = [doc.initial?.[0] ?? 1, resize(values, doc.n_registers)];
            this.callbacks.onChange();
          },
          { size: 10 },
        ),
      ),
      labeled(
        "Halt pcs",
        MACHINE_TIPS.halt,
        this.input(doc.halt_pcs.join(", "), "Halting program counters", (text) => {
          const values = text
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
            .map(Number);
          if (values.some((v) => !Number.isInteger(v) || v < 1)) return;
          doc.halt_pcs = values;
          this.callbacks.onChange();
        }, { size: 8 }),
      ),
    );
    this.root.append(machineRow);

    const table = window.document.createElement("table");
    table.className = "rule-table";
    table.createCaption().textContent = "Rules";
    const head = table.createTHead().insertRow();
    for (const title of ["", "id", "from", "guard", "updates", "to", ""]) {
      const cell = window.document.createElement("th");
      cell.textContent = title;
      const tip = COLUMN_TIPS[title];
      if (tip) {
        cell.dataset["tip"] = tip;
        cell.tabIndex = 0;
      }
      head.append(cell);
    }
    const body = table.createTBody();
    doc.rules.forEach((rule, index) => {
      const row = body.insertRow();
      row.className = "rule-row";
      row.addEventListener("mouseenter", () => this.callbacks.onHoverRule(rule.id));
      row.addEventListener("mouseleave", () => this.callbacks.onHoverRule(null));
      row.addEventListener("focusin", () => this.callbacks.onHoverRule(rule.id));
      row.addEventListener("focusout", () => this.callbacks.onHoverRule(null));

      const dot = window.document.createElement("span");
      dot.className = `rule-dot ${dotClass(this.ruleSlots.get(rule.id))}`;
      dot.dataset["rule"] = rule.id;
      dot.dataset["tipTitle"] = rule.id;
      dot.dataset["tip"] = describeRule(rule);
      dot.tabIndex = 0;
      dot.setAttribute("role", "img");
      dot.setAttribute("aria-label", `Color of rule ${rule.id} in the graph`);
      row.insertCell().append(dot);

      row.insertCell().append(
        this.input(rule.id, `Rule ${index + 1} id`, (text) =>
          this.applyRowEdit(index, (r) => {
            if (!text.trim()) throw new Error("id cannot be empty");
            r.id = text.trim();
          }), { size: 6 }),
      );
      row.insertCell().append(
        this.input(String(rule.pc_from), `Rule ${rule.id} source pc`, (text) =>
          this.applyRowEdit(index, (r) => {
            r.pc_from = parsePc(text);
          }), { size: 3, numeric: true }),
      );
      row.insertCell().append(
        this.input(formatGuard(rule.guard), `Rule ${rule.id} guard`, (text) =>
          this.applyRowEdit(index, (r) => {
            r.guard = parseGuard(text);
          }), { size: 16 }),
      );
      row.insertCell().append(
        this.input(formatUpdates(rule.updates), `Rule ${rule.id} updates`, (text) =>
          this.applyRowEdit(index, (r) => {
            r.updates = parseUpdates(text);
          }), { size: 14 }),
      );
      row.insertCell().append(
        this.input(String(rule.pc_to), `Rule ${rule.id} target pc`, (text) =>
          this.applyRowEdit(index, (r) => {
            r.pc_to = parsePc(text);
          }), { size: 3, numeric: true }),
      );
      const remove = window.document.createElement("button");
      remove.type = "button";
      remove.textContent = "delete";
      remove.setAttribute("aria-label", `Delete rule ${rule.id}`);
      remove.dataset["tip"] = "Remove this rule. The graph re-runs without it.";
      remove.addEventListener("click", () => {
        doc.rules.splice(index, 1);
        this.callbacks.onHoverRule(null);
        this.callbacks.onChange();
        this.render();
      });
      row.insertCell().append(remove);

      const rowError = this.rowErrors.get(index);
      const serverError = this.serverProblems.find((p) => p.includes(`'${rule.id}'`));
      const problem = rowError ?? serverError;
      if (problem) {
        const errorRow = body.insertRow();
        errorRow.className = "rule-error";
        const cell = errorRow.insertCell();
        cell.colSpan = 7;
        cell.textContent = problem;
      }
    });
    this.root.append(table);

    const hint = window.document.createElement("p");
    hint.className = "muted small hint";
    hint.textContent =
      "Guards look like r1>0 & r2%2==1 and updates like r1-=1, r2+=2. " +
      "A rule with no guard always applies. Hover a color dot to read the rule in words.";
    this.root.append(hint);

    const addButton = window.document.createElement("button");
    addButton.type = "button";
    addButton.className = "quiet";
    addButton.textContent = "add rule";
    addButton.dataset["tip"] =
      "Append an empty rule at pc 1 that jumps to pc 1. Edit its fields to make it do something.";
    addButton.addEventListener("click", () => {
      const used = new Set(doc.rules.map((r) => r.id));
      let n = doc.rules.length + 1;
      while (used.has(`r${n}`)) n += 1;
      doc.rules.push({ id: `r${n}`, pc_from: 1, guard: [], updates: [], pc_to: 1 });
      this.callbacks.onChange();
      this.render();
      const rows = this.root.querySelectorAll<HTMLInputElement>(".rule-row input");
      rows[rows.length - 5]?.focus();
    });
    this.root.append(addButton);

    const general = this.serverProblems.filter(
      (p) => !doc.rules.some((r) => p.includes(`'${r.id}'`)),
    );
    if (general.length) {
      const box = window.document.createElement("div");
      box.className = "problem-box";
      box.setAttribute("role", "alert");
      box.textContent = general.join("; ");
      this.root.append(box);
    }

    if (activeLabel) {
      const again = this.root.querySelector<HTMLElement>(`[aria-label="${cssEscape(activeLabel)}"]`);
      again?.focus({ preventScroll: true });
    }
  }
}

function dotClass(slot: number | undefined): string {
  return slot !== undefined && slot >= 0 ? `rule-${slot}` : "rule-none";
}

function cssEscape(text: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(text) : text.replace(/"/g, '\\"');
}

function labeled(text: string, tip: string, control: HTMLElement): HTMLLabelElement {
  const label = window.document.createElement("label");
  const span = window.document.createElement("span");
  span.textContent = text;
  label.append(span, control);
  label.dataset["tip"] = tip;
  return label;
}

function parsePc(text: string): number {
  const pc = Number(text);
  if (!Number.isInteger(pc) || pc < 1) throw new Error(`pc must be a positive integer`);
  return pc;
}

function resize(values: number[], length: number): number[] {
  return Array.from({ length }, (_, i) => values[i] ?? 0);
}
