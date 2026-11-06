/**
 * How hard a shift is (the difficulty study, DESIGN §43). Patience never was what made the easy
 * tier hard: it was hands, food cooking out of sight and small slips adding up. So each tier now
 * changes something a player notices:
 * - Relaxed (id "chill"): fewer people, ready alerts, food keeps longer, small slips cost half,
 *   the fountain stops and lids by itself and a counted topping goes on in one drag.
 * - Steady (id "balanced"): the lunch rush as it was, with ready alerts.
 * - Busy (id "stressful"): more people, shorter fuses, pickier, and better tips.
 * The ids stay as they were so saves and the dev dial keep working.
 */
export type Difficulty = "chill" | "balanced" | "stressful";

export interface DifficultySpec {
  label: string;
  blurb: string;
  /** Multiplies every customer's patience (window and line). */
  patience: number;
  /** Multiplies the crowd expected today (day.ts expectedCustomers). */
  crowd: number;
  /** How many may stand at the window at once. */
  window: number;
  /** The bell calls whoever has waited a while by itself while fewer than this are at the window (0: never). */
  autoCall: number;
  /** A tick and a lamp on the counter button when something on another counter is done. */
  alerts: boolean;
  /** Holding (food and fries on a tray going cold) takes this many times as long. */
  hold: number;
  /** Small slips (salt, lid, ice, garnish, a piece short, a messy stack, sauce) cost this share of their usual penalty. */
  small: number;
  /** The fountain stops at the line and puts the lid on; a counted topping goes on in one drag. */
  helpers: boolean;
  /** Cooking past over-done runs at this share of its pace (0.5: burning takes twice as long). */
  burn: number;
  /** Multiplies tips. */
  tips: number;
  /** Share of patience a send-back gives back. */
  refund: number;
  /** Scores below this get sent back for changes (first time). */
  sendBack: number;
  /** Scores below this get refused outright. */
  refuse: number;
}

/** On Relaxed, cooking past over-done runs at this share of its pace: burning takes twice as long. */
export const CHILL_BURN = 0.5;

export const DIFFICULTY: Record<Difficulty, DifficultySpec> = {
  chill: {
    label: "Relaxed",
    blurb: "Fewer customers and a tick when food is ready on another counter. Food keeps longer, small slips cost half, the fountain stops and lids by itself, and toppings go on in one drag.",
    patience: 2.4, crowd: 0.8, window: 3, autoCall: 2, alerts: true, hold: 1.67, small: 0.5, helpers: true, burn: CHILL_BURN, tips: 0.9, refund: 0.2, sendBack: 40, refuse: 12,
  },
  balanced: {
    label: "Steady",
    blurb: "A steady lunch rush, with a tick when food is ready on another counter. Customers send back what's clearly off.",
    patience: 1.3, crowd: 1, window: 3, autoCall: 0, alerts: true, hold: 1, small: 1, helpers: false, burn: 1, tips: 1, refund: 0.2, sendBack: 55, refuse: 22,
  },
  stressful: {
    label: "Busy",
    blurb: "More customers, shorter fuses and picky about every order, but they tip a third more. No ready alerts.",
    patience: 0.8, crowd: 1.28, window: 3, autoCall: 0, alerts: false, hold: 1, small: 1, helpers: false, burn: 1, tips: 1.3, refund: 0.1, sendBack: 68, refuse: 32,
  },
};

export const DIFFICULTIES = Object.keys(DIFFICULTY) as Difficulty[];

/** The pacing last picked on Prep (saved per browser as "bv-difficulty"), or null if none yet. */
export function savedPacing(): Difficulty | null {
  try {
    const v = localStorage.getItem("bv-difficulty");
    return v && v in DIFFICULTY ? (v as Difficulty) : null;
  } catch {
    return null;
  }
}

/**
 * What a customer does with a plate scoring `score` (0..100). The first time, a clearly wrong
 * order goes back for changes and a really wrong one is refused. Once they've sent it back,
 * they take whatever comes unless it's still really wrong. `faulty` (see ScoreResult) sends
 * an otherwise decent plate back the first time, and so does `missing` (a whole ordered item
 * left off), on every difficulty.
 */
export function verdict(score: number, d: Difficulty, sentBack: boolean, faulty = false, missing = false): "accept" | "sendBack" | "refuse" {
  const spec = DIFFICULTY[d];
  if (score < spec.refuse) return "refuse";
  if (!sentBack && missing) return "sendBack";
  // A raw patty or a missing layer goes back even when the rest is lovely (Relaxed lets the small stuff slide).
  if (!sentBack && (score < spec.sendBack || (faulty && (d !== "chill" || score < 75)))) return "sendBack";
  return "accept";
}
