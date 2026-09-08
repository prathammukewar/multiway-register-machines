/** One floating tooltip for the whole page.
 *
 * Any element with a `data-tip` attribute gets an explanation on hover and on
 * keyboard focus; `data-tip-title` adds a bold first line. Dynamic content
 * works automatically because the listeners sit on the document. The graph
 * uses `showAt` to place a card next to the pointer for chips and arrows.
 */

const SHOW_DELAY = 220;
const MARGIN = 8;

export class Tooltip {
  private element: HTMLDivElement;
  private anchor: Element | null = null;
  private timer: number | null = null;
  private pinnedToPointer = false;

  constructor() {
    const element = document.createElement("div");
    element.className = "tooltip";
    element.id = "app-tooltip";
    element.setAttribute("role", "tooltip");
    element.hidden = true;
    document.body.append(element);
    this.element = element;

    document.addEventListener("mouseover", (event) => this.onEnter(event.target));
    document.addEventListener("mouseout", (event) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.("[data-tip]");
      if (anchor && anchor === this.anchor) this.hide();
    });
    document.addEventListener("focusin", (event) => this.onEnter(event.target, 0));
    document.addEventListener("focusout", () => {
      if (!this.pinnedToPointer) this.hide();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.hide();
    });
    document.addEventListener("scroll", () => this.hide(), { capture: true, passive: true });
    window.addEventListener("resize", () => this.hide());
  }

  /** Show a card near a screen point (used for graph hovers). */
  showAt(x: number, y: number, title: string, lines: string[]): void {
    this.cancelTimer();
    this.anchor = null;
    this.pinnedToPointer = true;
    this.fill(title, lines);
    this.element.hidden = false;
    const box = this.element.getBoundingClientRect();
    let left = x + 16;
    let top = y + 18;
    if (left + box.width > window.innerWidth - MARGIN) left = x - box.width - 12;
    if (top + box.height > window.innerHeight - MARGIN) top = y - box.height - 12;
    this.place(Math.max(MARGIN, left), Math.max(MARGIN, top));
  }

  hide(): void {
    this.cancelTimer();
    if (this.anchor) {
      this.anchor.removeAttribute("aria-describedby");
      this.anchor = null;
    }
    this.pinnedToPointer = false;
    this.element.hidden = true;
  }

  private onEnter(target: EventTarget | null, delay = SHOW_DELAY): void {
    const element = target as Element | null;
    const anchor = element?.closest?.("[data-tip]");
    if (!anchor) return;
    if (anchor === this.anchor && !this.element.hidden) return;
    this.cancelTimer();
    this.pinnedToPointer = false;
    const show = () => {
      this.anchor = anchor;
      const title = anchor.getAttribute("data-tip-title") ?? "";
      const body = anchor.getAttribute("data-tip") ?? "";
      this.fill(title, body.split("\n"));
      anchor.setAttribute("aria-describedby", this.element.id);
      this.element.hidden = false;
      this.placeNear(anchor);
    };
    if (delay === 0) show();
    else this.timer = window.setTimeout(show, delay);
  }

  private fill(title: string, lines: string[]): void {
    this.element.replaceChildren();
    if (title) {
      const heading = document.createElement("div");
      heading.className = "tooltip-title";
      heading.textContent = title;
      this.element.append(heading);
    }
    for (const line of lines) {
      if (!line) continue;
      const paragraph = document.createElement("div");
      paragraph.className = "tooltip-line";
      paragraph.textContent = line;
      this.element.append(paragraph);
    }
  }

  private placeNear(anchor: Element): void {
    const target = anchor.getBoundingClientRect();
    const box = this.element.getBoundingClientRect();
    let left = target.left + target.width / 2 - box.width / 2;
    left = Math.min(Math.max(MARGIN, left), window.innerWidth - box.width - MARGIN);
    let top = target.bottom + 8;
    let above = false;
    if (top + box.height > window.innerHeight - MARGIN) {
      top = target.top - box.height - 8;
      above = true;
    }
    this.element.classList.toggle("above", above);
    this.place(left, Math.max(MARGIN, top));
  }

  private place(left: number, top: number): void {
    this.element.style.left = `${Math.round(left)}px`;
    this.element.style.top = `${Math.round(top)}px`;
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
