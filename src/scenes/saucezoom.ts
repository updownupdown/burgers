import * as THREE from "three";
import { DISH_R, TRAY_PITCH, TRAY_VIEW_HALF_H, type TrayView } from "./tray";

export interface ZoomRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How steeply the zoomed camera looks down on the burger once it's fully in. */
const ZOOM_PITCH = THREE.MathUtils.degToRad(64);
/** Half the zoomed view's height, in bun radii: the bun fills most of the square. */
const ZOOM_HALF = 1.75;

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = THREE.MathUtils.lerp;

/**
 * The sauce close-up: the tray scene seen through a second camera, drawn in a square that grows
 * out of one plate on the tray band into a big view of that burger (main.ts dims the rest of the
 * truck around it). At amount 0 the square sits exactly over the plate in the tray band, with the
 * tray camera's framing, so the hand-off is seamless; at 1 it looks down on the stack.
 */
export class SauceZoom {
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
  /** Shown amount, eased toward the target. */
  amount = 0;
  /** The plate being zoomed on, or -1. */
  slot = -1;
  /** World x the camera centres on, eased between plates as the aim moves. */
  private focusX = 0;
  /** The square on screen (column coordinates). */
  rect: ZoomRect = { x: 0, y: 0, w: 0, h: 0 };
  private raycaster = new THREE.Raycaster();
  private at = new THREE.Vector3();

  constructor(private tray: TrayView) {}

  get visible(): boolean {
    return this.amount > 0.01 && this.slot >= 0;
  }

  /** Eased 0..1, for fading the UI that rides on the zoom. */
  get eased(): number {
    return smooth(Math.min(1, this.amount));
  }

  /**
   * Move toward `target` (0..1) on plate `slot`. `band` is the tray band and `final` the square the
   * burger fills when fully zoomed, both in column coordinates.
   */
  update(dt: number, target: number, slot: number, band: ZoomRect, final: ZoomRect): void {
    if (slot >= 0) {
      const x = this.tray.plates[slot].burger.getWorldPosition(this.at).x;
      if (this.slot < 0 || this.amount < 0.02) this.focusX = x;
      this.slot = slot;
    }
    this.amount += (target - this.amount) * Math.min(1, dt * 12);
    if (target === 0 && this.amount < 0.01) {
      this.amount = 0;
      this.slot = -1;
    }
    if (this.slot < 0) return;
    const pv = this.tray.plates[this.slot];
    // The burger sits on the plate spot of its tray, not at the tray's middle.
    const at = pv.burger.getWorldPosition(this.at);
    this.focusX += (at.x - this.focusX) * Math.min(1, dt * 12);
    const k = this.eased;
    // Sized from the plate, not the whole tray; the zoomed framing uses the burger's full size, not
    // the eased fit-under-the-receipt scale, so the zoom doesn't pulse.
    const trayS = pv.group.scale.x;
    const plateR = trayS * DISH_R;

    // Where the plate sits in the tray band right now, and how big it looks there.
    const tc = this.tray.camera;
    tc.updateMatrixWorld();
    const v = new THREE.Vector3(this.focusX, 0, at.z).project(tc);
    const sx = band.x + ((v.x + 1) / 2) * band.w;
    const sy = band.y + ((1 - v.y) / 2) * band.h;
    const half0 = (plateR * band.h) / (2 * TRAY_VIEW_HALF_H);
    const r = this.rect;
    r.x = lerp(sx - half0, final.x, k);
    r.y = lerp(sy - half0, final.y, k);
    r.w = lerp(half0 * 2, final.w, k);
    r.h = lerp(half0 * 2, final.h, k);

    const pitch = lerp(TRAY_PITCH, ZOOM_PITCH, k);
    const hh = lerp(plateR, trayS * pv.full * ZOOM_HALF, k);
    const look = new THREE.Vector3(this.focusX, lerp(0, this.tray.stackTopY(this.slot), k), at.z);
    const cam = this.camera;
    const aspect = r.w / Math.max(1, r.h);
    Object.assign(cam, { left: -hh * aspect, right: hh * aspect, top: hh, bottom: -hh });
    cam.updateProjectionMatrix();
    cam.position.set(look.x, look.y + 20 * Math.sin(pitch), look.z + 20 * Math.cos(pitch));
    cam.lookAt(look);
    cam.updateMatrixWorld();
  }

  /** A ray from a point in column coordinates through the zoomed view. */
  ray(x: number, y: number): THREE.Ray {
    const r = this.rect;
    this.raycaster.setFromCamera(new THREE.Vector2(((x - r.x) / r.w) * 2 - 1, -((y - r.y) / r.h) * 2 + 1), this.camera);
    return this.raycaster.ray;
  }

  /** Screen point (column coordinates) of the zoomed burger's middle. */
  centre(): [number, number] {
    const r = this.rect;
    return [r.x + r.w / 2, r.y + r.h / 2];
  }
}
