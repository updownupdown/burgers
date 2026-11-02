import * as THREE from "three";
import { rng } from "../render/bake";
import { grade } from "../render/materials";

/*
 * Wall finishes for the view study. Each is a canvas tile sized in screen pixels so the wall reads
 * as one surface across the three bands (window, pass shelf, counter backsplash), each drawn by its
 * own camera at its own scale.
 */

const css = (c: THREE.ColorRepresentation) => "#" + grade(c).getHexString();
const cache = new Map<string, THREE.CanvasTexture>();

/** One tile of the finish: 256 x 128 px covering `TILE_PX` x `TILE_PX / 2` screen px. */
export const TILE_PX = 104;

function draw(kind: string, base: string): THREE.CanvasTexture {
  const key = kind + base;
  let t = cache.get(key);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const x = c.getContext("2d")!;
  const r = rng(11);
  x.fillStyle = css(base);
  x.fillRect(0, 0, 256, 128);
  if (kind === "tile") {
    // Subway tile, 4 across and 4 down per tile, offset rows, soft grout and a light top bevel.
    const tw = 64;
    const th = 32;
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col < 5; col++) {
        const ox = col * tw + (row % 2 ? tw / 2 : 0);
        const oy = row * th;
        const g = x.createLinearGradient(0, oy, 0, oy + th);
        g.addColorStop(0, "rgba(255,255,255,.55)");
        g.addColorStop(0.25, "rgba(255,255,255,0)");
        g.addColorStop(1, "rgba(80,70,60,.07)");
        x.fillStyle = g;
        x.fillRect(ox + 2, oy + 2, tw - 4, th - 4);
        x.strokeStyle = "rgba(120,110,100,.35)";
        x.lineWidth = 2;
        x.strokeRect(ox + 1, oy + 1, tw - 2, th - 2);
      }
    }
  } else if (kind === "steel") {
    for (let i = 0; i < 500; i++) {
      x.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.05 + r() * 0.08})` : `rgba(40,50,55,${0.03 + r() * 0.05})`;
      const x0 = r() * 256;
      const len = 30 + r() * 150;
      const y = r() * 128;
      x.fillRect(x0, y, len, 1);
      if (x0 + len > 256) x.fillRect(x0 - 256, y, len, 1);
    }
  } else {
    // Paint (light) or matte dark: a faint speckle, like a sprayed finish.
    const dark = kind === "dark";
    for (let i = 0; i < 700; i++) {
      x.fillStyle = r() < 0.5 ? `rgba(255,255,255,${(dark ? 0.03 : 0.1) + r() * 0.06})` : `rgba(60,45,35,${(dark ? 0.08 : 0.04) + r() * 0.05})`;
      x.fillRect(r() * 256, r() * 128, 1.5, 1.5);
    }
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/**
 * A wall material whose tile covers TILE_PX screen pixels across, for a face `w` x `h` world
 * units drawn at `upp` world units per screen pixel across and `uppV` up (smaller when the wall is
 * seen from above and foreshortened).
 */
export function wallMaterial(kind: string, base: string, w: number, h: number, upp: number, uppV = upp): THREE.MeshBasicMaterial {
  const src = draw(kind, base);
  const t = src.clone();
  t.needsUpdate = true;
  t.repeat.set(w / (TILE_PX * upp), h / ((TILE_PX / 2) * uppV));
  // Unlit, so the wall is the same colour in every band whatever each band's lights do.
  const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  m.userData.disposable = true;
  return m;
}

/** The wall's flat colour (graded like the textures), for scene backgrounds behind it. */
export const wallColor = (base: string) => new THREE.Color(css(base));
