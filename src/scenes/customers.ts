import * as THREE from "three";
import type { Backdrop } from "../game/stops";
import { disposeObject, faceted, mesh, toon } from "../render/materials";

export type Mood = "neutral" | "happy" | "sad" | "angry";

const BODY_COLORS = ["#7fb7e6", "#f29e6d", "#9fd27a", "#e889b8", "#f2cf5b", "#a99be8", "#6fd1c4", "#e7766f"];
const HATS: Record<Backdrop, Hat[]> = {
  mountains: ["none", "beanie", "cap", "ranger", "antlers"],
  beach: ["none", "sunhat", "shades", "cap", "shades"],
  desert: ["none", "cowboy", "cowboy", "shades", "bandana"],
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
    const ledge = mesh(faceted(new THREE.BoxGeometry(40, 0.5, 1.4)), "#f3efe4");
    ledge.position.set(0, 0.45, 1.8);
    const trim = mesh(faceted(new THREE.BoxGeometry(40, 0.6, 0.2)), "#ff8a70", { ink: false });
    trim.position.set(0, 0.0, 2.45);
    this.scene.add(trim);
    this.scene.add(ledge);
    for (let i = 0; i < 3; i++) this.slots.push({ fig: null, x: 0, enterT: 0, leaving: false });
    this.camera.position.set(0, 2.6, 10);
    this.camera.lookAt(0, 2.15, 0);
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

  layout(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    // Customers stand at the left side of each slot; the ticket card fills the right side.
    for (let i = 0; i < 3; i++) {
      this.raycaster.setFromCamera(new THREE.Vector2(((i + 0.22) / 3) * 2 - 1, 0), this.camera);
      const out = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), out);
      this.slotX[i] = out.x;
    }
    const spacing = this.slotX[1] - this.slotX[0];
    const s = Math.min(0.95, spacing * 0.24);
    for (const sl of this.slots) if (sl.fig) sl.fig.root.scale.setScalar(s);
    this.figScale = s;
  }
  private figScale = 1;

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
  }
}
