import { afterEach, describe, expect, it, vi } from "vitest";
import { freshSave, loadSave, migrateSave, todaysClosing, type Closing, type Save } from "./progress";
import { applyTrip, planTrip } from "./travel";
import { rangeUnits } from "./day";
import { STOPS } from "./stops";

/** A Closing for today's shift in `town`, enough for the checks here. */
function closing(town: string, day: number): Closing {
  return { town, day, served: 3, lost: 0, leftLine: 0, walkedPast: 0, stars: [5, 4, 5], reviews: [5], earned: 30, tips: 3, comped: 0, spills: 0, takings: 33, bestBefore: null, rating: 5, ratingBefore: null, pop: [40, 41], best: null, outcome: "passed", opened: [], shiftsHere: 1, press: null, great: false, unlocked: null, usedBonus: null, bank: 33 } as unknown as Closing;
}

const raw = (s: Save) => JSON.parse(JSON.stringify(s)) as Parameters<typeof migrateSave>[0];

describe("today's results after an evening hop (review #78 B4)", () => {
  const home = STOPS[0];
  const next = STOPS.find((t) => home.roads.includes(t.id))!;

  it("keeps today's Closing wherever the truck is that evening", () => {
    const s: Save = { ...freshSave(), town: home.id, day: 3, time: "evening", unlocked: [home.id, next.id] };
    s.last = closing(home.id, 3);
    const trip = planTrip(s.town, next.id, s.unlocked, { time: s.time, range: rangeUnits(), driven: s.driven })!;
    expect(trip.when).toBe("now");
    applyTrip(s, trip);
    expect(s.town).toBe(next.id);
    expect(todaysClosing(s)).toBe(s.last);
    // And a reload keeps it too.
    expect(migrateSave(raw(s)).last?.town).toBe(home.id);
  });

  it("drops a Closing from another day, or in the morning", () => {
    const s: Save = { ...freshSave(), day: 4, time: "evening" };
    s.last = closing(s.town, 3);
    expect(todaysClosing(s)).toBeNull();
    expect(migrateSave(raw(s)).last).toBeNull();
    const m: Save = { ...freshSave(), day: 3, time: "morning" };
    m.last = closing(m.town, 3);
    expect(todaysClosing(m)).toBeNull();
  });
});

describe("town bests (review #78 B8)", () => {
  it("forgets a 0.0★ best left by a shift with nobody served", () => {
    const s = { ...freshSave(), best: { a: 0, b: 4.2 } };
    expect(migrateSave(raw(s)).best).toEqual({ b: 4.2 });
  });
});

describe("a new trip", () => {
  it("clears the regulars' good visits along with popularity", () => {
    const s: Save = { ...freshSave(), popularity: 70, regulars: { pinecrest: 3 } };
    // main.ts starts a new trip this way.
    Object.assign(s, freshSave(), { tutorialDone: s.tutorialDone, trips: s.trips, best: s.best });
    expect(s.regulars).toEqual({});
  });
});

describe("an unreadable save (review #78 B12)", () => {
  const store = new Map<string, string>();
  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
  });

  it("is kept aside before a fresh trip starts", () => {
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    store.set("bv-save-v1", "{not json");
    const s = loadSave();
    expect(s.day).toBe(freshSave().day);
    const kept = [...store.keys()].filter((k) => k.startsWith("bv-save-broken-"));
    expect(kept).toHaveLength(1);
    expect(store.get(kept[0])).toBe("{not json");
    warn.mockRestore();
  });
});
