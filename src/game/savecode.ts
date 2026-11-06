/**
 * Save codes (DESIGN §52): the whole trip as one line of text, for moving to a new phone or
 * keeping a copy. Settings copies one and pastes one back.
 *
 *   BV<version>.<base64 of the save as JSON>.<checksum>
 *
 * The version is SAVE_VERSION when the code was made; the checksum (FNV-1a over the JSON, 8 hex
 * digits) catches a code that lost or changed characters on the way. Pasting runs the save through
 * migrateSave, so a code from an older build loads the same way an old save in storage does.
 */
import { migrateSave, SAVE_VERSION, type Save } from "./progress";
import { STOPS } from "./stops";

const PREFIX = "BV";

/** FNV-1a, 32 bit, as 8 hex digits. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** The save as a code. */
export function encodeSave(s: Save): string {
  const json = JSON.stringify(s);
  return `${PREFIX}${s.version ?? SAVE_VERSION}.${toBase64(json)}.${checksum(json)}`;
}

export type Decoded = { ok: true; save: Save; summary: string } | { ok: false; error: string };

/** A pasted code read back: the save it holds (brought up to date) and a line saying what it is. */
export function decodeSave(code: string): Decoded {
  const clean = code.replace(/\s+/g, "");
  if (!clean) return { ok: false, error: "Paste a save code first." };
  const m = /^BV(\d+)\.([A-Za-z0-9+/=]+)\.([0-9a-f]{8})$/i.exec(clean);
  if (!m) return { ok: false, error: "That isn't a Bun Voyage save code." };
  const version = Number(m[1]);
  if (version > SAVE_VERSION) return { ok: false, error: "That code is from a newer build. Update the game, then paste it again." };
  let json: string;
  try {
    json = fromBase64(m[2]);
  } catch {
    return { ok: false, error: "Part of that code is missing. Copy it again in one piece." };
  }
  if (checksum(json) !== m[3].toLowerCase()) return { ok: false, error: "Part of that code is missing. Copy it again in one piece." };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "That code doesn't hold a trip." };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof (raw as { town?: unknown }).town !== "string") return { ok: false, error: "That code doesn't hold a trip." };
  try {
    const save = migrateSave(raw as Partial<Save> & Record<string, unknown>);
    return { ok: true, save, summary: describeSave(save) };
  } catch {
    return { ok: false, error: "That code doesn't hold a trip." };
  }
}

/** One plain line about a trip: where it is, how far along, what's saved. */
export function describeSave(s: Save): string {
  const town = STOPS.find((t) => t.id === s.town)?.name ?? "the road";
  const open = s.unlocked.length;
  const parts = [`Day ${s.day} in ${town}`, `${open} ${open === 1 ? "town" : "towns"} open`, `$${s.bank.toLocaleString("en-US")} saved`];
  if (s.trips > 0) parts.push(`${s.trips} ${s.trips === 1 ? "trip" : "trips"} done`);
  return `${parts.join(", ")}.`;
}
