/**
 * How hard a shift is. Patience and spawn gaps scale against the base numbers in main.ts;
 * the thresholds decide what a customer does with a plate (see verdict()).
 */
export type Difficulty = "chill" | "balanced" | "stressful";

export interface DifficultySpec {
  label: string;
  blurb: string;
  /** Multiplies every customer's patience. */
  patience: number;
  /** Multiplies the gap between arrivals: more is calmer. */
  spawnGap: number;
  /** Scores below this get sent back for changes (first time). */
  sendBack: number;
  /** Scores below this get refused outright. */
  refuse: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultySpec> = {
  chill: { label: "Chill", blurb: "Patient customers, gaps between them, and only a really wrong order comes back.", patience: 1.75, spawnGap: 1.45, sendBack: 40, refuse: 12 },
  balanced: { label: "Balanced", blurb: "A steady lunch rush. Customers send back what's clearly off.", patience: 1.3, spawnGap: 1.15, sendBack: 55, refuse: 22 },
  stressful: { label: "Stressful", blurb: "Short fuses and a packed line. Picky about every order.", patience: 0.92, spawnGap: 0.9, sendBack: 68, refuse: 32 },
};

export const DIFFICULTIES = Object.keys(DIFFICULTY) as Difficulty[];

/**
 * What a customer does with a plate scoring `score` (0..100). The first time, a clearly wrong
 * order goes back for changes and a really wrong one is refused. Once they've sent it back,
 * they take whatever comes unless it's still really wrong. `faulty` (see ScoreResult) sends
 * an otherwise decent plate back the first time.
 */
export function verdict(score: number, d: Difficulty, sentBack: boolean, faulty = false): "accept" | "sendBack" | "refuse" {
  const spec = DIFFICULTY[d];
  if (score < spec.refuse) return "refuse";
  // A raw patty or a missing layer goes back even when the rest is lovely (Chill lets the small stuff slide).
  if (!sentBack && (score < spec.sendBack || (faulty && (d !== "chill" || score < 75)))) return "sendBack";
  return "accept";
}
