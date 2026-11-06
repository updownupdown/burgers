/**
 * Reading and reach (DESIGN §52), both in Settings → Device and kept on this device:
 *
 *   Text size   Normal or Large. Every UI font size is in rem (tools/a11y/px-to-rem.cjs keeps it
 *               so), so Large sets the root to TEXT_LARGE and all text, tickets and tips included,
 *               grows with it. A phone's own larger-text setting scales the root the same way.
 *   Hand        Right or Left. Left mirrors the top bar: Pause on the left, Undo on the right.
 *               The counters' sauce caddy and knife stay where they are (see DESIGN §52).
 *
 * Applied as data-text and data-hand on <html>; the rules are in a11y.css.
 */
import "./a11y.css";

export type TextSize = "normal" | "large";
export type Hand = "right" | "left";

/** Large text, as a share of the normal root size. */
export const TEXT_LARGE = 1.15;

function read<T extends string>(key: string, ok: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    if (v && ok.includes(v)) return v;
  } catch {
    // ignore
  }
  return fallback;
}
function write(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    // Storage can be unavailable (private mode); the setting holds until the page closes.
  }
}

let text: TextSize = read("bv-text", ["normal", "large"] as const, "normal");
let hand: Hand = read("bv-hand", ["right", "left"] as const, "right");

export const textSize = (): TextSize => text;
export const handedness = (): Hand => hand;

/** Put the saved choices on the page. Call once at startup. */
export function applyAccess(): void {
  const el = document.documentElement;
  if (text === "large") el.dataset.text = "large";
  else delete el.dataset.text;
  if (hand === "left") el.dataset.hand = "left";
  else delete el.dataset.hand;
}

export function setTextSize(t: TextSize): void {
  text = t;
  write("bv-text", t);
  applyAccess();
}

export function setHand(h: Hand): void {
  hand = h;
  write("bv-hand", h);
  applyAccess();
}
