/**
 * The truck's looks: cosmetics bought with savings in the Garage. They change nothing in the
 * kitchen; they show on the truck on the road map, under the stars when the truck sleeps, and in
 * the Garage. One item per slot is worn at a time; everything bought is kept. (The shop dog of
 * build #58 was retired in favour of inflatables; saves that bought it get its price back.)
 *
 * Most are modest. A few are absurd and priced to match: long goals for a truck that has been
 * on the road a long time. Three are souvenirs, sold only once the truck has worked a shift in
 * their town.
 */

export type Slot = "paint" | "awning" | "roof" | "lights" | "wheels" | "inflatable" | "tag";

export interface LookItem {
  id: string;
  slot: Slot;
  name: string;
  /** One line for the Garage. */
  text: string;
  price: number;
  /** A souvenir: sold only after a shift in this town. */
  town?: string;
  /** Priced as a long goal. */
  grand?: boolean;
}

export const SLOTS: { id: Slot; name: string }[] = [
  { id: "paint", name: "Paint" },
  { id: "awning", name: "Awning" },
  { id: "roof", name: "Roof" },
  { id: "lights", name: "Lights" },
  { id: "wheels", name: "Wheels" },
  { id: "inflatable", name: "Inflatable" },
  { id: "tag", name: "Tag-along" },
];

export const LOOKS: LookItem[] = [
  { id: "coral", slot: "paint", name: "Coral", text: "The paint she came in.", price: 0 },
  { id: "sage", slot: "paint", name: "Sage", text: "Soft green with a cream belt line.", price: 150 },
  { id: "butter", slot: "paint", name: "Butter", text: "Warm yellow with a coral belt line.", price: 150 },
  { id: "dusk", slot: "paint", name: "Dusk blue", text: "Deep evening blue, mustard trim.", price: 250 },
  { id: "twotone", slot: "paint", name: "Diner two-tone", text: "Cream over cherry, split by a chrome strip.", price: 600 },
  { id: "woodie", slot: "paint", name: "Woodie", text: "Varnished wood panels in a cream frame.", price: 1200 },
  { id: "chrome", slot: "paint", name: "Polished aluminium", text: "Riveted, mirror-bright, catches every sunset.", price: 4000 },
  { id: "gold", slot: "paint", name: "Gold leaf", text: "Hand-laid gold leaf with filigree. It glints.", price: 40000, grand: true },

  { id: "mustard", slot: "awning", name: "Mustard", text: "A plain canvas awning.", price: 0 },
  { id: "stripes", slot: "awning", name: "Candy stripes", text: "Red and cream, with pointed flags.", price: 120 },
  { id: "teal", slot: "awning", name: "Teal scallops", text: "Teal canvas with cream scallops.", price: 200 },
  { id: "velvet", slot: "awning", name: "Velvet and fringe", text: "Burgundy velvet, gold fringe, tassels.", price: 6000, grand: true },

  { id: "none", slot: "roof", name: "Bare roof", text: "Nothing up there.", price: 0 },
  { id: "herbs", slot: "roof", name: "Herb garden", text: "Planters of basil, thyme and cherry tomatoes.", price: 300 },
  { id: "canoe", slot: "roof", name: "Canoe", text: "A cedar canoe on a roof rack. Sold in Cedar Falls.", price: 450, town: "cedarfalls" },
  { id: "surf", slot: "roof", name: "Surfboards", text: "Two boards, strapped down. Sold in Driftwood.", price: 450, town: "driftwood" },
  { id: "windmill", slot: "roof", name: "Windmill", text: "A little desert windmill that turns in the breeze. Sold in Dust Bowl Flats.", price: 900, town: "dustbowl" },
  { id: "neon", slot: "roof", name: "Neon sign", text: "The cloche in pink neon. Glows after dark.", price: 1500 },
  { id: "burger", slot: "roof", name: "Giant burger", text: "A fibreglass burger on a pole, slowly turning.", price: 2500 },
  { id: "hottub", slot: "roof", name: "Rooftop hot tub", text: "Cedar tub, warm water, steam on cold nights.", price: 25000, grand: true },

  { id: "plain", slot: "lights", name: "No lights", text: "Lights out at closing.", price: 0 },
  { id: "string", slot: "lights", name: "String lights", text: "Warm bulbs along the awning. They glow at night.", price: 250 },
  { id: "marquee", slot: "lights", name: "Marquee bulbs", text: "Bulbs round the window that chase after dark.", price: 900 },
  { id: "search", slot: "lights", name: "Searchlights", text: "Two beams sweeping the night sky, seen across the map.", price: 12000, grand: true },

  { id: "steel", slot: "wheels", name: "Steel wheels", text: "Black tyres, cream caps.", price: 0 },
  { id: "whitewall", slot: "wheels", name: "Whitewalls", text: "Wide white walls and chrome caps.", price: 200 },
  { id: "chromehub", slot: "wheels", name: "Chrome spokes", text: "Polished spoked rims.", price: 500 },
  { id: "spinners", slot: "wheels", name: "Gold spinners", text: "Gold rims that keep spinning when she's parked.", price: 8000, grand: true },

  { id: "flat", slot: "inflatable", name: "None", text: "Nothing on the pavement.", price: 0 },
  { id: "fries", slot: "inflatable", name: "Inflatable fries", text: "A giant carton of fries, pegged down behind the front wheel.", price: 900 },
  { id: "chef", slot: "inflatable", name: "Inflatable chef", text: "A tall chef in a toque, waving a spatula.", price: 1500 },
  { id: "tubeman", slot: "inflatable", name: "Waving tube man", text: "Flails wildly all day on a little blower.", price: 2200 },

  { id: "solo", slot: "tag", name: "Nobody", text: "Just the truck.", price: 0 },
  { id: "trailer", slot: "tag", name: "Teardrop trailer", text: "A little trailer in matching paint.", price: 3000 },
  { id: "balloon", slot: "tag", name: "Hot-air balloon", text: "Tethered to the roof, in your colours.", price: 30000, grand: true },
  { id: "airship", slot: "tag", name: "Airship", text: "Follows the truck from town to town. Why not.", price: 75000, grand: true },
];

/** What the truck is wearing, one item id per slot. */
export type Look = Record<Slot, string>;

export const DEFAULT_LOOK: Look = { paint: "coral", awning: "mustard", roof: "none", lights: "plain", wheels: "steel", inflatable: "flat", tag: "solo" };

export function lookById(id: string): LookItem | undefined {
  return LOOKS.find((l) => l.id === id);
}

export function slotItems(slot: Slot): LookItem[] {
  return LOOKS.filter((l) => l.slot === slot);
}

/** The free items every truck owns from the start. */
export const FREE_LOOKS = LOOKS.filter((l) => l.price === 0).map((l) => l.id);

/** On sale: everything but souvenirs from towns the truck hasn't worked in yet. */
export function onSale(item: LookItem, workedIn: readonly string[]): boolean {
  return !item.town || workedIn.includes(item.town);
}

/** A saved look made valid: every slot filled with a known item of that slot that is owned. */
export function validLook(look: Partial<Look> | null | undefined, owned: readonly string[]): Look {
  const out = { ...DEFAULT_LOOK };
  for (const s of SLOTS) {
    const id = look?.[s.id];
    const item = id ? lookById(id) : undefined;
    if (item && item.slot === s.id && (item.price === 0 || owned.includes(id!))) out[s.id] = id!;
  }
  return out;
}
