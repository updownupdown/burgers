import type { CupObject } from "./food";

/** What's been done to a cup on top of the drink itself. */
export interface CupDressing {
  ice?: boolean;
  lid?: boolean;
  straw?: boolean;
}

/** Show a cup's ice, lid and straw. */
export function dressCup(cup: CupObject, d: CupDressing): void {
  const u = cup.userData as Partial<Record<"setIce" | "setLid" | "setStraw", (on: boolean) => void>>;
  u.setIce?.(!!d.ice);
  u.setLid?.(!!d.lid);
  u.setStraw?.(!!d.straw);
}
