import { opinionFor, type Opinion } from "../game/reviews";
import { icon } from "./icons";

/**
 * Opinion faces (DESIGN.md §26): the little round face over a served customer's head, from
 * delighted (pine) to angry (coral). Drawn like the patience face on the tickets: a filled disc
 * with an ink outline and ink features. Styles in style.css (`.op-face`).
 */
const FEATURES: Record<Opinion, string> = {
  delighted: `<path d="M4.4 7.6q1.4-1.7 2.8 0M8.8 7.6q1.4-1.7 2.8 0"/><path class="fill" d="M4.7 9.6h6.6a3.3 3.3 0 0 1-6.6 0z"/>`,
  happy: `<circle cx="5.9" cy="7.2" r="1"/><circle cx="10.1" cy="7.2" r="1"/><path d="M5.1 10.1c1.6 1.9 4.2 1.9 5.8 0"/>`,
  meh: `<circle cx="5.9" cy="7.4" r="1"/><circle cx="10.1" cy="7.4" r="1"/><path d="M5.5 11h5"/>`,
  unhappy: `<path d="M4.6 5.9l2.3-.9M11.4 5.9l-2.3-.9"/><circle cx="5.9" cy="7.8" r="1"/><circle cx="10.1" cy="7.8" r="1"/><path d="M5.3 12.1c1.6-1.6 3.8-1.6 5.4 0"/>`,
  angry: `<path d="M4.2 5.1l2.8 1.4M11.8 5.1l-2.8 1.4"/><circle cx="5.9" cy="8" r="1"/><circle cx="10.1" cy="8" r="1"/><path d="M5 12.3c1.8-1.9 4.2-1.9 6 0"/>`,
};

const LABEL: Record<Opinion, string> = { delighted: "Delighted", happy: "Happy", meh: "So-so", unhappy: "Unhappy", angry: "Angry" };

export function opinionFace(stars: number, cls = ""): string {
  const op = opinionFor(stars);
  return `<svg class="op-face ${op} ${cls}" viewBox="0 0 16 16" role="img" aria-label="${LABEL[op]}"><circle class="disc" cx="8" cy="8" r="7.2"/><g>${FEATURES[op]}</g></svg>`;
}

export const opinionLabel = (stars: number) => LABEL[opinionFor(stars)];

/** A row of five stars, `n` of them filled (the Dusk `.bv-stars`). */
export function starRow(n: number, cls = ""): string {
  return `<span class="bv-stars ${cls}" role="img" aria-label="${n} star${n === 1 ? "" : "s"} of 5">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= n ? "on" : "off"}">${icon("star")}</span>`).join("")}</span>`;
}
