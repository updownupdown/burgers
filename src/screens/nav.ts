/**
 * The phone's back button (and the browser's), mapped onto whatever is open.
 *
 * Every screen that sits over another one registers itself here when it opens, with the
 * function that closes it: a modal card, the Prep screen, a screen over the map, the town
 * sheet. A press of Back closes the top one and nothing else. When a screen is closed by its
 * own button instead, it calls `dropBack` so Back doesn't close something twice.
 *
 * The browser history stays one entry deep: while anything is registered the page sits on a
 * sentinel entry, and Back pops it. The sentinel is pushed again while screens remain, and
 * removed when the last one closes by its own button. Going one deep (rather than one entry
 * per screen) keeps the order of pushes and pops from mattering, since pushState is immediate
 * but history.back() is not.
 *
 * In a shift the bottom of the stack holds a guard: Back pauses the game and opens the menu
 * instead of leaving the page.
 */
interface Entry {
  key: string;
  close: () => void;
}

const stack: Entry[] = [];
/** True while the page sits on our sentinel entry. */
let armed = false;
/** popstate events we caused ourselves with history.back(), to be ignored. */
let skip = 0;
/** True while a close runs because of a real Back press. */
let inPop = false;

function arm(): void {
  if (armed) return;
  try {
    history.pushState({ bv: 1 }, "");
    armed = true;
  } catch {
    // Some embedded browsers refuse pushState; Back then just isn't mapped.
  }
}

/**
 * Leave the sentinel, a moment later: a screen that closes and is replaced in the same tick
 * (Prep giving way to the shift, say) must not bounce the history out and back in.
 */
function disarm(): void {
  if (!armed) return;
  setTimeout(() => {
    if (!armed || stack.length) return;
    armed = false;
    skip++;
    try {
      history.back();
    } catch {
      skip--;
    }
  }, 0);
}

export function pushBack(key: string, close: () => void): void {
  stack.push({ key, close });
  arm();
}

/** A screen closed itself: forget its entry and anything opened over it. */
export function dropBack(key: string): void {
  let i = -1;
  for (let k = stack.length - 1; k >= 0; k--) {
    if (stack[k].key === key) {
      i = k;
      break;
    }
  }
  if (i < 0) return;
  stack.splice(i, stack.length - i);
  if (!stack.length && !inPop) disarm();
}

export const backDepth = (): number => stack.length;

window.addEventListener("popstate", () => {
  if (skip > 0) {
    skip--;
    return;
  }
  armed = false;
  const top = stack.pop();
  if (!top) return;
  inPop = true;
  try {
    top.close();
  } finally {
    inPop = false;
  }
  // Something is still open (or the close opened something): stay catchable.
  if (stack.length) arm();
});
