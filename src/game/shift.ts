/**
 * When the window is open. Since DESIGN §51 Prep offers two shifts: **Lunch**, 11:00 to 15:00
 * (the default), or a **Full day**, 10:00 to 16:00, which plays half as long again and brings
 * everyone who comes by in those six hours. People arrive along a lunch curve, busiest from noon
 * to one and quiet at either end, so the full day's extra hours add fewer people than the lunch
 * hours do (`crowdShare`, about 1.24x). A town's `shiftLength` is the play time of the four lunch
 * hours; every hour of the window plays for a quarter of it. The save keeps the window itself
 * (`ShiftWindow`), so the clock and the crowd still read it.
 */

export interface ShiftWindow {
  /** Clock hours, whole numbers, start < end. */
  start: number;
  end: number;
}

export const DEFAULT_SHIFT: ShiftWindow = { start: 11, end: 15 };
/** The two shifts Prep offers. */
export type ShiftKind = "lunch" | "full";
export const SHIFTS: Record<ShiftKind, ShiftWindow> = { lunch: DEFAULT_SHIFT, full: { start: 10, end: 16 } };
/** The shortest shift, in hours. */
export const MIN_SHIFT = 4;
/** The earliest opening and the latest closing. */
export const FIRST_HOUR = 9;
export const LAST_HOUR = 17;

/** How busy each hour is, by the hour it starts at: arrivals per hour relative to the noon peak. */
const HOUR_RATE: Record<number, number> = { 9: 0.3, 10: 0.4, 11: 0.75, 12: 1, 13: 0.75, 14: 0.4, 15: 0.3, 16: 0.25 };

export function hourRate(hour: number): number {
  return HOUR_RATE[Math.floor(hour)] ?? 0.25;
}

/** Which of the two shifts a window is nearest: five hours or more is a full day. */
export function shiftKind(w: Partial<ShiftWindow> | null | undefined): ShiftKind {
  if (!w || typeof w.start !== "number" || typeof w.end !== "number") return "lunch";
  return w.end - w.start >= 5 ? "full" : "lunch";
}

/**
 * A saved window made one of the two shifts (an old save's slider window goes to the nearest:
 * five hours or more is a full day, anything shorter is lunch).
 */
export function validShift(w: Partial<ShiftWindow> | null | undefined): ShiftWindow {
  return { ...SHIFTS[shiftKind(w)] };
}

export function shiftHours(w: ShiftWindow): number {
  return w.end - w.start;
}

/** Play time of a window, in seconds, for a town whose lunch rush plays for `lunchSeconds`. */
export function shiftSeconds(w: ShiftWindow, lunchSeconds: number): number {
  return (lunchSeconds / shiftHours(DEFAULT_SHIFT)) * shiftHours(w);
}

/** Total arrival weight over a window, in peak-hours. */
function weight(w: ShiftWindow): number {
  let sum = 0;
  for (let h = w.start; h < w.end; h++) sum += hourRate(h);
  return sum;
}

/** How many people a window brings compared with the lunch rush (1 for 11:00 to 15:00). */
export function crowdShare(w: ShiftWindow): number {
  return weight(w) / weight(DEFAULT_SHIFT);
}

/** The clock hour (a float) `time` seconds into a shift `shiftLength` seconds long. */
export function clockAt(time: number, w: ShiftWindow, shiftLength: number): number {
  return w.start + shiftProgress(time, shiftLength) * shiftHours(w);
}

/** How far through the shift we are, 0..1. */
export function shiftProgress(time: number, shiftLength: number): number {
  return shiftLength > 0 ? Math.max(0, Math.min(1, time / shiftLength)) : 1;
}

/** "11:40am", "2:05pm" style labels, rounded down to five minutes so the clock ticks calmly. */
export function clockLabel(hour: number, step = 5): string {
  const total = Math.floor((hour * 60) / step) * step;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

/**
 * Seconds until the next arrival at clock hour `hour`, before jitter: spaced so that, over the
 * whole window, about `customers` people arrive, more of them in the busy hours.
 */
export function arrivalGap(hour: number, w: ShiftWindow, shiftLength: number, customers: number): number {
  const perHour = shiftLength / shiftHours(w);
  const base = (weight(w) * perHour) / Math.max(1, customers);
  return base / hourRate(hour);
}
