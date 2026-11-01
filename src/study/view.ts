/**
 * Kitchen view study (2026-11-01): candidate looks for the window, the wall the receipts and trays
 * sit against, the pass shelf, the seam into the counter, and how much back wall the counter shows.
 * Chosen with `?view=A|B|C|D`; with no parameter the game draws as before. Study only: the picked
 * option gets built properly afterwards.
 */

export interface ViewOpt {
  id: string;
  name: string;
  /** The truck's inside wall: round the window, under it (receipts), behind the trays and the backsplash. */
  wall: string;
  /** How the wall is finished. */
  wallTex: "paint" | "tile" | "steel" | "dark";
  /** The window's trim, inside the wall opening. "look" takes the truck's paint colour. */
  trim: "steel" | "wood" | "look";
  /** The pass shelf the trays sit on, and its front edge. */
  shelf: { top: string; nose: string; hl: string; fascia: number };
  /** Tray look override (see TrayStyle). */
  tray?: "board" | "diner" | "kraft" | "sheet";
  /** How much wall shows above the counter, in game units (today about 2.4). */
  splash: number;
  /** Counter camera pitch, degrees from horizontal (today 67). */
  pitch: number;
  /** Counter steel base colour and streak count. */
  counter: { color: string; streaks: number };
  /** Share of the space saved on the counter band that goes to the window band (the rest goes to the trays). */
  toWindow: number;
  /** Draw a soft shadow from the shelf's front edge onto the backsplash. */
  shadow: number;
}

export const VIEW_OPTS: Record<string, ViewOpt> = {
  A: {
    id: "A",
    name: "Painted cabin",
    wall: "#e8dfd0",
    wallTex: "paint",
    trim: "steel",
    shelf: { top: "#c9d0ce", nose: "#a7b0ae", hl: "#f4f7f6", fascia: 0.34 },
    splash: 0.65,
    pitch: 67,
    counter: { color: "#c8cfcf", streaks: 900 },
    toWindow: 0.6,
    shadow: 0.3,
  },
  B: {
    id: "B",
    name: "Truck enamel",
    wall: "look",
    wallTex: "paint",
    trim: "look",
    shelf: { top: "#c9d0ce", nose: "#4d5553", hl: "#dfe4e3", fascia: 0.5 },
    splash: 0.12,
    pitch: 74,
    counter: { color: "#cdd3d2", streaks: 500 },
    toWindow: 0.55,
    shadow: 0.34,
  },
  C: {
    id: "C",
    name: "Diner tile",
    wall: "#f3f0e8",
    wallTex: "tile",
    trim: "wood",
    shelf: { top: "#c48e58", nose: "#9c6638", hl: "#e0b07c", fascia: 0.4 },
    tray: "diner",
    splash: 0.75,
    pitch: 67,
    counter: { color: "#c4cccc", streaks: 1600 },
    toWindow: 0.55,
    shadow: 0.28,
  },
  D: {
    id: "D",
    name: "Night pass",
    wall: "#353a42",
    wallTex: "dark",
    trim: "steel",
    shelf: { top: "#9aa3a2", nose: "#6c7473", hl: "#e3e8e7", fascia: 0.36 },
    splash: 0.45,
    pitch: 70,
    counter: { color: "#bfc7c7", streaks: 700 },
    toWindow: 0.6,
    shadow: 0.4,
  },
};

function pick(): ViewOpt | null {
  try {
    const q = new URLSearchParams(location.search).get("view");
    return (q && VIEW_OPTS[q.toUpperCase()]) || null;
  } catch {
    return null;
  }
}

/** The option being studied, or null for today's look. */
export const VIEW: ViewOpt | null = pick();
