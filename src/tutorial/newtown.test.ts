import { describe, expect, it } from "vitest";
import { newTown } from "./lessons";

/* The coach's first "new town" lesson points at the road that leads on (DESIGN §49). */
describe("the first new town", () => {
  it("is Cedar Falls, not the Elk Pass spur, whatever order they opened in", () => {
    expect(newTown({ town: "pinecrest", unlocked: ["pinecrest", "elkpass", "cedarfalls"], shiftsIn: { pinecrest: 3 } })).toBe("cedarfalls");
  });
  it("falls back to the spur once Cedar Falls has been worked", () => {
    expect(newTown({ town: "pinecrest", unlocked: ["pinecrest", "elkpass", "cedarfalls"], shiftsIn: { pinecrest: 3, cedarfalls: 1 } })).toBe("elkpass");
  });
  it("is nothing before the first shift or away from the first town", () => {
    expect(newTown({ town: "pinecrest", unlocked: ["pinecrest"], shiftsIn: {} })).toBe(null);
    expect(newTown({ town: "cedarfalls", unlocked: ["pinecrest", "elkpass", "cedarfalls"], shiftsIn: { pinecrest: 3 } })).toBe(null);
  });
});
