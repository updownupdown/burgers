import { describe, expect, it } from "vitest";
import { renderMap, VIEW, type MapState } from "./map";
import { DEFAULT_LOOK } from "../game/looks";

const state = (extra: Partial<MapState> = {}): MapState => ({
  town: "pinecrest",
  unlocked: ["pinecrest", "elkpass", "cedarfalls"],
  shiftsIn: { pinecrest: 3 },
  day: 4,
  selected: null,
  night: false,
  reach: [],
  look: DEFAULT_LOOK,
  bonusHere: [],
  ...extra,
});

const svgTag = (html: string) => html.slice(0, html.indexOf(">") + 1);

describe("renderMap size", () => {
  // Build #82: the map redrawn when a drive finished had only a viewBox, so it laid out as 0 x 0
  // in the pan/zoom layer and showed as empty sea until a resize re-fitted it.
  it("draws the SVG at the fitted pixel size, so a redraw is never unsized", () => {
    const tag = svgTag(renderMap(state({ px: 0.85 })));
    expect(tag).toContain(`width="${VIEW.w * 0.85}"`);
    expect(tag).toContain(`height="${VIEW.h * 0.85}"`);
  });
  it("leaves the size off when none is known", () => {
    expect(svgTag(renderMap(state()))).not.toContain("width=");
  });
});
