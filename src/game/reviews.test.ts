import { describe, expect, it } from "vitest";
import { seededRng } from "./menu";
import { migrateSave, SAVE_VERSION, type Save } from "./progress";
import { addReviews, leavesReview, noReviews, opinionFor, opinionLine, PRIOR, ratingPull, REVIEW_CHANCE, reviewAverage, reviewChance, reviewTotal, toCounts } from "./reviews";
import { starsFor } from "./scoring";

describe("five stars", () => {
  it("makes a good order 4★ and a great one 5★", () => {
    expect(starsFor(100)).toBe(5);
    expect(starsFor(90)).toBe(5);
    expect(starsFor(89)).toBe(4);
    expect(starsFor(70)).toBe(4);
    expect(starsFor(69)).toBe(3);
    expect(starsFor(57)).toBe(3);
    expect(starsFor(56)).toBe(2);
    expect(starsFor(45)).toBe(2);
    expect(starsFor(44)).toBe(1);
    expect(starsFor(0)).toBe(1);
  });

  it("never goes down as the score goes up", () => {
    for (let s = 1; s <= 100; s++) expect(starsFor(s)).toBeGreaterThanOrEqual(starsFor(s - 1));
  });

  it("gives every opinion a face, angry to delighted", () => {
    expect([1, 2, 3, 4, 5].map(opinionFor)).toEqual(["angry", "unhappy", "meh", "happy", "delighted"]);
  });
});

describe("who leaves a review", () => {
  it("is skewed to the delighted and the furious", () => {
    expect(reviewChance(5)).toBeGreaterThan(reviewChance(4));
    expect(reviewChance(1)).toBeGreaterThan(reviewChance(2));
    expect(reviewChance(2)).toBeGreaterThan(reviewChance(3));
    expect(reviewChance(3)).toBeLessThan(0.15);
    expect(reviewChance(4)).toBeLessThan(0.2);
    expect(reviewChance(5)).toBeGreaterThanOrEqual(0.5);
    expect(reviewChance(1)).toBeGreaterThanOrEqual(0.5);
  });

  it("always includes a critic", () => {
    for (const s of [1, 2, 3, 4, 5]) expect(reviewChance(s, true)).toBe(1);
    const rng = seededRng(3);
    for (let i = 0; i < 50; i++) expect(leavesReview(3, true, rng)).toBe(true);
  });

  it("matches the chances over many customers", () => {
    const rng = seededRng(42);
    for (const s of [1, 2, 3, 4, 5] as const) {
      let n = 0;
      for (let i = 0; i < 4000; i++) if (leavesReview(s, false, rng)) n++;
      expect(n / 4000).toBeCloseTo(REVIEW_CHANCE[s], 1);
    }
  });
});

describe("the breakdown", () => {
  it("counts reviews per star and averages them", () => {
    expect(reviewAverage(noReviews())).toBeNull();
    const c = addReviews(noReviews(), [5, 5, 4, 1]);
    expect(c).toEqual([1, 0, 0, 1, 2]);
    expect(reviewTotal(c)).toBe(4);
    expect(reviewAverage(c)).toBeCloseTo(3.75);
    expect(reviewAverage([0, 0, 0, 0, 3])).toBe(5);
    expect(reviewAverage([2, 0, 0, 0, 0])).toBe(1);
  });

  it("leaves the counts it was given alone", () => {
    const c = noReviews();
    addReviews(c, [5]);
    expect(c).toEqual([0, 0, 0, 0, 0]);
  });

  it("cleans up whatever was stored", () => {
    expect(toCounts(undefined)).toEqual([0, 0, 0, 0, 0]);
    expect(toCounts([1, -2, "3", 2.7])).toEqual([1, 0, 3, 2, 0]);
  });

  it("weighs a new truck's first reviews gently when pulling in customers", () => {
    expect(ratingPull(noReviews())).toBe(PRIOR.stars);
    expect(ratingPull([1, 0, 0, 0, 0])).toBeGreaterThan(3);
    expect(ratingPull([0, 0, 0, 0, 200])).toBeGreaterThan(4.9);
  });
});

describe("what customers say", () => {
  const rng = () => 0;
  const base = { stars: 4, missing: null, notes: [] as string[], perks: [] as string[], patience: 0.5 };

  it("stays quiet about an ordinary good order", () => {
    expect(opinionLine(base, rng)).toBeNull();
    expect(opinionLine({ ...base, stars: 3 }, rng)).toBeNull();
    expect(opinionLine({ ...base, notes: ["messy stack"] }, rng)).toBeNull();
  });

  it("says what was missing or wrong", () => {
    expect(opinionLine({ ...base, stars: 2, missing: "forgot the drink", notes: ["forgot the drink"] }, rng)).toBe("Forgot the drink!");
    expect(opinionLine({ ...base, stars: 3, notes: ["soggy fries", "messy stack"] }, rng)).toBe("Soggy fries.");
    expect(opinionLine({ ...base, stars: 1, notes: ["missing ketchup, patty, lettuce, bun"] }, rng)).toBe("Missing ketchup and more.");
  });

  it("notices especially quick or especially good orders", () => {
    expect(opinionLine({ ...base, patience: 0.9 }, rng)).toMatch(/quick|fast/i);
    expect(opinionLine({ ...base, stars: 5 }, rng)).toBeTruthy();
    expect(opinionLine({ ...base, stars: 5, perks: ["grill marks"] }, rng)).toBe("Love the grill marks.");
    expect(opinionLine({ ...base, perks: ["free fries"] }, rng)).toBe("Thanks for the free fries!");
  });

  it("has no clever quips", () => {
    for (let k = 0; k < 20; k++) {
      const r = () => k / 20;
      for (const stars of [1, 2, 3, 4, 5]) {
        const line = opinionLine({ ...base, stars, patience: 1 }, r) ?? "";
        expect(line).not.toMatch(/grandma|chef's kiss|incredible/i);
      }
    }
  });
});

describe("old saves", () => {
  const old = {
    town: "summit",
    unlocked: ["pinecrest", "summit"],
    shiftsIn: { pinecrest: 3, summit: 1 },
    bank: 512,
    bonuses: ["bench"],
    looks: ["teal"],
    tutorialDone: true,
    popularity: 61,
    ratingCount: 40,
    ratingSum: 88,
    rep: 2.3,
    repWeight: 30,
    reviews: [{ stars: 3, text: "Just like grandma's!", stop: "Summit City" }],
    press: [{ outlet: "paper", source: "The Gazette", headline: "Hi", quote: "Fine.", stars: 2, pop: 4 }],
    best: { pinecrest: 2.6 },
  } as unknown as Partial<Save>;

  it("wipes three-star ratings, review text and clippings, and keeps the rest", () => {
    const s = migrateSave(old);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.reviewCounts).toEqual([0, 0, 0, 0, 0]);
    expect(s.press).toEqual([]);
    expect(s.best).toEqual({});
    const bag = s as unknown as Record<string, unknown>;
    for (const k of ["ratingCount", "ratingSum", "rep", "repWeight", "reviews"]) expect(bag[k]).toBeUndefined();
    expect(s.bank).toBe(512);
    expect(s.bonuses).toEqual(["bench"]);
    expect(s.looks).toContain("teal");
    expect(s.shiftsIn).toEqual({ pinecrest: 3, summit: 1 });
    expect(s.popularity).toBe(61);
    expect(s.tutorialDone).toBe(true);
    expect(s.town).toBe("summit");
  });

  it("keeps the counts of a current save", () => {
    const s = migrateSave({ ...migrateSave(old), reviewCounts: [1, 2, 3, 4, 5], best: { summit: 4.2 } });
    expect(s.reviewCounts).toEqual([1, 2, 3, 4, 5]);
    expect(s.best.summit).toBe(4.2);
    expect(JSON.stringify(s)).not.toMatch(/grandma/i);
  });
});
