import * as THREE from "three";
import type { Backdrop } from "../game/stops";
import type { Look } from "../game/looks";
import { disposeObject, faceted, mesh, toon } from "../render/materials";
import { lookColours } from "../screens/truckart";

export type Mood = "neutral" | "happy" | "sad" | "angry";

const BODY_COLORS = ["#7fb7e6", "#f29e6d", "#9fd27a", "#e889b8", "#f2cf5b", "#a99be8", "#6fd1c4", "#e7766f"];
const HATS: Record<Backdrop, Hat[]> = {
  mountains: ["none", "beanie", "cap", "ranger", "antlers"],
  beach: ["none", "sunhat", "shades", "cap", "shades"],
  desert: ["none", "cowboy", "cowboy", "shades", "bandana"],
  orchard: ["none", "sunhat", "cap", "beanie", "none"],
};
type Hat = "none" | "beanie" | "cap" | "ranger" | "antlers" | "sunhat" | "shades" | "cowboy" | "bandana";

/** A chunky local built from rounded primitives, dressed for the town. */
export class CustomerFigure {
  root = new THREE.Group();
  private body: THREE.Group;
  private mouth: THREE.Mesh;
  private brows: THREE.Mesh[] = [];
  private pupils: THREE.Mesh[] = [];
  mood: Mood = "neutral";
  private bob = Math.random() * 10;
  private jump = 0;

  constructor(seed: number, backdrop: Backdrop = "mountains") {
    const color = BODY_COLORS[seed % BODY_COLORS.length];
    const hats = HATS[backdrop];
    const hat = hats[Math.floor(seed / 3) % hats.length];
    this.body = new THREE.Group();
    const torso = mesh(faceted(new THREE.SphereGeometry(0.85, 14, 10)), color);
    torso.scale.set(1, 1.15, 0.85);
    torso.position.y = 0.95;
    this.body.add(torso);
    const belly = mesh(faceted(new THREE.SphereGeometry(0.55, 12, 8)), new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.45), { ink: false });
    belly.scale.set(1, 1.05, 0.5);
    belly.position.set(0, 0.75, 0.48);
    this.body.add(belly);
    for (const s of [-1, 1]) {
      const eye = mesh(faceted(new THREE.SphereGeometry(0.2, 10, 8)), "#ffffff", { ink: 1.12 });
      eye.position.set(0.28 * s, 1.35, 0.62);
      eye.scale.z = 0.6;
      const pupil = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.09, 8, 6)), toon("#1d1410"));
      pupil.position.set(0, 0, 0.16);
      eye.add(pupil);
      this.pupils.push(pupil);
      this.body.add(eye);
      const brow = mesh(faceted(new THREE.BoxGeometry(0.28, 0.06, 0.06)), "#2a1d17", { ink: false });
      brow.position.set(0.28 * s, 1.62, 0.66);
      this.brows.push(brow);
      this.body.add(brow);
      const arm = mesh(faceted(new THREE.SphereGeometry(0.22, 8, 6)), color);
      arm.scale.set(0.8, 1.3, 0.8);
      arm.position.set(0.85 * s, 0.75, 0.15);
      arm.rotation.z = 0.4 * s;
      this.body.add(arm);
    }
    this.mouth = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 5, 12, Math.PI), toon("#2a1d17"));
    this.mouth.position.set(0, 1.08, 0.72);
    this.body.add(this.mouth);

    if (hat === "beanie") {
      const b = mesh(faceted(new THREE.SphereGeometry(0.62, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), "#d8473a");
      b.position.y = 1.72;
      const pom = mesh(faceted(new THREE.SphereGeometry(0.16, 8, 6)), "#f6efe0");
      pom.position.y = 2.33;
      this.body.add(b, pom);
    } else if (hat === "cap") {
      const c = mesh(faceted(new THREE.SphereGeometry(0.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), "#2f5d8c");
      c.position.y = 1.78;
      const brim = mesh(faceted(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 12, 1, false, -Math.PI / 2, Math.PI)), "#2f5d8c");
      brim.position.set(0, 1.8, 0.35);
      this.body.add(c, brim);
    } else if (hat === "ranger") {
      const brim = mesh(faceted(new THREE.CylinderGeometry(0.95, 0.95, 0.06, 16)), "#9c7a45");
      brim.position.y = 1.85;
      const crown = mesh(faceted(new THREE.CylinderGeometry(0.42, 0.52, 0.45, 12)), "#9c7a45");
      crown.position.y = 2.1;
      this.body.add(brim, crown);
    } else if (hat === "antlers") {
      for (const s of [-1, 1]) {
        const a = mesh(faceted(new THREE.CylinderGeometry(0.05, 0.07, 0.6, 6)), "#d9c3a0");
        a.position.set(0.35 * s, 2.05, 0);
        a.rotation.z = -0.5 * s;
        const tine = mesh(faceted(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 6)), "#d9c3a0");
        tine.position.set(0.55 * s, 2.25, 0);
        tine.rotation.z = 0.4 * s;
        this.body.add(a, tine);
      }
    } else if (hat === "sunhat") {
      const brim = mesh(faceted(new THREE.CylinderGeometry(1.1, 1.1, 0.05, 18)), "#f1d98f");
      brim.position.y = 1.82;
      const crown = mesh(faceted(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), "#f1d98f");
      crown.position.y = 1.8;
      const band = mesh(faceted(new THREE.CylinderGeometry(0.51, 0.51, 0.1, 14)), "#e5432b", { ink: false });
      band.position.y = 1.86;
      this.body.add(brim, crown, band);
    } else if (hat === "shades") {
      for (const s of [-1, 1]) {
        const lens = mesh(faceted(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12)), "#1d1410", { ink: false });
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0.28 * s, 1.37, 0.78);
        this.body.add(lens);
      }
      const bridge = mesh(faceted(new THREE.BoxGeometry(0.2, 0.04, 0.04)), "#1d1410", { ink: false });
      bridge.position.set(0, 1.42, 0.78);
      this.body.add(bridge);
    } else if (hat === "cowboy") {
      const brim = mesh(faceted(new THREE.CylinderGeometry(1.05, 1.05, 0.06, 18)), "#8a5a32");
      brim.scale.z = 0.8;
      brim.position.y = 1.86;
      const crown = mesh(faceted(new THREE.CylinderGeometry(0.42, 0.5, 0.5, 12)), "#8a5a32");
      crown.position.y = 2.12;
      const dent = mesh(faceted(new THREE.BoxGeometry(0.1, 0.12, 0.7)), "#6e4524", { ink: false });
      dent.position.y = 2.36;
      this.body.add(brim, crown, dent);
    } else if (hat === "bandana") {
      const b = mesh(faceted(new THREE.CylinderGeometry(0.62, 0.7, 0.3, 14)), "#c8382c");
      b.position.y = 0.95;
      b.scale.z = 0.85;
      this.body.add(b);
    }
    this.root.add(this.body);
    this.setMood("neutral");
  }

  setMood(m: Mood): void {
    this.mood = m;
    const happy = m === "happy";
    this.mouth.rotation.z = happy || m === "neutral" ? Math.PI : 0;
    this.mouth.scale.set(m === "neutral" ? 0.7 : 1, m === "neutral" ? 0.4 : 1, 1);
    this.mouth.position.y = happy ? 1.12 : m === "neutral" ? 1.1 : 1.0;
    this.brows.forEach((b, i) => {
      const s = i ? 1 : -1;
      b.rotation.z = m === "angry" ? -0.45 * s : m === "sad" ? 0.35 * s : 0;
      b.position.y = m === "happy" ? 1.66 : 1.62;
    });
    if (happy) this.jump = 1;
  }

  update(dt: number, lookX: number): void {
    this.bob += dt * (this.mood === "angry" ? 9 : 2.2);
    this.jump = Math.max(0, this.jump - dt * 2.2);
    const hop = Math.sin(this.jump * Math.PI) * 0.5;
    this.body.position.y = Math.abs(Math.sin(this.bob)) * 0.05 + hop;
    this.body.rotation.z = this.mood === "angry" ? Math.sin(this.bob) * 0.05 : 0;
    for (const p of this.pupils) p.position.x = THREE.MathUtils.clamp(lookX, -0.06, 0.06);
  }
}

export class CustomersView {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 2.2, 0.1, 80);
  slots: { fig: CustomerFigure | null; x: number; enterT: number; leaving: boolean; onGone?: () => void }[] = [];
  private raycaster = new THREE.Raycaster();
  private slotX = [0, 0, 0];
  private backdrop = new THREE.Group();
  private kind: Backdrop = "mountains";

  constructor() {
    this.scene.add(new THREE.HemisphereLight("#fff7e6", "#8f84b8", 1.4));
    const sun = new THREE.DirectionalLight("#fff1d6", 1.4);
    sun.position.set(-3, 6, 6);
    this.scene.add(sun);
    this.scene.add(this.backdrop);
    this.setBackdrop("mountains");
    // Truck window frame and serving ledge, in front of the customers.
    // It sits in front of every backdrop's ground so nothing pokes through below the sill.
    const ledge = mesh(faceted(new THREE.BoxGeometry(40, 0.5, 2.2)), "#f3efe4");
    ledge.position.set(0, 0.05, 3.4);
    // The truck's paint under the sill, with its belt line: it follows the truck's look.
    const trim = mesh(faceted(new THREE.BoxGeometry(40, 0.6, 0.2)), "#ff8a70", { ink: false });
    trim.position.set(0, -0.4, 4.5);
    this.scene.add(trim);
    this.trim = trim;
    const belt = mesh(faceted(new THREE.BoxGeometry(40, 0.12, 0.22)), "#faf3e6", { ink: false });
    belt.position.set(0, -0.2, 4.5);
    this.scene.add(belt);
    this.belt = belt;
    this.scene.add(this.valance);
    // The truck's inside wall under the window, where the order rail is mounted.
    const wall = mesh(new THREE.BoxGeometry(40, 8, 0.2), "#d6cdbf", { ink: false });
    wall.position.set(0, -4.6, 4.6);
    this.scene.add(wall);
    this.scene.add(ledge);
    for (let i = 0; i < 3; i++) this.slots.push({ fig: null, x: 0, enterT: 0, leaving: false });
  }

  private trim: THREE.Mesh;
  private belt: THREE.Mesh;
  /** The awning's hem across the top of the window, and any lights on it (see setLook). */
  private valance = new THREE.Group();
  /** World y just under the HUD strip, on the valance's plane (set by layout). */
  private valanceY = 3.2;
  private static VAL_Z = 2.6;

  /**
   * Dress the window in the truck's look: the paint and belt line under the sill, the awning's
   * hem hanging across the top, and string lights or marquee bulbs along it.
   */
  setLook(look: Look): void {
    const c = lookColours(look);
    this.trim.material = toon(c.base);
    this.belt.material = toon(c.belt);
    const g = this.valance;
    disposeObject(g);
    g.clear();
    const W = 40;
    const add = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z = 0, ink = false) => {
      const m = mesh(faceted(geo), color, { ink, shadow: false });
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    // Canvas: a band, its bottom edge at y = 0 of the group.
    const band = 0.42;
    if (look.awning === "stripes") {
      const sw = 0.5;
      for (let i = 0; i * sw < W; i++) {
        const x = -W / 2 + (i + 0.5) * sw;
        const col = i % 2 ? "#faf3e6" : c.awning;
        add(new THREE.BoxGeometry(sw, band, 0.05), col, x, band / 2);
        // A pointed flag under each stripe.
        const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-sw / 2, 0, 0), new THREE.Vector3(0, -0.24, 0), new THREE.Vector3(sw / 2, 0, 0)]);
        add(tri, col, x, 0, 0.03);
      }
    } else {
      add(new THREE.BoxGeometry(W, band, 0.05), c.awning, 0, band / 2);
      if (look.awning === "velvet") {
        add(new THREE.BoxGeometry(W, 0.06, 0.07), "#b8892a", 0, 0.02, 0.02);
        for (let i = 0; i * 0.09 < W; i++) add(new THREE.BoxGeometry(0.035, i % 2 ? 0.16 : 0.2, 0.02), c.hem, -W / 2 + i * 0.09, -0.08, 0.03);
      } else {
        // Scallops along the hem.
        const r = 0.24;
        for (let i = 0; i * r * 2 < W; i++) add(new THREE.CircleGeometry(r, 12, Math.PI, Math.PI), c.hem, -W / 2 + (i + 0.5) * r * 2, 0.01, 0.03);
        if (look.awning !== "teal") add(new THREE.BoxGeometry(W, 0.06, 0.06), "#f8dc97", 0, band * 0.55, 0.01);
      }
    }
    // Lights.
    const glow = (x: number, y: number, r: number) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ color: "#fff1c2" }));
      b.position.set(x, y, 0.12);
      g.add(b);
      const h = new THREE.Mesh(new THREE.SphereGeometry(r * 2.4, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffd98a", transparent: true, opacity: 0.18, depthWrite: false }));
      h.position.copy(b.position);
      g.add(h);
    };
    if (look.lights === "string") {
      const span = 1.6;
      const sag = 0.22;
      const pts: THREE.Vector3[] = [];
      for (let x = -W / 2; x <= W / 2; x += 0.1) {
        const t = ((((x + W / 2) / span) % 1) + 1) % 1;
        pts.push(new THREE.Vector3(x, -0.06 - sag * 4 * t * (1 - t), 0.1));
      }
      const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#3f3630" }));
      g.add(wire);
      for (let x = -W / 2 + span / 2; x < W / 2; x += span) glow(x, -0.06 - sag - 0.1, 0.075);
    } else if (look.lights === "marquee") {
      for (let x = -W / 2 + 0.3; x < W / 2; x += 0.6) glow(x, -0.36, 0.07);
    }
    this.placeValance();
  }

  private placeValance(): void {
    this.valance.position.set(0, this.valanceY - 0.34, CustomersView.VAL_Z);
  }

  setBackdrop(kind: Backdrop): void {
    this.kind = kind;
    const g = this.backdrop;
    disposeObject(g);
    g.clear();
    const add = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(faceted(geo), toon(color));
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    if (kind === "mountains") {
      this.scene.background = new THREE.Color("#9fd3e8");
      for (const [x, h, c] of [[-7, 6, "#8aa6b8"], [-1, 7.5, "#7c98ad"], [6, 6.5, "#8aa6b8"]] as const) {
        add(new THREE.ConeGeometry(h * 0.9, h, 5), c, x, h / 2 - 0.5, -9);
        add(new THREE.ConeGeometry(h * 0.27, h * 0.3, 5), "#f4f7f8", x, h - 0.5 - h * 0.15, -8.95);
      }
      for (let i = 0; i < 14; i++) {
        const h = 1.6 + Math.abs(Math.sin(i * 3.1)) * 1.2;
        add(new THREE.ConeGeometry(h * 0.35, h, 6), i % 2 ? "#2f6b4f" : "#3b7d5a", -11 + i * 1.7 + Math.sin(i * 7) * 0.4, h / 2 - 0.4, -5.5);
      }
      add(new THREE.BoxGeometry(60, 0.4, 20), "#9cc77a", 0, -0.6, -6);
    } else if (kind === "beach") {
      this.scene.background = new THREE.Color("#8fd6f0");
      add(new THREE.BoxGeometry(60, 0.2, 10), "#3fa7c9", 0, 0.2, -12);
      add(new THREE.BoxGeometry(60, 0.4, 14), "#f2dca0", 0, -0.6, -4);
      add(new THREE.SphereGeometry(1.4, 16, 10), "#ffe08a", 7, 6.5, -14);
      for (const [x, z, lean] of [[-8, -6, 0.25], [-3.5, -7, -0.15], [4, -6.5, 0.2], [9, -7.5, -0.2]] as const) {
        const trunk = add(new THREE.CylinderGeometry(0.16, 0.24, 4.2, 6), "#9a6a3c", x, 1.6, z);
        trunk.rotation.z = lean;
        for (let k = 0; k < 5; k++) {
          const leaf = add(new THREE.ConeGeometry(0.35, 2.2, 4), "#3c9a52", x - lean * 3.6, 3.6, z);
          leaf.rotation.set(0, (k * Math.PI * 2) / 5, Math.PI / 2.3);
        }
      }
      for (let i = 0; i < 3; i++) {
        const umb = add(new THREE.ConeGeometry(1.2, 0.5, 8), i % 2 ? "#e5432b" : "#f3bd3d", -6 + i * 6, 1.6, -3.5);
        umb.rotation.z = 0.15;
      }
    } else if (kind === "orchard") {
      // Orchard Isle: soft green hills, rows of vines, apple trees and a red barn.
      this.scene.background = new THREE.Color("#a9d8e6");
      add(new THREE.BoxGeometry(60, 0.4, 20), "#a8c97a", 0, -0.6, -6);
      for (const [x, r] of [[-8, 5], [1, 6.5], [9, 5.5]] as const) {
        const hill = add(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), "#8fb86a", x, -0.6, -13);
        hill.scale.y = 0.45;
      }
      for (let row = 0; row < 3; row++) add(new THREE.BoxGeometry(14, 0.5, 0.35), "#5f8f45", -5 + row * 0.6, 0, -8 - row * 0.9);
      const barn = add(new THREE.BoxGeometry(2.6, 2, 2), "#b8483a", 7.5, 0.5, -9);
      barn.rotation.y = -0.3;
      const roof = add(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 3), "#7a3a32", 7.5, 1.9, -9);
      roof.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 0.3);
      for (const [x, z] of [[-8, -5], [-3.5, -6], [2.5, -5.5], [10.5, -6]] as const) {
        add(new THREE.CylinderGeometry(0.14, 0.2, 1.4, 6), "#7a5434", x, 0.3, z);
        add(new THREE.SphereGeometry(0.95, 10, 8), "#4f8f45", x, 1.5, z);
        for (let k = 0; k < 4; k++) add(new THREE.SphereGeometry(0.13, 6, 5), "#d9443a", x + Math.cos(k * 1.7) * 0.75, 1.3 + Math.sin(k * 2.3) * 0.4, z + 0.55);
      }
    } else {
      this.scene.background = new THREE.Color("#f6c48a");
      add(new THREE.BoxGeometry(60, 0.4, 20), "#e0a868", 0, -0.6, -6);
      for (const [x, w, h] of [[-8, 4, 3.5], [-1, 6, 5], [7, 3.5, 4]] as const) {
        add(new THREE.BoxGeometry(w, h, 2), "#c4623a", x, h / 2 - 0.5, -11);
        add(new THREE.BoxGeometry(w + 0.4, 0.4, 2.2), "#a94f2e", x, h - 0.4, -11);
      }
      add(new THREE.SphereGeometry(1.2, 16, 10), "#fff1c4", -5, 6.2, -14);
      for (const [x, z] of [[-6, -5], [-1.5, -6], [3.5, -5.5], [8, -6]] as const) {
        add(new THREE.CylinderGeometry(0.28, 0.32, 2.2, 8), "#4f8f4a", x, 0.7, z);
        const arm = add(new THREE.CylinderGeometry(0.18, 0.2, 0.9, 8), "#4f8f4a", x + 0.45, 1.1, z);
        arm.rotation.z = -0.2;
      }
    }
  }

  /**
   * The band shows the HUD strip at the top, the customers, then the window sill where the
   * order rail hangs (at `railF` of the band height). The camera looks straight out and is placed
   * so the sill lands on the rail and the customers fill the space above it.
   */
  layout(aspect: number, hudF = 0.18, railF = 0.45): void {
    const sill = 0.3;
    const top = 2.75;
    const hv = (top - sill) / Math.max(0.15, railF - hudF);
    const d = hv / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const yc = sill + (railF - 0.5) * hv;
    this.camera.position.set(0, yc + 0.35, d);
    this.camD = d;
    this.camera.lookAt(0, yc, 0);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    // The awning's hem hangs just under the HUD strip, on its own plane nearer the window.
    {
      this.raycaster.setFromCamera(new THREE.Vector2(0, 1 - 2 * hudF), this.camera);
      const out = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -CustomersView.VAL_Z), out)) this.valanceY = out.y;
      this.placeValance();
    }
    // Each customer stands centred over their receipt.
    for (let i = 0; i < 3; i++) {
      this.raycaster.setFromCamera(new THREE.Vector2(((i + 0.5) / 3) * 2 - 1, 0), this.camera);
      const out = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), out);
      this.slotX[i] = out.x;
    }
    const spacing = this.slotX[1] - this.slotX[0];
    const s = Math.min(0.95, spacing * 0.3);
    for (const sl of this.slots) if (sl.fig) sl.fig.root.scale.setScalar(s);
    this.figScale = s;
  }
  private figScale = 1;

  /** The people waiting behind the window, front first, shown small and off to the left, in depth. */
  private line: { seed: number; fig: CustomerFigure; x: number; z: number; in: number }[] = [];
  private static LINE_SHOWN = 4;

  /**
   * Place in line `k` stands here: the front of the line just left of the first customer, the
   * rest further back and spread to the right so they show in the gaps between customers. Perspective pulls
   * distant points toward the centre, so the world x is widened by depth to hold the screen x.
   */
  private lineSpot(k: number): { x: number; z: number } {
    const spacing = this.slotX[1] - this.slotX[0] || 4;
    const z = -2.4 - k * 1.4;
    const screenX = this.slotX[0] - spacing * 0.36 + k * spacing * 0.9;
    return { x: screenX * (1 + -z / this.camD), z };
  }
  /** Camera distance from the window plane (set by layout). */
  private camD = 12;

  /** Sync the drawn line to who's waiting (front first). Figures are kept by seed, so people keep their look as they move up. */
  setLine(entries: { seed: number; mood: Mood }[]): void {
    const shown = entries.slice(0, CustomersView.LINE_SHOWN);
    for (const l of [...this.line]) {
      if (!shown.some((e) => e.seed === l.seed)) {
        this.scene.remove(l.fig.root);
        disposeObject(l.fig.root);
        this.line.splice(this.line.indexOf(l), 1);
      }
    }
    shown.forEach((e, k) => {
      let l = this.line.find((q) => q.seed === e.seed);
      const spot = this.lineSpot(k);
      if (!l) {
        const fig = new CustomerFigure(e.seed, this.kind);
        fig.root.scale.setScalar(this.figScale * 0.92);
        l = { seed: e.seed, fig, x: spot.x - 4, z: spot.z, in: 0 };
        fig.root.position.set(l.x, 0.2, l.z);
        this.scene.add(fig.root);
        this.line.push(l);
      }
      l.fig.setMood(e.mood);
      l.fig.root.userData.target = spot;
    });
  }

  arrive(slot: number, seed: number): CustomerFigure {
    const fig = new CustomerFigure(seed, this.kind);
    fig.root.scale.setScalar(this.figScale);
    const sl = this.slots[slot];
    if (sl.fig) {
      this.scene.remove(sl.fig.root);
      disposeObject(sl.fig.root);
    }
    sl.fig = fig;
    sl.enterT = 0;
    sl.leaving = false;
    this.scene.add(fig.root);
    return fig;
  }

  leave(slot: number, onGone: () => void): void {
    const sl = this.slots[slot];
    if (!sl.fig) return onGone();
    sl.leaving = true;
    sl.enterT = 1;
    sl.onGone = onGone;
  }

  update(dt: number, activeSlot: number): void {
    this.slots.forEach((sl, i) => {
      if (!sl.fig) return;
      const home = this.slotX[i];
      if (sl.leaving) {
        sl.enterT -= dt * 1.6;
        if (sl.enterT <= 0) {
          this.scene.remove(sl.fig.root);
          disposeObject(sl.fig.root);
          sl.fig = null;
          sl.leaving = false;
          const cb = sl.onGone;
          sl.onGone = undefined;
          cb?.();
          return;
        }
      } else sl.enterT = Math.min(1, sl.enterT + dt * 1.4);
      const e = 1 - Math.pow(1 - sl.enterT, 3);
      const from = sl.leaving ? home + 9 : home - 9;
      sl.fig.root.position.set(from + (home - from) * e, 0.2, 0);
      sl.fig.root.rotation.y = (1 - e) * (sl.leaving ? 0.8 : -0.8);
      sl.fig.update(dt, i === activeSlot ? 0 : (activeSlot - i) * 0.05);
    });
    for (const l of this.line) {
      const t = l.fig.root.userData.target as { x: number; z: number } | undefined;
      if (t) {
        const k = Math.min(1, dt * 3.5);
        l.x += (t.x - l.x) * k;
        l.z += (t.z - l.z) * k;
      }
      l.fig.root.position.set(l.x, 0.2, l.z);
      // Facing the window, a little, as they shuffle along.
      l.fig.root.rotation.y = 0.45;
      l.fig.update(dt, 0.08);
    }
  }
}
