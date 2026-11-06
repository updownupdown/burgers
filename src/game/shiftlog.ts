/**
 * The shift log (DESIGN §52): one line per finished shift, kept on this device, for tuning the
 * difficulty on real play. It shows at the bottom of Settings with dev mode on, where it can be
 * copied as tab-separated text. Every shift is logged, dev mode or not, and the newest LOG_MAX are
 * kept. It isn't part of the save, so a save code or a new trip leaves it alone.
 */
export interface ShiftLogEntry {
  /** Day of the trip, and the town's id. */
  day: number;
  town: string;
  /** Pacing id: chill, balanced or stressful. */
  tier: string;
  /** Expected customers when the window opened. */
  crowd: number;
  served: number;
  /** Walked past the line, plus left from the line or the window. */
  walked: number;
  left: number;
  /** Average opinion of the served, 1..5, to one decimal (0 with nobody served). */
  stars: number;
  takings: number;
  /** Seconds the last orders ran past the shift's close. */
  overrun: number;
}

export const LOG_KEY = "bv-shiftlog";
export const LOG_MAX = 200;

export function readLog(): ShiftLogEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOG_KEY) || "[]") as unknown;
    return Array.isArray(v) ? (v as ShiftLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function addToLog(e: ShiftLogEntry, list = readLog()): ShiftLogEntry[] {
  const next = [...list, e].slice(-LOG_MAX);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(next));
  } catch {
    // Storage full or off: the log is a convenience.
  }
  return next;
}

export function clearLog(): void {
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    // ignore
  }
}

const COLS: (keyof ShiftLogEntry)[] = ["day", "town", "tier", "crowd", "served", "walked", "left", "stars", "takings", "overrun"];

/** The log as tab-separated text with a header row, for pasting into a sheet. */
export function logText(list: ShiftLogEntry[]): string {
  return [COLS.join("\t"), ...list.map((e) => COLS.map((c) => String(e[c] ?? "")).join("\t"))].join("\n");
}

/** A line built from the shift's numbers. */
export function logEntry(x: { day: number; town: string; tier: string; crowd: number; served: number; walked: number; left: number; stars: number[]; takings: number; overrun: number }): ShiftLogEntry {
  const avg = x.stars.length ? x.stars.reduce((a, b) => a + b, 0) / x.stars.length : 0;
  return {
    day: x.day,
    town: x.town,
    tier: x.tier,
    crowd: x.crowd,
    served: x.served,
    walked: x.walked,
    left: x.left,
    stars: Math.round(avg * 10) / 10,
    takings: Math.round(x.takings),
    overrun: Math.max(0, Math.round(x.overrun)),
  };
}
