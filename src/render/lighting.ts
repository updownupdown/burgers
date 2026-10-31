import * as THREE from "three";

/*
 * Lighting mood for the kitchen: halfway between the study's "Even daylight" (today's warm sky
 * and soft sun from the front right) and "Window light" (cool, low daylight from a window on
 * the left). The sun comes from the upper left at a middle height, a little cooler than today,
 * so shadows fall to the right and slightly long without hiding food; the sky keeps today's
 * warm cream over a violet ground, so shadows tint rather than grey out. Everything stays in
 * the three-band toon shading.
 */

const DAY = { sky: "#fff4dc", ground: "#6e62a0", hemi: 1.15, sun: "#fff1d6", sunK: 1.9, dir: new THREE.Vector3(3, 10, 5) };
const WINDOW = { sky: "#f6f3ff", ground: "#8a7fa8", hemi: 1.15 * 0.95, sun: "#fffaf0", sunK: 1.9 * 1.5, dir: new THREE.Vector3(-1.0, 1.1, 0.35) };
/** How far toward window light the mood sits. */
const MIX = 0.5;

const mixColor = (a: string, b: string) => new THREE.Color(a).lerp(new THREE.Color(b), MIX);

/** Direction toward the sun (unit vector). */
export const SUN_DIR = DAY.dir.clone().normalize().lerp(WINDOW.dir.clone().normalize(), MIX).normalize();
/** Scene background that goes with the mood: between today's warm paper and the window's cool grey. */
export const KITCHEN_BG = mixColor("#d9cfc2", "#cfd8dc");

export interface KitchenLight {
  hemi: THREE.HemisphereLight;
  /** The shadow caster. */
  sun: THREE.DirectionalLight;
  /** Re-aim the sun at a point (a page centre), keeping its direction. */
  aim: (x: number, z: number) => void;
  setShadows: (on: boolean) => void;
}

export interface KitchenLightOpts {
  /** Shadow camera box around the sun's target, in world units. */
  shadowBox?: { left: number; right: number; top: number; bottom: number };
  /** Shadow map size. Default 2048 x 1024. */
  mapSize?: [number, number];
  /** Where the sun points at first. */
  target?: { x: number; z: number };
}

/** Add the kitchen's hemisphere and sun lights to a scene. Call once; remove any older lights first. */
export function applyKitchenLight(scene: THREE.Scene, o: KitchenLightOpts = {}): KitchenLight {
  const hemi = new THREE.HemisphereLight(mixColor(DAY.sky, WINDOW.sky), mixColor(DAY.ground, WINDOW.ground), THREE.MathUtils.lerp(DAY.hemi, WINDOW.hemi, MIX));
  const sun = new THREE.DirectionalLight(mixColor(DAY.sun, WINDOW.sun), THREE.MathUtils.lerp(DAY.sunK, WINDOW.sunK, MIX));
  sun.castShadow = true;
  sun.shadow.mapSize.set(...(o.mapSize ?? [2048, 1024]));
  Object.assign(sun.shadow.camera, { ...(o.shadowBox ?? { left: -24, right: 34, top: 8, bottom: -8 }), near: 1, far: 40 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.002;
  sun.shadow.normalBias = 0.02;
  scene.add(hemi, sun, sun.target);
  const aim = (x: number, z: number) => {
    sun.target.position.set(x, 0, z);
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 14);
    sun.target.updateMatrixWorld();
  };
  aim(o.target?.x ?? 0, o.target?.z ?? 0);
  return { hemi, sun, aim, setShadows: (on) => void (sun.castShadow = on) };
}
