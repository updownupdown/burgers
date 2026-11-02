import * as THREE from "three";
import type { Backdrop } from "../game/stops";
import type { Look } from "../game/looks";
import { disposeObject, faceted, mesh, toon } from "../render/materials";
import { lookColours } from "../screens/truckart";
import { CABIN } from "../render/cabin";
import { wallMaterial } from "../render/walls";
import { buildScenery } from "../render/scenery";
import { bakeStatic } from "../render/bake";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type { Mood } from "../render/people";
import { buildPerson, type Mood, type Person } from "../render/people";

/** A local at the window (built in src/render/people.ts), dressed for the town. */
export class CustomerFigure {
  root = new THREE.Group();
  private body: THREE.Group;
  private person: Person;
  mood: Mood = "neutral";
  private bob = Math.random() * 10;
  private jump = 0;
  private moodSet = false;

  constructor(seed: number, backdrop: Backdrop = "mountains") {
    this.person = buildPerson(seed, backdrop);
    this.body = this.person.body;
    this.root.add(this.body);
    this.setMood("neutral");
  }

  setMood(m: Mood): void {
    // Called every frame from the patience meter, so only redraw the face on a change.
    if (m !== this.mood || !this.moodSet) this.person.setMood(m);
    this.moodSet = true;
    this.mood = m;
    if (m === "happy") this.jump = 1;
  }

  update(dt: number, lookX: number): void {
    this.bob += dt * (this.mood === "angry" ? 9 : 2.2);
    this.jump = Math.max(0, this.jump - dt * 2.2);
    const hop = Math.sin(this.jump * Math.PI) * 0.5;
    this.body.position.y = Math.abs(Math.sin(this.bob)) * 0.05 + hop;
    this.body.rotation.z = this.mood === "angry" ? Math.sin(this.bob) * 0.05 : 0;
    this.person.look(lookX);
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
    // The truck's inside wall with the serving window cut into it, and the awning seen through it
    // (built to fit the band in layout).
    this.scene.add(this.valance, this.frame, this.soffit);
    for (let i = 0; i < 3; i++) this.slots.push({ fig: null, x: 0, enterT: 0, leaving: false });
  }

  /** The truck's inside wall round the window, its trim and sill, and the awning's underside. */
  private frame = new THREE.Group();
  private soffit = new THREE.Group();
  private lookCols: ReturnType<typeof lookColours> | null = null;
  private awningKind = "mustard";
  private hudF = 0.18;
  private railF = 0.45;
  /** The awning's hem across the top of the window, and any lights on it (see setLook). */
  private valance = new THREE.Group();

  /**
   * Dress the window in the truck's look: the awning's underside and hem, and string lights or
   * marquee bulbs along it.
   */
  setLook(look: Look): void {
    const c = lookColours(look);
    this.lookCols = c;
    this.awningKind = look.awning;
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
    // Lights: every bulb in one mesh and every halo in another (two draw calls, not two a bulb).
    const bulbs: THREE.BufferGeometry[] = [];
    const halos: THREE.BufferGeometry[] = [];
    const glow = (x: number, y: number, r: number) => {
      bulbs.push(new THREE.SphereGeometry(r, 10, 8).translate(x, y, 0.12));
      halos.push(new THREE.SphereGeometry(r * 2.4, 10, 8).translate(x, y, 0.12));
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
    if (bulbs.length) {
      g.add(new THREE.Mesh(mergeGeometries(bulbs), new THREE.MeshBasicMaterial({ color: "#fff1c2" })));
      g.add(new THREE.Mesh(mergeGeometries(halos), new THREE.MeshBasicMaterial({ color: "#ffd98a", transparent: true, opacity: 0.18, depthWrite: false })));
      for (const x of [...bulbs, ...halos]) x.dispose();
    }
    // The canvas, flags and scallops are static: bake them into a few meshes.
    bakeStatic(g);
    this.placeValance();
  }

  private placeValance(): void {
    this.buildFrame();
  }

  /** World point where the ray through a band point (NDC) meets the plane z = `z`. */
  private at(nx: number, ny: number, z: number): THREE.Vector3 {
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const out = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), out);
    return out;
  }

  /**
   * The inside of the truck. A painted wall fills the band except for the window, which
   * opens just under the HUD and closes at the order rail; a trim runs round the opening. Through
   * it the awning's underside slopes away from the window head to its hem, which hangs behind the
   * customers, just above their heads, with the view out of the window below it.
   */
  private buildFrame(): void {
    const v = CABIN;
    const cam = this.camera;
    if (!cam.aspect) return;
    disposeObject(this.frame);
    this.frame.clear();
    disposeObject(this.soffit);
    this.soffit.clear();
    const ZF = 4.8;
    const T = 0.3;
    const tl = this.at(-1, 1, ZF);
    const br = this.at(1, -1, ZF);
    const upp = (tl.y - br.y) / (this.bandPx || 287);
    const px = (n: number) => n * upp;
    // The opening: just under the HUD, down to the order rail, a slim jamb each side.
    const top = this.at(0, 1 - 2 * this.hudF, ZF).y - px(9);
    const bot = this.at(0, 1 - 2 * this.railF, ZF).y + px(5);
    const hw = br.x - px(9);
    const rad = px(14);
    const rr = <T extends THREE.Path>(p: T, x0: number, y0: number, x1: number, y1: number, r: number): T => {
      p.moveTo(x0 + r, y0);
      p.lineTo(x1 - r, y0);
      p.quadraticCurveTo(x1, y0, x1, y0 + r);
      p.lineTo(x1, y1 - r);
      p.quadraticCurveTo(x1, y1, x1 - r, y1);
      p.lineTo(x0 + r, y1);
      p.quadraticCurveTo(x0, y1, x0, y1 - r);
      p.lineTo(x0, y0 + r);
      p.quadraticCurveTo(x0, y0, x0 + r, y0);
      return p;
    };
    const base = v.wall;
    const wallMat = wallMaterial(v.wallTex, base, 1, 1, upp);
    const reveal = toon(new THREE.Color(base).multiplyScalar(0.82));
    const outer = new THREE.Shape([new THREE.Vector2(tl.x - 4, br.y - 6), new THREE.Vector2(br.x + 4, br.y - 6), new THREE.Vector2(br.x + 4, tl.y + 6), new THREE.Vector2(tl.x - 4, tl.y + 6)]);
    outer.holes.push(rr(new THREE.Path(), -hw, bot, hw, top, rad));
    const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: T, bevelEnabled: false, curveSegments: 6 }), [wallMat, reveal]);
    wall.position.z = ZF - T;
    this.frame.add(wall);
    // Trim round the opening.
    const trimCol = v.trim;
    const tw = px(5);
    const ring = rr(new THREE.Shape(), -hw - tw, bot - tw, hw + tw, top + tw, rad + tw);
    ring.holes.push(rr(new THREE.Path(), -hw, bot, hw, top, rad));
    const trim = mesh(new THREE.ExtrudeGeometry(ring, { depth: px(3), bevelEnabled: false, curveSegments: 6 }), trimCol, { ink: false, shadow: false });
    trim.position.z = ZF;
    this.frame.add(trim);
    // The sill: a ledge along the bottom of the opening that the order rail hangs under.
    const sill = mesh(faceted(new THREE.BoxGeometry(hw * 2 + tw * 2, px(6), 0.5)), trimCol, { ink: false, shadow: false });
    sill.position.set(0, bot - px(3), ZF + 0.1);
    this.frame.add(sill);

    // The awning: hem behind the customers, raised clear of their heads so the view shows under
    // it (scenery study, 2026-11-02; it used to hang at head height and hid most of the view).
    const VZ = -1.5;
    const hemNdc = 1 - 2 * this.hudF - 0.1;
    const hemY = this.at(0, hemNdc, VZ).y;
    const k = 1.25;
    this.valance.scale.setScalar(k);
    this.valance.position.set(0, hemY + 0.24 * k, VZ);
    const hemTop = hemY + (0.24 + 0.42) * k;
    const c = this.lookCols ?? lookColours({ paint: "coral", awning: "mustard" } as Look);
    // Underside: a slope from the window head to the top of the hem, in the awning's colour in shade.
    const near = new THREE.Vector3(0, top + 0.2, ZF - T - 0.05);
    const far = new THREE.Vector3(0, hemTop, VZ);
    const len = near.distanceTo(far);
    const under = new THREE.Mesh(
      new THREE.PlaneGeometry(60, len),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(c.awning).lerp(new THREE.Color("#3b2a3a"), 0.28), side: THREE.DoubleSide }),
    );
    under.position.copy(near).add(far).multiplyScalar(0.5);
    under.rotation.x = Math.atan2(far.y - near.y, near.z - far.z) - Math.PI / 2;
    this.soffit.add(under);
    {
      // Stripes on the underside for the striped canvas.
      // (All in one mesh: one draw call, not sixty.)
      if (this.awningKind === "stripes") {
        const parts: THREE.BufferGeometry[] = [];
        for (let i = -60; i < 60; i += 2) parts.push(new THREE.PlaneGeometry(0.5, len).translate(i * 0.5 + 0.25, 0, 0));
        const st = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ color: new THREE.Color("#faf3e6").lerp(new THREE.Color("#3b2a3a"), 0.22), side: THREE.DoubleSide }));
        for (const x of parts) x.dispose();
        st.position.copy(under.position);
        st.rotation.copy(under.rotation);
        st.position.y -= 0.01;
        this.soffit.add(st);
      }
    }
  }
  /** Band height in CSS px, for pixel-sized trim. */
  bandPx = 287;

  /** Dress the view out of the window for an area (see render/scenery.ts). */
  setBackdrop(kind: Backdrop): void {
    this.kind = kind;
    const g = this.backdrop;
    disposeObject(g);
    g.clear();
    const b = buildScenery(g, kind);
    (this.scene.background as THREE.Texture | null)?.dispose?.();
    this.scene.background = b.background;
    this.scene.fog = b.fog;
  }

  /**
   * The band shows the HUD strip at the top, the customers, then the window sill where the
   * order rail hangs (at `railF` of the band height). The camera looks straight out and is placed
   * so the sill lands on the rail and the customers fill the space above it.
   */
  layout(aspect: number, hudF = 0.18, railF = 0.45): void {
    this.hudF = hudF;
    this.railF = railF;
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
    this.buildFrame();
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
