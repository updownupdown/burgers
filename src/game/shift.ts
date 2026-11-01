/**
 * The shift on the clock. A shift runs for `shiftLength` seconds of game time (see stops.ts);
 * the HUD and the pause menu show it as a time of day inside the shift's window, which is the
 * lunch rush by default.
 */
export interface ShiftWindow {
  /** Clock hours, e.g. 11 for 11:00 and 14.5 for 14:30. */
  start: number;
  end: number;
}

export const DEFAULT_SHIFT: ShiftWindow = { start: 11, end: 14 };

/** How far through the shift the clock is, 0..1. */
export function shiftProgress(time: number, shiftLength: number): number {
  return shiftLength > 0 ? Math.max(0, Math.min(1, time / shiftLength)) : 1;
}

/** The hour on the truck's clock at game time `time`, as a float (11.5 is 11:30). */
export function clockAt(time: number, window: ShiftWindow, shiftLength: number): number {
  return window.start + (window.end - window.start) * shiftProgress(time, shiftLength);
}

/** "11:40", "2:05 pm" style labels, rounded down to five minutes so the clock ticks calmly. */
export function clockLabel(hour: number, step = 5): string {
  const total = Math.floor((hour * 60) / step) * step;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}
