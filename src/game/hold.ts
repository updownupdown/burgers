import { BREADS, GRILLABLE, isSauce, PROTEINS, SCOOPED, TORTILLAS, type Kind, type Layer, type Piece } from "./types";

/*
 * Food waiting on a tray (DESIGN §24, after build #73). Cooked food on a tray slowly goes cold and
 * dry (`Piece.held` counts the seconds, scoring.heldPenalty turns them into a mark-down); the warm
 * end of the grill or comal is the place to hold it instead, where it ages at half the pace
 * (WARM_AGE). Red Rock's tacos are built in the taco rack on the comal's warm end, which ages them
 * at the same half pace; on a tray, a run of tacos is as fresh as
 * the last taco that joined it, so the first taco isn't marked down for the time the fourth took.
 */

/**
 * Warm holding (after build #78): the warm end of the grill or comal and the taco rack keep cooked
 * food, but not for free: it ages at this fraction of the tray's pace, and shows the same bar.
 */
export const WARM_AGE = 0.5;

/** Does this piece go cold and dry while it waits on a tray? Only cooked food does. */
export function goesStale(p: Piece): boolean {
  return (GRILLABLE.has(p.kind) || BREADS.has(p.kind) || PROTEINS.has(p.kind) || p.kind === "dough") && Math.max(...p.cook) > 0.15;
}

/** Age the food on a tray by dt seconds (`rate` 0.5 under the heat lamp). */
export function ageLayers(layers: Layer[], dt: number, rate = 1): void {
  for (const l of layers) if (goesStale(l.piece)) l.piece.held = (l.piece.held ?? 0) + dt * rate;
}

/** Tacos in a rack: the base is an open (unfolded) tortilla. */
export function isTacoRun(layers: readonly Layer[]): boolean {
  const b = layers[0]?.piece;
  return !!b && TORTILLAS.has(b.kind) && !b.folded;
}

/** The taco rack on the comal holds this many tacos (a Rodeo Platter's four). */
export const RACK_SLOTS = 4;

/** What can go in the taco rack besides tortillas: the fillings and the lime wedge (never sauce: that goes on at the tray). */
export const RACK_FILL: ReadonlySet<Kind> = new Set<Kind>(["pork", "beans", "egg", "pineapple", "jack", "jalapeno", "onion", "cilantro", "lettuce", "lime"]);

/** Scoops and eggs go one per taco; lime wedges sit beside the rack. Everything else is sprinkled over every taco. */
const ONE_EACH: ReadonlySet<Kind> = new Set<Kind>([...SCOOPED, "egg", "lime"]);
const sprinkle = (k: Kind) => !TORTILLAS.has(k) && !ONE_EACH.has(k) && !isSauce(k);

/**
 * Tacos joining a run of tacos (in the rack, or on a tray): a tortilla built on the comal brings
 * its own filling, but a sprinkle (onion, cilantro...) is drawn over every taco in the rack, so one
 * the run already has isn't doubled. Single pieces dropped in on their own (a second pinch of
 * onion) always count. Returns the joined layers; the run is as fresh as the newest taco in it.
 */
export function joinTacos(run: readonly Layer[], incoming: readonly Layer[]): Layer[] {
  const tacos = incoming.some((l) => TORTILLAS.has(l.piece.kind));
  const has = new Set(run.map((l) => l.piece.kind));
  const add = tacos ? incoming.filter((l) => !(sprinkle(l.piece.kind) && has.has(l.piece.kind))) : [...incoming];
  const out = [...run, ...add];
  if (tacos) freshen(out, incoming);
  return out;
}

/**
 * Staleness on a run of tacos counts from the last taco placed: when tortillas join, everything
 * in the run takes the age of the freshest of them.
 */
export function freshen(run: readonly Layer[], incoming: readonly Layer[]): void {
  const ages = incoming.filter((l) => TORTILLAS.has(l.piece.kind)).map((l) => l.piece.held ?? 0);
  if (!ages.length) return;
  const newest = Math.min(...ages);
  for (const l of run) if ((l.piece.held ?? 0) > newest) l.piece.held = newest;
}
