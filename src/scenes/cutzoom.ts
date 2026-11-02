import * as THREE from "three";

export interface ZoomRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = THREE.MathUtils.lerp;
/** The cut view looks almost straight down on the board, so a slice drawn on screen is a slice on the food. */
const PITCH = THREE.MathUtils.degToRad(78);

/**
 * The knife's cut view (DESIGN §31): the counter scene through a second camera, looking down on
 * what's on the cutting board, drawn in a square that grows out of the food's spot on the counter
 * (main.ts dims the truck round it, as for sauce). Screen points map onto the food's top through
 * `ray`.
 */
export class CutZoom {
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
  /** Shown amount, eased toward the target. */
  amount = 0;
  rect: ZoomRect = { x: 0, y: 0, w: 0, h: 0 };
  private from: ZoomRect = { x: 0, y: 0, w: 0, h: 0 };
  private centre = new THREE.Vector3();
  private radius = 1;
  private raycaster = new THREE.Raycaster();

  get visible(): boolean {
    return this.amount > 0.01;
  }
  get eased(): number {
    return smooth(Math.min(1, this.amount));
  }

  /** Frame the food: its middle (top surface, world), its reach, and where it sits on screen now. */
  frame(centre: THREE.Vector3, radius: number, from: ZoomRect): void {
    this.centre.copy(centre);
    this.radius = radius;
    this.from = { ...from };
  }

  update(dt: number, target: number, final: ZoomRect): void {
    this.amount += (target - this.amount) * Math.min(1, dt * 14);
    if (target === 0 && this.amount < 0.01) this.amount = 0;
    const k = this.eased;
    const r = this.rect;
    r.x = lerp(this.from.x, final.x, k);
    r.y = lerp(this.from.y, final.y, k);
    r.w = lerp(this.from.w, final.w, k);
    r.h = lerp(this.from.h, final.h, k);
    const hh = this.radius * 1.3;
    const aspect = r.w / Math.max(1, r.h);
    const cam = this.camera;
    Object.assign(cam, { left: -hh * aspect, right: hh * aspect, top: hh, bottom: -hh });
    cam.updateProjectionMatrix();
    const c = this.centre;
    cam.position.set(c.x, c.y + 20 * Math.sin(PITCH), c.z + 20 * Math.cos(PITCH));
    cam.lookAt(c);
    cam.updateMatrixWorld();
  }

  /** Where a screen point (column coordinates) lands on the food's top, world space. */
  point(x: number, y: number): THREE.Vector3 {
    const r = this.rect;
    this.raycaster.setFromCamera(new THREE.Vector2(((x - r.x) / r.w) * 2 - 1, -((y - r.y) / r.h) * 2 + 1), this.camera);
    const out = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.centre.y), out);
    return out;
  }
}
