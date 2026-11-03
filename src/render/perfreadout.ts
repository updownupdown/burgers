import type * as THREE from "three";
import { devOn } from "../game/devmode";

/*
 * Dev mode's draw-call readout (review of build #78, P1-3): a small chip in the bottom-left
 * corner with the draw calls and triangles of the last frame, all bands and shadow passes
 * together. Shown only with Settings → Developer → Dev mode on.
 */

let el: HTMLDivElement | null = null;
let frames = 0;
let on = false;

/** Call once per drawn frame, after the frame (the renderer's info must not auto-reset). */
export function perfReadout(renderer: THREE.WebGLRenderer): void {
  if (frames++ % 30 === 0) on = devOn();
  if (!on) {
    if (el) el.hidden = true;
    return;
  }
  if (!el) {
    el = document.createElement("div");
    el.className = "bv-perf";
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, {
      position: "fixed",
      left: "4px",
      bottom: "calc(4px + env(safe-area-inset-bottom, 0px))",
      zIndex: "50",
      pointerEvents: "none",
      font: "10px/1.2 'DM Mono', ui-monospace, monospace",
      color: "#f6f2ea",
      background: "rgba(42, 51, 64, 0.72)",
      padding: "2px 5px",
      borderRadius: "4px",
    });
    document.body.appendChild(el);
  }
  el.hidden = false;
  if (frames % 10 === 0) {
    const r = renderer.info.render;
    el.textContent = `${r.calls} calls · ${(r.triangles / 1000).toFixed(0)}k tris`;
  }
}
