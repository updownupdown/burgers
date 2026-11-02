/**
 * The truck's inside, as seen from the cook's spot ("Painted cabin", picked by James from the
 * kitchen view study on 2026-11-02, DESIGN.md §25). One painted wall runs round the serving window,
 * behind the receipts, behind the pass shelf and down to the counter as a slim backsplash, so the
 * three bands (window, trays, counter) read as one room seen at three angles.
 */
export const CABIN = {
  /** The inside wall: warm cream paint with a faint speckle. */
  wall: "#e8dfd0",
  wallTex: "paint",
  /** The window's trim and sill. */
  trim: "#c9d0ce",
  /** The pass shelf the trays sit on: top, front face, and the bright rolled nose along it. */
  shelf: { top: "#c9d0ce", face: "#a7b0ae", nose: "#f4f7f6", faceH: 0.34 },
  /** How much wall shows above the counter, in game units. */
  splash: 0.65,
  /** Counter steel and how many brush streaks its tile carries (calmer than the old 1600). */
  counter: { color: "#c8cfcf", streaks: 900 },
  /** Share of the space saved on the counter band that goes to the window (the rest goes to the trays). */
  toWindow: 0.6,
  /** Opacity of the shelf's shadow on the wall just under it. */
  shadow: 0.3,
} as const;
