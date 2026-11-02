// Close-ups of the pesto spread, tomato slices and rocket after build #82's playtest notes
// (DESIGN §34): two paninis built by touch at Harbor City (the first moved into a press bay so
// both show at once), the tray, the bay and the bins.
// PORT=4175 TAG=after OUT=/some/dir/ node tools/playtest/models82-shots.cjs  ->  <OUT><TAG>-*.png
const path = require('path');
process.env.OUT = process.env.OUT || path.join(__dirname, 'out') + '/';
const { open, step, line, out, enterShift } = require('./lib.cjs');
const TAG = process.env.TAG || 'shot';
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor'];
const save = (town) => ({
  tutorialDone: true, town, day: 20, time: 'morning', unlocked: ALL, passedTowns: ALL,
  shiftsIn: Object.fromEntries(ALL.map((t) => [t, 3])), bank: 300, popularity: 60, found: [], bonuses: [],
});

(async () => {
  const { b, p } = await open({ w: 390, h: 844, dpr: 3 });
  await p.evaluate((s) => localStorage.setItem('bv-save-v1', JSON.stringify(s)), save('harbor'));
  await p.reload();
  await p.waitForTimeout(800);
  await enterShift(p);
  await p.evaluate(() => window.__bv.manual(true));
  await step(p, 1.5);
  const ev = (f, a) => p.evaluate(f, a);
  const fire = (t, x, y) => ev(([t, x, y]) => document.getElementById('gl').dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, pointerId: 7, bubbles: true, pointerType: 'touch', isPrimary: true })), [t, x, y]);
  const drag = async (pts, ms = 16) => {
    await fire('pointerdown', ...pts[0]);
    for (const q of pts.slice(1)) { await p.waitForTimeout(ms); await fire('pointermove', ...q); }
    await p.waitForTimeout(ms);
    await fire('pointerup', ...pts[pts.length - 1]);
    await step(p, 0.4);
  };
  const hp = (type, f = {}) => ev(([type, f]) => {
    const c = window.__bv.counter;
    const m = c.hitMeshes.find((h) => h.userData.hit.type === type && Object.entries(f).every(([k, v]) => h.userData.hit[k] === v));
    if (!m) throw new Error('no proxy ' + type + JSON.stringify(f));
    return window.__bv.project('counter', m.position.x, m.position.y, m.position.z);
  }, [type, f]);
  const plate = (i) => ev((i) => { const b = window.__bv.trayView.plates[i].burger; b.updateWorldMatrix(true, false); const e = b.matrixWorld.elements; return window.__bv.project('tray', e[12], 0.3, e[14]); }, i);
  const press = () => ev(() => window.__bv.press());
  const proj = (v) => ev((v) => window.__bv.project('counter', v[0], v[1], v[2]), v);
  const hideHint = () => ev(() => { const h = document.querySelector('[data-r="hint"]'); if (h) h.style.display = 'none'; });
  // A close-up: zoom the band's camera in on a screen point (a sub-rectangle of its current view,
  // so the counter's crop still holds), hide the page's overlays, shoot the band, put it all back.
  const shot = async (name, band, sx, sy, zoom = 3) => {
    await ev(([band, sx, sy, zoom]) => {
      const bv = window.__bv;
      const r = band === 'tray' ? bv.bands.tray : bv.bands.counter;
      const cam = band === 'tray' ? bv.trayView.camera : bv.counter.camera;
      const v = cam.view && cam.view.enabled ? { ...cam.view } : { fullWidth: r.w, fullHeight: r.h, offsetX: 0, offsetY: 0, width: r.w, height: r.h };
      window.__shotView = cam.view && cam.view.enabled ? { ...cam.view } : null;
      const cx = v.offsetX + ((sx - r.x) / r.w) * v.width;
      const cy = v.offsetY + ((sy - r.y) / r.h) * v.height;
      const w = v.width / zoom, h = v.height / zoom;
      cam.setViewOffset(v.fullWidth, v.fullHeight, cx - w / 2, cy - h / 2, w, h);
      cam.updateProjectionMatrix();
      for (const el of document.body.children) if (el.id !== 'gl' && !el.contains(document.getElementById('gl'))) { el.dataset.shotVis = el.style.visibility; el.style.visibility = 'hidden'; }
    }, [band, sx, sy, zoom]);
    await step(p, 0.02);
    await p.waitForTimeout(150);
    const r = await ev((band) => (band === 'tray' ? window.__bv.bands.tray : window.__bv.bands.counter), band);
    await p.screenshot({ path: `${out}${TAG}-${name}.png`, clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
    await ev((band) => {
      const bv = window.__bv;
      const cam = band === 'tray' ? bv.trayView.camera : bv.counter.camera;
      const v = window.__shotView;
      if (v) cam.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height);
      else cam.clearViewOffset();
      cam.updateProjectionMatrix();
      for (const el of document.body.children) if (el.dataset.shotVis !== undefined) { el.style.visibility = el.dataset.shotVis; delete el.dataset.shotVis; }
    }, band);
    await step(p, 0.02);
  };
  const order = {
    name: 'Caprese', price: 10, mods: [], fries: false, drink: null, friesSize: 'S', drinkSize: 'M',
    layers: [{ kind: 'ciabatta', toasted: true }, { kind: 'pesto' }, { kind: 'tomato', count: 3 }, { kind: 'rocket' }, { kind: 'ciabatta', toasted: true }],
  };
  await ev((o) => { const g = window.__bv.game; const s = g.slots[g.active]; Object.assign(s.order, o); s.patience = s.maxPatience = 900; s.ticketKey = ''; }, order);
  const fromBin = async (kind, n = 1) => {
    const [bx, by] = await hp('bin', { kind });
    const [px, py] = await plate(0);
    for (let i = 0; i < n; i++) await drag(line(bx, by, px, py, 10));
  };
  // Squeeze pesto: press the bottle, drag over the bread, then a zigzag (as the bots draw it).
  const sauce = async (kind, wobble) => {
    const [px] = await plate(0);
    const bt = await hp('bottle', { sauce: kind });
    const [cx, cy, side] = await ev(() => window.__bv.sauceCentre());
    await fire('pointerdown', ...bt);
    for (const q of line(bt[0], bt[1], px, cy, 12)) { await p.waitForTimeout(16); await fire('pointermove', ...q); }
    await step(p, 0.4);
    let at = [px, cy];
    for (let z = 0; z <= 5; z++) {
      const q = [cx + (z % 2 ? 0.3 : -0.3) * side + wobble * (z - 2), cy - 0.27 * side + z * 0.1 * side + 34];
      for (const r of line(at[0], at[1], q[0], q[1], 8)) { await p.waitForTimeout(8); await fire('pointermove', ...r); }
      at = q;
    }
    await step(p, 0.1);
    await fire('pointerup', ...at);
    await step(p, 0.6);
  };
  const build = async (k, wobble) => {
    await fromBin('ciabatta');
    await sauce('pesto', wobble);
    let [px, py] = await plate(0);
    await shot(`tray-pesto-${k}`, 'tray', px, py - 6, 3.2);
    await fromBin('tomato', 3);
    [px, py] = await plate(0);
    await shot(`tray-tomato-${k}`, 'tray', px, py - 10, 3);
    await fromBin('rocket');
    [px, py] = await plate(0);
    await shot(`tray-rocket-${k}`, 'tray', px, py - 14, 2.6);
  };
  await build(1, 0);
  // Lid it with bread and lift it whole into bay 0 (left open), then build the second one.
  await fromBin('ciabatta');
  {
    const [px, py] = await plate(0);
    const pr = await press();
    const [bx, by] = await proj(pr.bays[0].plate);
    await drag(line(px, py, bx, by, 14));
    await shot('bay', 'counter', bx, by - 10, 2.6);
  }
  await build(2, 6);
  // The bins with their heaps.
  for (const k of ['tomato', 'rocket']) {
    const [x, y] = await hp('bin', { kind: k });
    await shot(`bin-${k}`, 'counter', x, y, 3.2);
  }
  await hideHint();
  await p.screenshot({ path: `${out}${TAG}-counter.png` });
  await b.close();
})();
