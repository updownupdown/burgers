import { describe, expect, it } from "vitest";
import { FrameWatch, SLOW_FOR, stepDown, WARMUP } from "./perf";

const run = (w: FrameWatch, ms: number, seconds: number, counts = true) => {
  let fired = 0;
  for (let t = 0; t < seconds; t += ms / 1000) if (w.sample(ms, counts)) fired++;
  return fired;
};

describe("graphics step-down", () => {
  it("steps one level, never below Low", () => {
    expect(stepDown("high")).toBe("standard");
    expect(stepDown("standard")).toBe("low");
    expect(stepDown("low")).toBeNull();
  });

  it("leaves a smooth shift alone", () => {
    expect(run(new FrameWatch(), 16.7, 60)).toBe(0);
    expect(run(new FrameWatch(), 22, 60)).toBe(0);
  });

  it("fires once after several slow seconds, past the warm-up", () => {
    const w = new FrameWatch();
    expect(run(w, 40, WARMUP + SLOW_FOR - 1)).toBe(0);
    expect(run(w, 40, 3)).toBe(1);
    expect(run(w, 40, 30)).toBe(0);
  });

  it("doesn't count frames that don't count (paused, guided order) or one-off hitches", () => {
    const w = new FrameWatch();
    expect(run(w, 40, 30, false)).toBe(0);
    expect(run(w, 400, 30)).toBe(0);
  });

  it("a fast patch resets the slow run", () => {
    const w = new FrameWatch();
    run(w, 16, WARMUP);
    run(w, 40, SLOW_FOR - 1.5);
    run(w, 10, 2);
    expect(w.slowFor).toBe(0);
  });

  it("starts again from a warm-up each shift", () => {
    const w = new FrameWatch();
    run(w, 40, WARMUP + 1);
    w.reset();
    expect(w.counted).toBe(0);
    expect(run(w, 40, WARMUP + SLOW_FOR - 1)).toBe(0);
  });

  it("does nothing once it has fired on this install", () => {
    expect(run(new FrameWatch(true), 60, 60)).toBe(0);
  });
});
