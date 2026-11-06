/**
 * Parts of Settings added after the scope review (DESIGN §52), kept apart from menu.ts:
 *
 *   saveCodeHtml / bindSaveCode   Your trip: copy the save as a code, paste one back (checked,
 *                                 described, confirmed, then loaded through migrateSave).
 *   shiftLogHtml / bindShiftLog   Dev mode's shift log: the last shifts in a small table, copyable.
 */
import "./settings-extra.css";
import { decodeSave } from "../game/savecode";
import type { Save } from "../game/progress";
import { clearLog, logText, readLog } from "../game/shiftlog";
import { DIFFICULTY } from "../game/difficulty";
import { STOPS } from "../game/stops";
import { icon } from "../ui/icons";
import { esc } from "./modal";

const row = (m: string, ic: string, label: string, note: string) =>
  `<button class="bv-row menu-row" data-m="${m}"><span class="lead">${icon(ic)}</span><span class="main"><b>${label}</b><small>${note}</small></span><span class="trail mute">${icon("forward")}</span></button>`;

export function saveCodeHtml(inShift: boolean): string {
  return `<section class="menu-group save-code">
    <h3 class="menu-h">${icon("copy")}Your trip</h3>
    ${row("code-copy", "copy", "Copy save code", "Your whole trip as one line of text. Keep it somewhere, or paste it on a new phone.")}
    ${inShift ? "" : row("code-paste", "paste", "Paste save code", "Load a trip from a code. It replaces the trip on this phone.")}
    <div class="sc-panel" data-sc="panel" hidden>
      <textarea class="sc-text bv-mono" data-sc="text" rows="3" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Save code"></textarea>
      <p class="sc-msg" data-sc="msg" role="status"></p>
      <div class="bv-btn-row inline" data-sc="acts"></div>
    </div>
    <p class="sc-note">The trip saves after each shift, drive and night. A shift still going isn't saved until it ends.</p>
  </section>`;
}

export interface SaveCodeDeps {
  saveCode(): string;
  loadTrip(s: Save): void;
}

/** Wire up the save-code rows in a Settings card. Returns true if it handled the click. */
export function bindSaveCode(card: HTMLElement, d: SaveCodeDeps): (m: string) => boolean {
  const q = <T extends HTMLElement>(k: string) => card.querySelector<T>(`[data-sc="${k}"]`)!;
  let pending: Save | null = null;
  let mode: "copy" | "paste" | null = null;
  const acts = (html: string) => (q("acts").innerHTML = html);
  const msg = (text: string, tone = "") => {
    const m = q("msg");
    m.textContent = text;
    m.dataset.tone = tone;
  };
  const open = (m: "copy" | "paste") => {
    mode = m;
    pending = null;
    const panel = q("panel");
    panel.hidden = false;
    const ta = q<HTMLTextAreaElement>("text");
    ta.readOnly = m === "copy";
    if (m === "copy") {
      ta.value = d.saveCode();
      msg("Copying…");
      acts(`<button class="bv-btn sm" data-m="code-done">Done</button>`);
      ta.select();
      void copyText(ta.value).then((ok) => {
        if (mode !== "copy") return;
        msg(ok ? "Copied. Paste it somewhere safe." : "Select the code above and copy it.", ok ? "ok" : "");
        if (!ok) ta.select();
      });
    } else {
      ta.value = "";
      msg("Paste a save code here.");
      acts(`<button class="bv-btn sm" data-m="code-done">Cancel</button><button class="bv-btn sm accent" data-m="code-check">Check code</button>`);
      ta.focus({ preventScroll: true });
    }
    panel.scrollIntoView({ block: "nearest" });
  };
  const close = () => {
    mode = null;
    pending = null;
    q("panel").hidden = true;
  };
  return (m: string) => {
    switch (m) {
      case "code-copy":
        open("copy");
        return true;
      case "code-paste":
        open("paste");
        return true;
      case "code-done":
        close();
        return true;
      case "code-check": {
        const r = decodeSave(q<HTMLTextAreaElement>("text").value);
        if (!r.ok) {
          pending = null;
          msg(r.error, "error");
          return true;
        }
        pending = r.save;
        msg(`This code holds: ${r.summary} Loading it replaces the trip on this phone.`, "warn");
        acts(`<button class="bv-btn sm" data-m="code-done">Cancel</button><button class="bv-btn sm accent" data-m="code-load">Load this trip</button>`);
        return true;
      }
      case "code-load":
        if (pending) {
          const s = pending;
          close();
          d.loadTrip(s);
        }
        return true;
    }
    return false;
  };
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the old way.
  }
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// The shift log (dev mode)

const TIER: Record<string, string> = Object.fromEntries(Object.entries(DIFFICULTY).map(([id, v]) => [id, v.label]));
const townName = (id: string) => STOPS.find((t) => t.id === id)?.name ?? id;

export function shiftLogHtml(): string {
  const list = readLog();
  const rows = list
    .slice(-12)
    .reverse()
    .map((e) => `<tr><td>${e.day}</td><td>${esc(townName(e.town))}</td><td>${esc(TIER[e.tier] ?? e.tier)}</td><td>${e.crowd}</td><td>${e.served}</td><td>${e.walked}</td><td>${e.stars.toFixed(1)}</td><td>$${e.takings}</td><td>${e.overrun}s</td></tr>`)
    .join("");
  return `<div class="shift-log" data-sl="box">
    <div class="sl-head"><b>Shift log</b><small data-sl="count">${list.length ? `${list.length} ${list.length === 1 ? "shift" : "shifts"} on this phone` : "No shifts yet"}</small></div>
    ${
      list.length
        ? `<div class="sl-scroll"><table class="sl-table bv-mono"><thead><tr><th>Day</th><th>Town</th><th>Pacing</th><th title="Expected crowd">Crowd</th><th>Served</th><th title="Walked past the line">Past</th><th>★</th><th>Takings</th><th title="Past closing">Over</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="bv-btn-row inline"><button class="bv-btn sm" data-m="log-copy">${icon("copy")}Copy all</button><button class="bv-btn sm" data-m="log-clear">Clear</button></div>
    <p class="sl-msg" data-sl="msg" role="status"></p>`
        : ""
    }
  </div>`;
}

export function bindShiftLog(card: HTMLElement): (m: string) => boolean {
  return (m: string) => {
    if (m === "log-copy") {
      const box = card.querySelector<HTMLElement>('[data-sl="msg"]');
      void copyText(logText(readLog())).then((ok) => {
        if (box) box.textContent = ok ? "Copied as a sheet (tab-separated)." : "Couldn't copy here.";
      });
      return true;
    }
    if (m === "log-clear") {
      clearLog();
      const box = card.querySelector<HTMLElement>('[data-sl="box"]');
      if (box) box.outerHTML = shiftLogHtml();
      return true;
    }
    return false;
  };
}
