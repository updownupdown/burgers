/**
 * Opinions and reviews (DESIGN.md §26). Every customer who orders has an opinion of the food,
 * 1 to 5 stars, shown as a face over their head; only some of them go on to leave a review.
 * As in real life, the delighted and the furious write in far more often than the merely fed.
 * Reviews are kept only as a count per star; the rating is their average.
 */

export type Stars = 1 | 2 | 3 | 4 | 5;

/** Reviews left per star: index 0 holds the 1★ reviews, index 4 the 5★ ones. */
export type StarCounts = [number, number, number, number, number];

export const noReviews = (): StarCounts => [0, 0, 0, 0, 0];

/** Chance an ordinary customer leaves a review, by their opinion. Critics always do. */
export const REVIEW_CHANCE: Record<Stars, number> = { 1: 0.5, 2: 0.35, 3: 0.12, 4: 0.18, 5: 0.5 };

export function reviewChance(stars: number, critic = false): number {
  if (critic) return 1;
  return REVIEW_CHANCE[clampStars(stars)];
}

/** Does this customer leave a review? */
export function leavesReview(stars: number, critic: boolean, rng: () => number): boolean {
  return rng() < reviewChance(stars, critic);
}

export function clampStars(n: number): Stars {
  return Math.max(1, Math.min(5, Math.round(n))) as Stars;
}

/** Counts with these reviews added (a new array; the old one is left alone). */
export function addReviews(counts: readonly number[], stars: readonly number[]): StarCounts {
  const out = toCounts(counts);
  for (const s of stars) out[clampStars(s) - 1]++;
  return out;
}

/** Anything stored made into five non-negative whole counts. */
export function toCounts(x: unknown): StarCounts {
  const a = Array.isArray(x) ? x : [];
  return [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.floor(Number(a[i]) || 0))) as StarCounts;
}

export function reviewTotal(counts: readonly number[]): number {
  return counts.reduce((a, b) => a + b, 0);
}

/** The rating: the average of every review, or null before the first one. */
export function reviewAverage(counts: readonly number[]): number | null {
  const n = reviewTotal(counts);
  if (!n) return null;
  return counts.reduce((sum, c, i) => sum + c * (i + 1), 0) / n;
}

/**
 * The rating as passers-by weigh it when deciding to stop: the average, pulled toward a plain 4★
 * as if the truck started with a few such reviews, so the first one or two can't make or break it.
 */
export const PRIOR = { stars: 4, reviews: 5 };
export function ratingPull(counts: readonly number[]): number {
  const n = reviewTotal(counts);
  const sum = counts.reduce((s, c, i) => s + c * (i + 1), 0);
  return (sum + PRIOR.stars * PRIOR.reviews) / (n + PRIOR.reviews);
}

/** The face over a customer's head. */
export type Opinion = "delighted" | "happy" | "meh" | "unhappy" | "angry";
export const OPINIONS: Opinion[] = ["angry", "unhappy", "meh", "happy", "delighted"];
export function opinionFor(stars: number): Opinion {
  return OPINIONS[clampStars(stars) - 1];
}

/** What the served customer tells you, when there's something specific to say. */
export interface OpinionInput {
  stars: number;
  /** A whole ordered item left off ("forgot the drink"). */
  missing: string | null;
  /** What was wrong with it, worst first ("soggy fries"). */
  notes: readonly string[];
  /** Nice touches ("free fries", "grill marks"). */
  perks: readonly string[];
  /** Patience left when served, 0..1. */
  patience: number;
}

const QUICK = ["That was quick!", "So fast, thanks!", "Quick!"];
const SPOT_ON = ["Spot on.", "Just right.", "Perfect.", "Really good."];
const PERK_LINE: Record<string, string> = { "grill marks": "Love the grill marks.", "leopard spots": "Lovely crust.", "hand-pressed tortillas": "Fresh tortillas!" };

/** Served this fast (patience left) counts as especially quick. */
export const QUICK_AT = 0.8;

/**
 * A short, plain line, only when it says something: what was missing, what went wrong, a thank
 * you for a freebie, or that it was especially quick or especially good. Otherwise null, and the
 * face says it all.
 */
export function opinionLine(o: OpinionInput, rng: () => number): string | null {
  const pick = (xs: readonly string[]) => xs[Math.floor(rng() * xs.length)];
  if (o.missing) return `${cap(brief(o.missing))}!`;
  if (o.stars <= 3 && o.notes.length) return `${cap(brief(o.notes[0]))}.`;
  const free = o.perks.find((p) => p.startsWith("free "));
  if (free) return `Thanks for the ${free}!`;
  // A 4★ says what cost the fifth star (after build #78), shown as a small grey line.
  if (o.stars === 4 && o.notes.length) return fourStarNote(o.notes);
  if (o.stars >= 4 && o.patience >= QUICK_AT) return pick(QUICK);
  if (o.stars === 5) {
    const perk = o.perks.find((p) => PERK_LINE[p]);
    return perk ? PERK_LINE[perk] : pick(SPOT_ON);
  }
  return null;
}

/** What kept a 4★ order from five, as the customer's small aside ("Fries needed salt."). */
export function fourStarNote(notes: readonly string[]): string {
  return `${cap(brief(notes[0]))}.`;
}

/** A note kept short enough for a bubble: "missing ketchup, patty, lettuce, bun" → "missing ketchup and more". */
export function brief(note: string): string {
  const parts = note.split(", ");
  return parts.length > 2 ? `${parts[0]} and more` : note;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
