/**
 * Reading (DESIGN §52), in Settings → Device and kept on this device:
 *
 *   Text size   Normal or Large. Every UI font size is in rem (tools/a11y/px-to-rem.cjs keeps it
 *               so), so Large sets the root to TEXT_LARGE and all text, tickets and tips included,
 *               grows with it. A phone's own larger-text setting scales the root the same way.
 *
 * Applied as data-text on <html>; the rules are in a11y.css.
 */
import "./a11y.css";

export type TextSize = "normal" | "large";

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

export const textSize = (): TextSize => text;

/** Put the saved choice on the page. Call once at startup. */
export function applyAccess(): void {
  const el = document.documentElement;
  if (text === "large") el.dataset.text = "large";
  else delete el.dataset.text;
}

export function setTextSize(t: TextSize): void {
  text = t;
  write("bv-text", t);
  applyAccess();
}
