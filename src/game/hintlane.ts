/**
 * The tip lane (DESIGN §49): the one line of black tips under the HUD, as rules main.ts draws.
 *
 * - A **lead** tip (a new kitchen's "New here", an event's intro) owns the lane for its time.
 *   Tips that come up meanwhile wait in a short queue and show after it, unless they've gone stale;
 *   a quick reaction (under LAST_MIN seconds: "That tray is empty!") is about that moment, so it's dropped.
 * - An **action** tip (pull the handle down, fold it, peel it) stays until the action happens
 *   (`done` with its tag) or ACTION_HOLD seconds pass. A passing one-liner ("Ham 2 of 3") can show
 *   over it; the action tip comes back when that's gone, if it's still waiting.
 * - Every other tip shows at once for its own seconds, as before.
 * - The last tip worth reading again (LAST_MIN seconds or longer) can be shown again (`recall`).
 *
 * Time is passed in (seconds), so the rules are testable without a clock.
 */

/** Seconds an action tip waits for its action at most. */
export const ACTION_HOLD = 10;
/** A tip shorter than this ("Clean crack!") isn't worth showing again. */
export const LAST_MIN = 2.5;
/** Seconds a recalled tip stays up. */
export const RECALL_SECONDS = 6;
/** A queued tip older than this when its turn comes is dropped: it's about something long past. */
export const QUEUE_STALE = 15;
/** At most this many tips wait behind a lead tip. */
export const QUEUE_MAX = 3;

export interface TipOpts {
  /** A lead tip: owns the lane for its time; later tips queue behind it. */
  lead?: boolean;
  /** An action tip: stays until `done(tag)` or ACTION_HOLD seconds. */
  until?: string;
}

interface Tip {
  text: string;
  seconds: number;
  lead: boolean;
  until?: string;
}
interface Live extends Tip {
  end: number;
}
interface Waiting extends Tip {
  at: number;
}

export class HintLane {
  private cur: Live | null = null;
  /** An action tip under a passing one-liner, waiting to come back. */
  private held: Live | null = null;
  private queue: Waiting[] = [];
  private lastText = "";

  /** Put a tip up (or in the queue behind a lead tip). */
  show(text: string, seconds: number, now: number, opts: TipOpts = {}): void {
    const tip: Tip = { text, seconds: opts.until ? Math.max(seconds, ACTION_HOLD) : seconds, lead: !!opts.lead, until: opts.until };
    this.expire(now);
    if (this.cur?.lead) {
      if (this.cur.text === text || this.queue.some((q) => q.text === text)) return;
      if (!tip.lead && !tip.until && tip.seconds < LAST_MIN) return;
      // Lead tips go before plain ones in the queue; each lot keeps its order.
      const at = tip.lead ? this.queue.filter((q) => q.lead).length : this.queue.length;
      this.queue.splice(at, 0, { ...tip, at: now });
      // Too many waiting: the oldest plain tip goes.
      while (this.queue.length > QUEUE_MAX) {
        const i = this.queue.findIndex((q) => !q.lead);
        this.queue.splice(i < 0 ? this.queue.length - 1 : i, 1);
      }
      return;
    }
    this.put(tip, now);
  }

  /** The action `tag` happened: any tip waiting for it goes. */
  done(tag: string, now: number): void {
    if (this.cur?.until === tag) this.cur = null;
    if (this.held?.until === tag) this.held = null;
    this.queue = this.queue.filter((q) => q.until !== tag);
    this.expire(now);
  }

  /** The tip to show now, or null. */
  text(now: number): string | null {
    this.expire(now);
    return this.cur?.text ?? null;
  }

  /** The tip showing is a lead tip. */
  leading(now: number): boolean {
    this.expire(now);
    return !!this.cur?.lead;
  }

  /** The last tip worth reading again, or "" if none yet. */
  get last(): string {
    return this.lastText;
  }

  /** Show the last tip again. False if there's none. */
  recall(now: number): boolean {
    if (!this.lastText) return false;
    this.queue = [];
    this.held = null;
    this.cur = null;
    this.put({ text: this.lastText, seconds: RECALL_SECONDS, lead: false }, now);
    return true;
  }

  /** The player closed the tip showing: it goes (an action tip under it doesn't come back). */
  dismiss(now: number): void {
    this.cur = null;
    this.held = null;
    this.expire(now);
  }

  /** Empty the lane (the shift ended). The last tip is forgotten too. */
  clear(): void {
    this.cur = null;
    this.held = null;
    this.queue = [];
    this.lastText = "";
  }

  private put(tip: Tip, now: number): void {
    const prev = this.cur;
    if (prev?.until && !tip.until && prev.end > now) this.held = prev;
    else if (tip.until) this.held = null;
    this.cur = { ...tip, end: now + tip.seconds };
    if (tip.seconds >= LAST_MIN || tip.until || tip.lead) this.lastText = tip.text;
  }

  /** Drop the tip whose time is up, then bring on what's next: the queue, else a held action tip. */
  private expire(now: number): void {
    if (this.cur && now >= this.cur.end) this.cur = null;
    if (this.held && now >= this.held.end) this.held = null;
    while (!this.cur && this.queue.length) {
      const q = this.queue.shift()!;
      if (now - q.at > QUEUE_STALE) continue;
      this.put(q, now);
    }
    if (!this.cur && this.held) {
      this.cur = this.held;
      this.held = null;
    }
  }
}

/**
 * The one-time tips (hintOnce keys in main.ts) that ask for an action, and the tag of the action
 * that ends them. main.ts calls `acted(tag)` where the action happens.
 */
export const ACTION_TIPS: Readonly<Record<string, string>> = {
  "panini-lift": "press-close",
  "press-close": "press-close",
  "press-lift": "press-open",
  "press-shut": "press-open",
  "quesa-fold": "fold",
  "calzone-fold": "fold",
  "quesa-flip": "flip",
  "peel-carry": "peel-launch",
  "peel-launch": "peel-launch",
  "peel-scoop": "peel-lift",
  "scoop-under": "peel-lift",
  cut: "cut",
  "cut-four": "cut",
  "knife-arm": "cut",
  "egg-tap": "egg-crack",
  "egg-shells": "shells",
  "fries-scoop": "basket-down",
  tostada: "basket-down",
  pack: "pack",
  "fries-drag": "pack",
  lid: "lid",
  pour: "pour",
  "sauce-arm": "sauce-on",
  "sauce-draw": "sauce-on",
  serve: "serve",
};
