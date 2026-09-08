/** Plain-English readings of rules, conditions, and terminal kinds. These
 * feed tooltips and the selected-state card, so they should read as a
 * sentence rather than as syntax. */

import type { ConditionJson, RuleJson, UpdateJson } from "./types.js";

const COMPARISON: Record<string, string> = {
  ">": "is more than",
  ">=": "is at least",
  "==": "equals",
  "<": "is less than",
};

export function describeCondition(condition: ConditionJson): string {
  if (condition.op === "%==") {
    return `r${condition.reg} mod ${condition.modulus ?? "?"} is ${condition.value}`;
  }
  return `r${condition.reg} ${COMPARISON[condition.op] ?? condition.op} ${condition.value}`;
}

export function describeUpdate(update: UpdateJson): string {
  const amount = Math.abs(update.delta);
  if (update.delta < 0) return `take ${amount} from r${update.reg}`;
  return `add ${amount} to r${update.reg}`;
}

/** One sentence: where the rule fires, what it needs, what it does, where it goes. */
export function describeRule(rule: RuleJson): string {
  const guard = rule.guard.length
    ? `when ${rule.guard.map(describeCondition).join(" and ")}`
    : "with no condition";
  const effect = rule.updates.length
    ? rule.updates.map(describeUpdate).join(", ")
    : "leave the registers alone";
  const move =
    rule.pc_to === rule.pc_from ? `stay at pc ${rule.pc_to}` : `jump to pc ${rule.pc_to}`;
  return `At pc ${rule.pc_from}, ${guard}: ${effect}, then ${move}.`;
}

export function describeTerminal(kind: "halt" | "stuck" | "cutoff" | undefined): string {
  switch (kind) {
    case "halt":
      return "Halted: this pc is a halting counter, so the run stops here.";
    case "stuck":
      return "Stuck: no rule can fire from this configuration.";
    case "cutoff":
      return "Cut off: the cap stopped the run here, so the evolution continues past this chip.";
    default:
      return "";
  }
}

export function registersText(registers: number[]): string {
  return registers.map((value, index) => `r${index + 1} = ${value}`).join(", ");
}

export function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : pluralNoun}`;
}
