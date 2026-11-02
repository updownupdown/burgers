/*
 * Small canvas textures for camera-facing sprites: steam, smoke, grease spits, the perfect star and
 * the landing puff (review of build #78, P2-1 and P3-5). Each is drawn once and shared.
 */
import * as THREE from "three";

/** A soft round dot (32 px): a flat core with a soft edge, for steam, smoke and spits. Shared. */
let softDotTex: THREE.Texture | null = null;
export function softDot(): THREE.Texture {
  if (softDotTex) return softDotTex;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.92)");
  g.addColorStop(0.75, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  softDotTex = new THREE.CanvasTexture(c);
  softDotTex.colorSpace = THREE.SRGBColorSpace;
  return softDotTex;
}

/** A four-point star (64 px), soft at the tips, for the perfect sparkle. Shared. */
let starTexture: THREE.Texture | null = null;
export function starTex(): THREE.Texture {
  if (starTexture) return starTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  x.translate(32, 32);
  x.fillStyle = "#ffffff";
  x.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const r = i % 2 ? 7 : 30;
    x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  x.closePath();
  x.fill();
  x.strokeStyle = "rgba(201,140,40,0.9)";
  x.lineWidth = 2.5;
  x.stroke();
  starTexture = new THREE.CanvasTexture(c);
  starTexture.colorSpace = THREE.SRGBColorSpace;
  return starTexture;
}
