/** A short first-visit walkthrough: a spotlight ring around one element at a
 * time with a card that explains it. Runs once per browser (remembered in
 * localStorage) and again on request from the "show me around" link. */

export interface TourStep {
  target: string;
  title: string;
  text: string;
}

const STORAGE_KEY = "mrm-tour-done";
const RING_PAD = 8;
const CARD_GAP = 14;

export const TOUR_STEPS: TourStep[] = [
  {
    target: "#preset-select",
    title: "Start with a preset",
    text:
      "Each preset is a small register machine that shows one phenomenon: Fibonacci " +
      "recursion, lattice paths, the Collatz tree, the machines from the paper. Pick " +
      "one and the graph updates.",
  },
  {
    target: "#graph-host",
    title: "Read the graph",
    text:
      "Each chip is one configuration: the badge is the program counter and the numbers " +
      "are the registers. Every arrow is one rule firing, colored by rule. Rows are " +
      "steps. Hover anything for details, and click a chip to trace where it came from.",
  },
  {
    target: "#play-button",
    title: "Watch it unfold",
    text:
      "Play reveals the evolution one step at a time. The space bar does the same, and " +
      "the arrow keys step by hand.",
  },
  {
    target: "#editor-host",
    title: "Change the rules",
    text:
      "Every field is editable and the graph re-runs on each change. Hover a rule to " +
      "light up its arrows in the graph, and hover the color dot for what it does in words.",
  },
  {
    target: "#stats-body",
    title: "Check the numbers",
    text:
      "State and path counts, how fast the frontier grows, halting probabilities, and " +
      "the closed form when a preset has one. Hover any figure to see what it means.",
  },
];

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "yes";
  } catch {
    return true;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "yes");
  } catch {
    // Without storage the tour simply shows again next time.
  }
}

export class Tour {
  private index = 0;
  private backdrop: HTMLDivElement | null = null;
  private ring: HTMLDivElement | null = null;
  private card: HTMLDivElement | null = null;
  private previousFocus: Element | null = null;
  private onKey = (event: KeyboardEvent) => this.handleKey(event);
  private onLayout = () => this.position();

  constructor(private steps: TourStep[] = TOUR_STEPS) {}

  get running(): boolean {
    return this.card !== null;
  }

  start(): void {
    if (this.running) return;
    this.previousFocus = document.activeElement;
    this.index = 0;
    this.backdrop = document.createElement("div");
    this.backdrop.className = "tour-backdrop";
    this.ring = document.createElement("div");
    this.ring.className = "tour-ring";
    this.card = document.createElement("div");
    this.card.className = "tour-card";
    this.card.setAttribute("role", "dialog");
    this.card.setAttribute("aria-modal", "false");
    this.card.setAttribute("aria-labelledby", "tour-title");
    document.body.append(this.backdrop, this.ring, this.card);
    document.addEventListener("keydown", this.onKey);
    window.addEventListener("resize", this.onLayout);
    window.addEventListener("scroll", this.onLayout, true);
    this.show();
  }

  finish(): void {
    if (!this.running) return;
    markSeen();
    this.backdrop?.remove();
    this.ring?.remove();
    this.card?.remove();
    this.backdrop = null;
    this.ring = null;
    this.card = null;
    document.removeEventListener("keydown", this.onKey);
    window.removeEventListener("resize", this.onLayout);
    window.removeEventListener("scroll", this.onLayout, true);
    if (this.previousFocus instanceof HTMLElement) this.previousFocus.focus();
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      this.finish();
    } else if (event.key === "ArrowRight" || event.key === "Enter") {
      event.preventDefault();
      this.advance(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.advance(-1);
    }
  }

  private advance(delta: number): void {
    const next = this.index + delta;
    if (next >= this.steps.length) {
      this.finish();
      return;
    }
    if (next < 0) return;
    this.index = next;
    this.show();
  }

  private target(): HTMLElement | null {
    const step = this.steps[this.index];
    return step ? document.querySelector<HTMLElement>(step.target) : null;
  }

  private show(): void {
    const step = this.steps[this.index];
    const card = this.card;
    if (!step || !card) return;
    const target = this.target();
    target?.scrollIntoView({ block: "nearest", inline: "nearest" });

    card.replaceChildren();
    const counter = document.createElement("div");
    counter.className = "tour-counter";
    counter.textContent = `${this.index + 1} of ${this.steps.length}`;
    const title = document.createElement("h2");
    title.id = "tour-title";
    title.textContent = step.title;
    const text = document.createElement("p");
    text.textContent = step.text;
    const buttons = document.createElement("div");
    buttons.className = "tour-buttons";
    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "quiet";
    skip.textContent = "skip";
    skip.addEventListener("click", () => this.finish());
    buttons.append(skip);
    if (this.index > 0) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "quiet";
      back.textContent = "back";
      back.addEventListener("click", () => this.advance(-1));
      buttons.append(back);
    }
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = this.index === this.steps.length - 1 ? "done" : "next";
    next.addEventListener("click", () => this.advance(1));
    buttons.append(next);
    card.append(counter, title, text, buttons);
    this.position();
    next.focus({ preventScroll: true });
    // Position again once any scrolling settles; the first pass can be off.
    window.setTimeout(() => this.position(), 60);
  }

  private position(): void {
    const ring = this.ring;
    const card = this.card;
    if (!ring || !card) return;
    const target = this.target();
    const rect = target?.getBoundingClientRect() ?? new DOMRect(20, 20, 200, 60);
    const left = rect.left - RING_PAD;
    const top = rect.top - RING_PAD;
    const width = rect.width + RING_PAD * 2;
    const height = rect.height + RING_PAD * 2;
    ring.style.left = `${left}px`;
    ring.style.top = `${top}px`;
    ring.style.width = `${width}px`;
    ring.style.height = `${height}px`;

    const box = card.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let cardLeft: number;
    let cardTop: number;
    if (left + width + CARD_GAP + box.width <= vw - 12) {
      cardLeft = left + width + CARD_GAP;
      cardTop = top;
    } else if (left - CARD_GAP - box.width >= 12) {
      cardLeft = left - CARD_GAP - box.width;
      cardTop = top;
    } else if (top + height + CARD_GAP + box.height <= vh - 12) {
      cardLeft = left;
      cardTop = top + height + CARD_GAP;
    } else if (top - CARD_GAP - box.height >= 12) {
      cardLeft = left;
      cardTop = top - CARD_GAP - box.height;
    } else {
      // A target too big to sit beside: float the card inside it instead.
      cardLeft = left + width / 2 - box.width / 2;
      cardTop = top + Math.min(height / 2 - box.height / 2, 80);
    }
    cardLeft = Math.min(Math.max(12, cardLeft), vw - box.width - 12);
    cardTop = Math.min(Math.max(12, cardTop), vh - box.height - 12);
    card.style.left = `${Math.round(cardLeft)}px`;
    card.style.top = `${Math.round(cardTop)}px`;
  }
}
