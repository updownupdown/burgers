/*
 * The shift opening (review of build #78, P3-6): Prep used to cut straight to the kitchen. Now the
 * slate of the map screens draws up off the truck in 350 ms, from the counter at the bottom to the
 * window at the top, as if the shutter were rolling up. Taps go straight through; reduced motion
 * keeps the cut.
 */

const MS = 350;

export function playShiftReveal(): void {
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position: "fixed",
    inset: "0",
    zIndex: "60",
    pointerEvents: "none",
    background: "linear-gradient(to bottom, #2a3340 0%, #2a3340 88%, #3a4552 100%)",
  });
  document.body.appendChild(el);
  const anim = el.animate?.(
    [
      { clipPath: "inset(0 0 0 0)", opacity: 1 },
      { clipPath: "inset(0 0 100% 0)", opacity: 0.85 },
    ],
    { duration: MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" },
  );
  const done = () => el.remove();
  if (anim) anim.onfinish = done;
  // Whatever happens to the animation (a hidden tab), don't leave the slate up.
  setTimeout(done, MS + 400);
}
