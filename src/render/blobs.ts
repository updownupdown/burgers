import * as THREE from "three";

/*
 * Blob shadows for low quality (review of build #78, P2-5). Low turns the shadow map off, which
 * left food, cups and cartons floating with nothing under them; graphics tiers should change cost,
 * not the look. A soft dark disc under each thing keeps it grounded: every blob in a scene is one
 * instance of a single flat disc, so they cost one draw call together.
 */

const MAX = 48;
let tex: THREE.CanvasTexture | null = null;
function blobTex(): THREE.CanvasTexture {
  if (tex) return tex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,0.75)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  tex = new THREE.CanvasTexture(c);
  return tex;
}

const _box = new THREE.Box3();
const _c = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class BlobShadows {
  private mesh: THREE.InstancedMesh;
  constructor(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: blobTex(), color: "#3b2a3a", transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.raycast = () => {};
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /**
   * Put a blob under each object (at the bottom of its bounds, sized to its footprint), or hide
   * them all when `on` is false. `lift` raises the blobs a hair off the surface.
   */
  update(on: boolean, objects: (THREE.Object3D | null | undefined)[], lift = 0.012): void {
    this.mesh.visible = on;
    if (!on) return;
    let n = 0;
    for (const o of objects) {
      if (!o || n >= MAX || !shown(o)) continue;
      _box.setFromObject(o);
      if (_box.isEmpty()) continue;
      _box.getCenter(_c);
      _box.getSize(_s);
      const r = Math.max(_s.x, _s.z) * 1.15;
      if (r < 0.05 || r > 4) continue;
      _m.makeScale(r, 1, r * 0.92).setPosition(_c.x + r * 0.06, _box.min.y + lift, _c.z + r * 0.05);
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function shown(o: THREE.Object3D): boolean {
  for (let x: THREE.Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
  return !!o.parent;
}
