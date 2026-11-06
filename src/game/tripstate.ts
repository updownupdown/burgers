/**
 * The few trip-wide facts that pure rules elsewhere read without being handed the save
 * (DESIGN §50): whether Port Amber's last-night festival is on from some day, and the crowd
 * a second trip brings. finale.ts `syncTrip` keeps it in step with the save; nothing else
 * writes it. No imports, so stops.ts and day.ts can read it without a cycle.
 */
export const tripState = {
  /** The day from which Port Amber holds the last night of the trip, until it is worked. */
  finaleFrom: null as number | null,
  /** Multiplies the crowd everywhere: 1 on a first trip, more on a lap after a finish. */
  crowd: 1,
};
