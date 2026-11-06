import { describe, expect, it } from "vitest";
import { addToLog, logEntry, logText, LOG_MAX } from "./shiftlog";

const shift = (day: number) => logEntry({ day, town: "pinecrest", tier: "chill", crowd: 14, served: 12, walked: 1, left: 2, stars: [5, 4, 4], takings: 101.6, overrun: 12.4 });

describe("shift log", () => {
  it("rounds stars, takings and overrun", () => {
    expect(shift(1)).toEqual({ day: 1, town: "pinecrest", tier: "chill", crowd: 14, served: 12, walked: 1, left: 2, stars: 4.3, takings: 102, overrun: 12 });
    expect(logEntry({ day: 1, town: "x", tier: "busy", crowd: 0, served: 0, walked: 0, left: 0, stars: [], takings: 0, overrun: -3 }).stars).toBe(0);
  });

  it("keeps the newest entries only", () => {
    let list = [] as ReturnType<typeof shift>[];
    for (let d = 1; d <= LOG_MAX + 5; d++) list = addToLog(shift(d), list);
    expect(list.length).toBe(LOG_MAX);
    expect(list[0].day).toBe(6);
  });

  it("copies as a sheet with a header row", () => {
    const t = logText([shift(3)]).split("\n");
    expect(t[0]).toBe("day\ttown\ttier\tcrowd\tserved\twalked\tleft\tstars\ttakings\toverrun");
    expect(t[1]).toBe("3\tpinecrest\tchill\t14\t12\t1\t2\t4.3\t102\t12");
  });
});
