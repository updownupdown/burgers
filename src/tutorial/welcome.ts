/**
 * The welcome card, once, the first time the game opens on a fresh trip: what the game is, and the
 * two training wheels it starts with, each with its own switch. Tutorial mode (the thumb) and Chill
 * pacing are both on; the card says where to change them later.
 */
import { icon } from "../ui/icons";
import { modalHead, popModal, pushModal } from "../screens/modal";
import type { Difficulty } from "../game/difficulty";
import type { Save } from "../game/progress";

const KEY = "bv-welcomed";

/** A trip that hasn't started and a player who hasn't seen the card yet. */
export function welcomeDue(save: Save): boolean {
  if (save.tutorialDone || Object.values(save.shiftsIn ?? {}).some((n) => n > 0)) return false;
  try {
    return localStorage.getItem(KEY) !== "1";
  } catch {
    return true;
  }
}

const sw = (id: string, ic: string, label: string, note: string, on: boolean) =>
  `<button class="bv-toggle menu-toggle" role="switch" aria-checked="${on}" data-w="${id}"><span class="lead">${icon(ic)}</span><span class="lbl">${label}<small>${note}</small></span><span class="state">${on ? "On" : "Off"}</span><span class="sw"></span></button>`;

export function showWelcome(o: { pacing: Difficulty; done(tutorial: boolean, chill: boolean): void }): void {
  let tutorial = true;
  let chill = o.pacing === "chill";
  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // ignore
    }
    o.done(tutorial, chill);
  };
  const card = pushModal({
    key: "welcome",
    label: "Welcome",
    cls: "welcome",
    onDismiss: finish,
    // No ×: "Start the trip" is the one way on (Back or a tap outside does the same).
    html: `${modalHead({ icon: "truck", title: "Welcome aboard", stacked: false }).replace(/<button[^]*?<\/button>/, "")}
      <div class="menu-body menu-scroll welcome-body">
        <p class="bv-body">You run a food truck on a road trip. Cook what each ticket asks for, keep the line happy, and open the road to new towns and new dishes.</p>
        <div class="welcome-sw">
          ${sw("tutorial", "help", "Tutorial mode", "A see-through thumb shows you each move the first time. Change it in Settings.", tutorial)}
          ${sw("chill", "timer", "Start on Chill", "Patient customers, nothing burns, drinks stop at the line, and a forgiving first day. Off: Balanced, a steady rush. Change it on Prep.", chill)}
        </div>
      </div>
      <footer class="welcome-foot"><button class="bv-btn primary lg block" data-w="go">${icon("play")}Start the trip</button></footer>`,
  });
  card.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-w], [data-m]");
    if (!btn) return;
    const id = btn.dataset.w ?? btn.dataset.m;
    if (id === "go" || id === "close") {
      finish();
      popModal(true);
      return;
    }
    if (id === "tutorial") tutorial = !tutorial;
    if (id === "chill") chill = !chill;
    const on = id === "tutorial" ? tutorial : chill;
    btn.setAttribute("aria-checked", String(on));
    btn.querySelector(".state")!.textContent = on ? "On" : "Off";
  });
}
