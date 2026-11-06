/**
 * The Bun Voyage logo as inline SVG (DESIGN §44). The wordmark is outlined Young Serif
 * (src/ui/logo-art.ts, from tools/brand/gen_assets.py), so it never shows a fallback serif and
 * needs no image request. Colours come from src/ui/logo.css: slate colourway by default,
 * `paper: true` for cream surfaces (ink mark and Bun, deeper butter Voyage).
 *
 * - logoStack(): mark beside "Bun" over "Voyage" (the map header). Min 30 px tall.
 * - logoLine(): mark + "Bun Voyage" on one line (cards, colophons). Min 13 px tall.
 * - Below those sizes use the mark alone (public/logo.svg, public/logo-ink.svg, or icon("logo")).
 * - Clear space: the knob's diameter (about 0.14 x the lockup's height) all round.
 *
 * Size it with CSS height (width follows), e.g. `.my-card .bv-logo { height: 18px }`.
 */
import "./logo.css";
import { LINE, STACK } from "./logo-art";

export type LogoOptions = {
  /** Cream surfaces: ink mark and Bun, Voyage in the paper butter. */
  paper?: boolean;
  /** Extra classes on the <svg>. */
  className?: string;
  /** Leave out the accessible name when the text beside it already says "Bun Voyage". */
  decorative?: boolean;
};

function svg(art: typeof STACK | typeof LINE, kind: string, o: LogoOptions): string {
  const cls = ["bv-logo", kind, o.paper ? "paper" : "", o.className ?? ""].filter(Boolean).join(" ");
  const a11y = o.decorative ? `aria-hidden="true"` : `role="img" aria-label="Bun Voyage"`;
  return `<svg class="${cls}" viewBox="${art.viewBox}" style="aspect-ratio:${art.w}/${art.h}" ${a11y} focusable="false">${art.svg}</svg>`;
}

/** The stacked lockup: the cloche's plate on Voyage's baseline, its stroke the serif's stem. */
export function logoStack(o: LogoOptions = {}): string {
  return svg(STACK, "stack", o);
}

/** The one-line lockup, with the heavier compact mark so it holds at small sizes. */
export function logoLine(o: LogoOptions = {}): string {
  return svg(LINE, "line", o);
}
