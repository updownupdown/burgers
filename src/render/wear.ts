import * as THREE from "three";
import { rng } from "./bake";
import { grade, lineColor, outline, texturedToon, toon } from "./materials";

/*
 * Light wear (the study's "Light wear" pick): brushed streaks on the steel, panel seams with
 * rivets on the wall, a faint speckle on the counter top and a thin bright bevel along its front
 * edge. Colours stay the palette's; only canvas texture is added, under the same toon bands.
 * Game units.
 */

const css = (c: THREE.ColorRepresentation) => "#" + grade(c).getHexString();

function tex(w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export interface BrushedOpts {
  /** Panel seams with a pair of rivet columns every `seams` px of the 512 px tile. */
  seams?: number;
  /** A soft light top and dark foot, like a panel catching the light. */
  band?: boolean;
  /** Number of streaks. */
  n?: number;
  seed?: number;
}

const TEX = new Map<string, THREE.CanvasTexture>();
const cachedTex = (key: string, make: () => THREE.CanvasTexture) => {
  let t = TEX.get(key);
  if (!t) TEX.set(key, (t = make()));
  return t;
};

/** Brushed metal: fine horizontal streaks over a base colour. A 512 x 256 tile. */
export function brushedTex(base: THREE.ColorRepresentation, o: BrushedOpts = {}): THREE.CanvasTexture {
  return cachedTex(`b|${css(base)}|${o.seams ?? 0}|${o.band ? 1 : 0}|${o.n ?? 700}|${o.seed ?? 3}`, () =>
    tex(512, 256, (x, w, h) => {
      x.fillStyle = css(base);
      x.fillRect(0, 0, w, h);
      const r = rng(o.seed ?? 3);
      for (let i = 0; i < (o.n ?? 700); i++) {
        const y = r() * h;
        const len = 40 + r() * 260;
        const x0 = r() * w;
        x.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.05 + r() * 0.09})` : `rgba(40,50,55,${0.03 + r() * 0.06})`;
        x.fillRect(x0, y, len, 1 + (r() < 0.2 ? 1 : 0));
        // Wrap streaks that run off the right edge so the tile repeats without a seam.
        if (x0 + len > w) x.fillRect(x0 - w, y, len, 1);
      }
      if (o.band) {
        const gr = x.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, "rgba(255,255,255,.18)");
        gr.addColorStop(0.18, "rgba(255,255,255,0)");
        gr.addColorStop(0.85, "rgba(0,0,0,0)");
        gr.addColorStop(1, "rgba(0,0,0,.10)");
        x.fillStyle = gr;
        x.fillRect(0, 0, w, h);
      }
      if (o.seams) {
        for (let sx = 0; sx < w; sx += o.seams) {
          x.fillStyle = "rgba(60,70,75,.35)";
          x.fillRect(sx, 0, 2, h);
          x.fillStyle = "rgba(60,70,75,.45)";
          for (let ry = 10; ry < h; ry += 34) {
            x.beginPath();
            x.arc((sx - 7 + w) % w, ry, 2.2, 0, Math.PI * 2);
            x.arc(sx + 9, ry, 2.2, 0, Math.PI * 2);
            x.fill();
          }
        }
      }
    }),
  );
}

/** Laminate or painted surface: the base colour with a faint light and dark speckle. A 256 px tile. */
export function speckleTex(base: THREE.ColorRepresentation, seed = 5): THREE.CanvasTexture {
  return cachedTex(`s|${css(base)}|${seed}`, () =>
    tex(256, 256, (x, w, h) => {
      x.fillStyle = css(base);
      x.fillRect(0, 0, w, h);
      const r = rng(seed);
      for (let i = 0; i < 900; i++) {
        x.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.12 + r() * 0.12})` : `rgba(90,70,50,${0.05 + r() * 0.07})`;
        x.fillRect(r() * w, r() * h, 1.5, 1.5);
      }
    }),
  );
}

/** A brushed-steel toon material (cached). Use on machine skins, doors and edges you build yourself. */
export function brushedSteel(color: THREE.ColorRepresentation = "#c9d1cf", o: BrushedOpts = {}): THREE.MeshToonMaterial {
  return texturedToon(brushedTex(color, o));
}

/** Scale a geometry's UVs so its texture tiles every `tw` x `th` units of a `w` x `h` face. */
function tileUV(g: THREE.BufferGeometry, w: number, h: number, tw: number, th: number): void {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tw, (uv.getY(i) * h) / th);
}

/** One 512 px tile of wall covers this many game units across (four panels), and this high. */
const WALL_TILE = { w: 6.4, h: 3.2 };

/**
 * Brushed steel wall panels with seams and rivets, `w` x `h` game units, 0.06 thick. Origin at
 * the bottom centre of the front face; it faces +z. Put it flush against the back wall.
 */
export function wallPanels(w: number, h: number, color: THREE.ColorRepresentation = "#dfe3e1"): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, 0.06);
  g.translate(0, h / 2, -0.03);
  tileUV(g, w, h, WALL_TILE.w, WALL_TILE.h);
  const m = new THREE.Mesh(g, brushedSteel(color, { seams: 128, band: true, n: 500 }));
  m.receiveShadow = true;
  m.name = "wall";
  return m;
}

/** The counter's brushed-steel texture tiles every this many game units across, and half that deep. */
const COUNTER_TILE = 2.5;

/**
 * A stainless counter top `w` x `d` game units and 0.3 thick: brushed steel, a thin bright strip
 * along its front edge for the rolled lip,
 * and a brushed kick strip under it. Origin at the centre of the top surface.
 */
export function counterTop(w: number, d: number, color: THREE.ColorRepresentation = "#c4cccc"): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, 0.3, d);
  geo.translate(0, -0.15, 0);
  tileUV(geo, w, d, COUNTER_TILE, COUNTER_TILE / 2);
  const top = new THREE.Mesh(geo, brushedSteel(color, { n: 1600, seed: 9 }));
  top.receiveShadow = true;
  top.name = "counterTop";
  outline(top, 1.004, lineColor(grade(color)));
  const bevel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, 0.035), toon("#ffffff"));
  bevel.position.set(0, -0.005, d / 2 + 0.005);
  bevel.name = "bevel";
  const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.26, 0.03), brushedSteel("#c9d1cf", { seed: 2 }));
  edge.position.set(0, -0.16, d / 2 + 0.012);
  edge.name = "edge";
  g.add(top, bevel, edge);
  g.userData = { footprint: { w, d }, h: 0 };
  return g;
}
