import type { Save } from "./progress";

/**
 * How much of the business the player runs. Pacing (difficulty.ts) is how fast the window
 * moves; complexity is how many dials the day has. It can change at any time: the save keeps
 * reputation, reviews, upgrades and prices, so a player can opt in later or step back and pick
 * up where they left off.
 *
 * - simple:   cook and serve. No menu, prices or ingredient choices; Prep is a short card.
 * - balanced: run the business, with the Prep screen kept to its collapsed lines.
 * - complex:  everything, with the ledger and every box's detail open to read.
 */
export type Complexity = "simple" | "balanced" | "complex";

export interface ComplexitySpec {
  id: Complexity;
  label: string;
  blurb: string;
}

export const COMPLEXITY: Record<Complexity, ComplexitySpec> = {
  simple: { id: "simple", label: "Simple", blurb: "Cook and serve. The menu and prices are set for you; the truck earns a little less." },
  balanced: { id: "balanced", label: "Balanced", blurb: "Pick the menu, ingredients and prices before each shift, in a short Prep screen." },
  complex: { id: "complex", label: "Complex", blurb: "The full ledger: costs, projections and every detail, open to read before you open." },
};

export const COMPLEXITIES = Object.keys(COMPLEXITY) as Complexity[];

/** The save's level, read from the two flags older code and saves use. */
export function complexityOf(s: Pick<Save, "biz" | "simplePlan">): Complexity {
  return !s.biz ? "simple" : s.simplePlan ? "balanced" : "complex";
}

/** Set the level. Only the two flags move; reputation, reviews, upgrades and the plan stay put. */
export function setComplexity(s: Pick<Save, "biz" | "simplePlan">, c: Complexity): void {
  s.biz = c !== "simple";
  s.simplePlan = c === "balanced";
}
