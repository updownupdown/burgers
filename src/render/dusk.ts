import * as THREE from "three";

/*
 * Sundown at the end of a shift (DESIGN.md §30): the kitchen's lights warm toward evening and
 * the sky in the window turns to sunset. Blends each scene's own lights, background and fog
 * toward a dusk mood by k (0 = as built, 1 = full dusk) and puts them back with reset().
 * The values were tuned on the real kitchen in the end-of-shift study.
 */

interface Mood {
  hemi: string;
  ground: string;
  hemiK: number;
  sun: string;
  sunK: number;
}

/** The counters only go part of the way, so food and machines stay readable. */
const COUNTER: Mood & { k: number; bg: string } = { k: 0.45, hemi: "#ffc9a0", ground: "#4a3f78", hemiK: 0.95, sun: "#ff9a5c", sunK: 1.6, bg: "#c9b3a8" };
/** The view out of the window goes all the way. */
const WINDOW: Mood = { hemi: "#ffc9a0", ground: "#4a3f78", hemiK: 1.05, sun: "#ff9a5c", sunK: 1.6 };
/** Sunset sky, top to horizon. */
const SKY = ["#41406e", "#b0627a", "#f2955f", "#ffd08a"];
const FOG = new THREE.Color("#e9a27a");
/** The clear colour round the bands (the receipt rail) warms a little too. */
const CLEAR = new THREE.Color("#3a2f45");

type LightSave = { light: THREE.Light; color: THREE.Color; ground?: THREE.Color; k: number };

export class Dusk {
  private lights: LightSave[] = [];
  private bgs: { scene: THREE.Scene; color: THREE.Color }[] = [];
  private sky: { scene: THREE.Scene; orig: THREE.Texture; fog: THREE.Color | null; tex: THREE.CanvasTexture; canvas: HTMLCanvasElement } | null = null;
  private clear: { target: THREE.Color; orig: THREE.Color } | null = null;
  /** How far toward dusk the kitchen is now. */
  k = 0;

  /** Start a sundown over these scenes; `clear` is the renderer's clear colour, warmed in place. */
  begin(counters: THREE.Scene[], win: THREE.Scene, clear: THREE.Color): void {
    this.reset();
    for (const s of counters) this.save(s, COUNTER.k);
    this.save(win, 1);
    for (const s of counters) if (s.background instanceof THREE.Color) this.bgs.push({ scene: s, color: s.background.clone() });
    this.clear = { target: clear, orig: clear.clone() };
    const bg = win.background;
    if (bg instanceof THREE.Texture && bg.image instanceof HTMLCanvasElement) {
      const canvas = document.createElement("canvas");
      canvas.width = bg.image.width;
      canvas.height = bg.image.height;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = bg.colorSpace;
      this.sky = { scene: win, orig: bg, fog: win.fog ? win.fog.color.clone() : null, tex, canvas };
      win.background = tex;
    }
    this.set(0);
  }

  private save(scene: THREE.Scene, k: number): void {
    scene.traverse((o) => {
      if (!(o instanceof THREE.HemisphereLight || o instanceof THREE.DirectionalLight)) return;
      this.lights.push({ light: o, color: o.color.clone(), ground: o instanceof THREE.HemisphereLight ? o.groundColor.clone() : undefined, k });
      o.userData.duskI = o.intensity;
    });
  }

  /** Blend to k (0..1). */
  set(k: number): void {
    this.k = k;
    for (const l of this.lights) {
      const t = k * l.k;
      const i0 = l.light.userData.duskI as number;
      const win = l.k === 1;
      const mood = win ? WINDOW : COUNTER;
      if (l.light instanceof THREE.HemisphereLight) {
        l.light.color.copy(l.color).lerp(new THREE.Color(mood.hemi), t);
        l.light.groundColor.copy(l.ground!).lerp(new THREE.Color(mood.ground), t);
        l.light.intensity = i0 + (mood.hemiK - i0) * t;
      } else {
        l.light.color.copy(l.color).lerp(new THREE.Color(mood.sun), t);
        l.light.intensity = i0 + (mood.sunK - i0) * t;
      }
    }
    for (const b of this.bgs) if (b.scene.background instanceof THREE.Color) b.scene.background.copy(b.color).lerp(new THREE.Color(COUNTER.bg), k * COUNTER.k);
    if (this.clear) this.clear.target.copy(this.clear.orig).lerp(CLEAR, k * 0.6);
    const s = this.sky;
    if (s) {
      const x = s.canvas.getContext("2d")!;
      const h = s.canvas.height;
      x.globalAlpha = 1;
      x.drawImage(s.orig.image as HTMLCanvasElement, 0, 0);
      const g = x.createLinearGradient(0, 0, 0, h);
      SKY.forEach((c, i) => g.addColorStop(i / (SKY.length - 1), c));
      x.globalAlpha = k;
      x.fillStyle = g;
      x.fillRect(0, 0, s.canvas.width, h);
      s.tex.needsUpdate = true;
      if (s.fog && s.scene.fog) s.scene.fog.color.copy(s.fog).lerp(FOG, k);
    }
  }

  /** Back to daylight, as the scenes were built. */
  reset(): void {
    for (const l of this.lights) {
      l.light.color.copy(l.color);
      if (l.light instanceof THREE.HemisphereLight && l.ground) l.light.groundColor.copy(l.ground);
      l.light.intensity = l.light.userData.duskI as number;
      delete l.light.userData.duskI;
    }
    for (const b of this.bgs) if (b.scene.background instanceof THREE.Color) b.scene.background.copy(b.color);
    if (this.clear) this.clear.target.copy(this.clear.orig);
    const s = this.sky;
    if (s) {
      // A new town may already have replaced the sky; only put back the one we took.
      if (s.scene.background === s.tex) {
        s.scene.background = s.orig;
        if (s.fog && s.scene.fog) s.scene.fog.color.copy(s.fog);
      }
      s.tex.dispose();
    }
    this.lights = [];
    this.bgs = [];
    this.sky = null;
    this.clear = null;
    this.k = 0;
  }
}
