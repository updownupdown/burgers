import { describe, expect, it } from "vitest";
import { freshSave, SAVE_VERSION } from "./progress";
import { checksum, decodeSave, describeSave, encodeSave } from "./savecode";

describe("save codes", () => {
  const trip = () => {
    const s = freshSave();
    s.day = 7;
    s.bank = 1234;
    s.unlocked = ["pinecrest", "elkpass", "cedarfalls"];
    s.hidden = ["Café Crème"];
    return s;
  };

  it("round-trips a save", () => {
    const s = trip();
    const code = encodeSave(s);
    expect(code.startsWith(`BV${SAVE_VERSION}.`)).toBe(true);
    const back = decodeSave(code);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.save.day).toBe(7);
      expect(back.save.bank).toBe(1234);
      expect(back.save.hidden).toEqual(["Café Crème"]);
    }
  });

  it("ignores spaces and line breaks a messenger adds", () => {
    const code = encodeSave(trip());
    const broken = `  ${code.slice(0, 20)}\n${code.slice(20, 50)} ${code.slice(50)}\n`;
    expect(decodeSave(broken).ok).toBe(true);
  });

  it("refuses a code with a changed or missing character", () => {
    const code = encodeSave(trip());
    const dot = code.lastIndexOf(".");
    const mid = Math.floor(dot / 2);
    const swapped = code.slice(0, mid) + (code[mid] === "A" ? "B" : "A") + code.slice(mid + 1);
    expect(decodeSave(swapped).ok).toBe(false);
    expect(decodeSave(code.slice(0, mid) + code.slice(mid + 1)).ok).toBe(false);
  });

  it("refuses text that isn't a code, and codes from a newer build", () => {
    expect(decodeSave("").ok).toBe(false);
    expect(decodeSave("hello there").ok).toBe(false);
    const json = JSON.stringify(trip());
    const newer = `BV${SAVE_VERSION + 1}.${btoa(json)}.${checksum(json)}`;
    const r = decodeSave(newer);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/newer/);
  });

  it("migrates an old save inside a code", () => {
    const old = { town: "pinecrest", day: 3, bank: 50, unlocked: ["pinecrest"], passedTowns: [], ribbons: 4, known: { "Classic": 2 } };
    const json = JSON.stringify(old);
    const r = decodeSave(`BV1.${btoa(json)}.${checksum(json)}`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.save.version).toBe(SAVE_VERSION);
      expect((r.save as unknown as Record<string, unknown>).ribbons).toBeUndefined();
      expect(r.save.reviewCounts).toEqual([0, 0, 0, 0, 0]);
    }
  });

  it("describes what it will load", () => {
    expect(describeSave(trip())).toBe("Day 7 in Pinecrest, 3 towns open, $1,234 saved.");
  });
});
