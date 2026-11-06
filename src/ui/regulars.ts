import { icon } from "./icons";
import "./regulars.css";

/**
 * A town's regular, made visible (DESIGN §51): a small name tag over their bean while they're at
 * the window, and "Doug's usual" on their ticket's header (ticketHtml in ui.ts). The tag steps
 * aside while a bubble or opinion is over their head, and goes with them when they leave.
 */
export class RegularTags {
  private els: HTMLElement[];

  constructor(root: HTMLElement) {
    this.els = [0, 1, 2].map(() => {
      const el = document.createElement("div");
      el.className = "regular-tag";
      el.hidden = true;
      root.append(el);
      return el;
    });
  }

  /** Over customer `i`'s head, in their third of the window (`w` wide, the head at `top`). */
  place(w: number, top: number): void {
    const slotW = w / 3;
    this.els.forEach((el, i) => {
      el.style.left = `${slotW * (i + 0.5)}px`;
      el.style.top = `${top}px`;
      el.style.maxWidth = `${slotW - 8}px`;
    });
  }

  /** Show `name` over customer `i`, or nothing (null). */
  sync(i: number, name: string | null): void {
    const el = this.els[i];
    if (!el) return;
    el.hidden = !name;
    if (name && el.dataset.name !== name) {
      el.dataset.name = name;
      el.innerHTML = `${icon("heart")}<span></span>`;
      el.querySelector("span")!.textContent = name;
    }
  }
}

/** The ticket header's badge for a regular's order: "Doug's usual" (just the name on a narrow stub). */
export function regularBadge(name: string | undefined, short = false): string {
  if (!name) return "";
  const safe = name.replace(/[&<>"]/g, "");
  return `<em class="tk-regular" title="A regular">${short ? safe : `${safe}'s usual`}</em>`;
}
