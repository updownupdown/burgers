/**
 * Kitchen pace (after build #84, DESIGN §38). Cooking was so quick that one order at a time was the
 * only way to play. Now everything that cooks on heat (grill, comal, press, fryer, tostadas, the
 * oven, cheese on the press and in quesadillas) takes COOK_TIME times as long, while hands-on work (taps, drags,
 * sauces, pours) stays as it was. The idle time that opens up is where a second and third order
 * fit. The same on every pacing: Chill, Balanced and Stressful differ only in patience and burns.
 *
 * To keep the day the same size, the parts of a customer's patience that are cooking grow by the
 * same factor (line.ts windowPatience), and the shift clock and the line's patience stretch by
 * shiftStretch(), how much longer a typical order takes, so a shift brings the same number of
 * people over a longer, busier stretch.
 *
 * The oven follows the same dial (after build #86; it was a fixed 1.5x).
 *
 * Dev mode (Settings) can try other values; the choice is saved in this browser only.
 */
/** The default: 2x (James, after build #86; it was 2.5x in build #86). */
export const COOK_TIME = 2;
export const COOK_TIMES = [1, 1.5, 2, 2.5, 3] as const;
const KEY = "bv-cook-time";

/** A typical burger's window patience at the old pace: 91 s of hands-on work and 52 s of cooking. */
export const TYPICAL = { hands: 91, cook: 52 };

let current = load();

function load(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return (COOK_TIMES as readonly number[]).includes(v) ? v : COOK_TIME;
  } catch {
    return COOK_TIME;
  }
}

/** The cook-time multiplier in play (COOK_TIME unless dev mode picked another). */
export function cookTime(): number {
  return current;
}

export function setCookTime(t: number): void {
  current = (COOK_TIMES as readonly number[]).includes(t) ? t : COOK_TIME;
  try {
    if (current === COOK_TIME) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(current));
  } catch {
    /* private window: this session only */
  }
}

/** How much longer a typical order takes at cook-time `t`: the shift clock and line patience scale by it. */
export function shiftStretch(t = current): number {
  return (TYPICAL.hands + TYPICAL.cook * t) / (TYPICAL.hands + TYPICAL.cook);
}
