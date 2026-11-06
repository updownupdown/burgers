import { describe, expect, it } from "vitest";
import { ACTION_HOLD, ACTION_TIPS, HintLane, QUEUE_MAX, QUEUE_STALE, RECALL_SECONDS } from "./hintlane";

/*
 * The tip lane (DESIGN §49): lead tips win the lane, action tips wait for their action, and the
 * last tip can be shown again.
 */

describe("plain tips", () => {
  it("show at once for their seconds, the newest winning", () => {
    const l = new HintLane();
    l.show("one", 3, 0);
    expect(l.text(1)).toBe("one");
    l.show("two", 2, 1);
    expect(l.text(1.5)).toBe("two");
    expect(l.text(3.1)).toBe(null);
  });
});

describe("lead tips", () => {
  it("keep the lane for their time, with later tips queued after", () => {
    const l = new HintLane();
    l.show("New here: the press.", 6, 0, { lead: true });
    l.show("A first Caprese!", 4, 0.2);
    expect(l.text(3)).toBe("New here: the press.");
    expect(l.text(6.1)).toBe("A first Caprese!");
    expect(l.text(10.2)).toBe(null);
  });
  it("queue behind each other: an event day in a new region shows both", () => {
    const l = new HintLane();
    l.show("Fish fry today!", 6, 0, { lead: true });
    l.show("A first Caprese!", 4, 0.1);
    l.show("New here: the press.", 6, 0.1, { lead: true });
    expect(l.text(6.05)).toBe("New here: the press.");
    expect(l.text(12.2)).toBe("A first Caprese!");
  });
  it("drop stale and surplus waiting tips", () => {
    const l = new HintLane();
    l.show("lead", QUEUE_STALE + 2, 0, { lead: true });
    l.show("old", 3, 0.5);
    expect(l.text(QUEUE_STALE + 2.1)).toBe(null);
    const m = new HintLane();
    m.show("lead", 6, 0, { lead: true });
    for (let i = 0; i < QUEUE_MAX + 2; i++) m.show(`t${i}`, 3, 1);
    // The oldest plain ones went; the newest are still to come.
    expect(m.text(6.1)).toBe(`t2`);
  });
  it("drop a quick reaction that comes up meanwhile", () => {
    const l = new HintLane();
    l.show("lead", 6, 0, { lead: true });
    l.show("That tray is empty!", 1.5, 1);
    expect(l.text(1.1)).toBe("lead");
    expect(l.text(6.1)).toBe(null);
  });
  it("don't queue the same tip twice", () => {
    const l = new HintLane();
    l.show("lead", 6, 0, { lead: true });
    l.show("x", 3, 1);
    l.show("x", 3, 2);
    expect(l.text(6.1)).toBe("x");
    expect(l.text(9.2)).toBe(null);
  });
});

describe("action tips", () => {
  it("stay until the action happens", () => {
    const l = new HintLane();
    l.show("Pull the handle down.", 3, 0, { until: "press-close" });
    expect(l.text(8)).toBe("Pull the handle down.");
    l.done("press-close", 8);
    expect(l.text(8.1)).toBe(null);
  });
  it("or ACTION_HOLD seconds", () => {
    const l = new HintLane();
    l.show("Fold it.", 3, 0, { until: "fold" });
    expect(l.text(ACTION_HOLD - 0.1)).toBe("Fold it.");
    expect(l.text(ACTION_HOLD + 0.1)).toBe(null);
  });
  it("come back after a passing one-liner", () => {
    const l = new HintLane();
    l.show("Fold it.", 3, 0, { until: "fold" });
    l.show("Ham 1 of 2", 1.2, 2);
    expect(l.text(2.5)).toBe("Ham 1 of 2");
    expect(l.text(3.5)).toBe("Fold it.");
    l.done("fold", 4);
    expect(l.text(4)).toBe(null);
  });
  it("a done action under a one-liner doesn't come back", () => {
    const l = new HintLane();
    l.show("Fold it.", 3, 0, { until: "fold" });
    l.show("Nice!", 1.2, 2);
    l.done("fold", 2.5);
    expect(l.text(3.5)).toBe(null);
  });
  it("another action tip replaces it", () => {
    const l = new HintLane();
    l.show("Fold it.", 3, 0, { until: "fold" });
    l.show("Flip it.", 3, 1, { until: "flip" });
    l.show("Nice!", 1, 2);
    expect(l.text(3.5)).toBe("Flip it.");
    l.done("fold", 3.6);
    expect(l.text(3.7)).toBe("Flip it.");
  });
  it("every action key names a tag", () => {
    for (const tag of Object.values(ACTION_TIPS)) expect(tag).toMatch(/^[a-z-]+$/);
  });
});

describe("show it again", () => {
  it("brings the last tip back for a few seconds", () => {
    const l = new HintLane();
    expect(l.recall(0)).toBe(false);
    l.show("Watch the meter on the lid.", 4, 0);
    l.show("Clean crack!", 1.2, 1);
    expect(l.text(10)).toBe(null);
    expect(l.last).toBe("Watch the meter on the lid.");
    expect(l.recall(10)).toBe(true);
    expect(l.text(10 + RECALL_SECONDS - 0.1)).toBe("Watch the meter on the lid.");
    expect(l.text(10 + RECALL_SECONDS + 0.1)).toBe(null);
  });
  it("closing a tip drops it, and clear forgets the last", () => {
    const l = new HintLane();
    l.show("Fold it.", 3, 0, { until: "fold" });
    l.dismiss(1);
    expect(l.text(1)).toBe(null);
    expect(l.last).toBe("Fold it.");
    l.clear();
    expect(l.last).toBe("");
  });
});
