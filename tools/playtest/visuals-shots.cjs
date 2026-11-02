// After build #76 (DESIGN §24): ingredient look-alikes, meters and ticket wording, region by region.
// Screenshots each middle counter's pans, a cooking scene on the comal (corn warming, pineapple
// charring, the same pineapple on a tray and in the rack) and the active tickets in each area.
//
// npm run build && npx vite preview --port 4177
// PORT=4177 TAG=after node tools/playtest/visuals-shots.cjs  ->  tools/playtest/shots-visuals/  (ONLY=pines,coast,desert,orchard picks areas)
const path = require('path');
const { chromium } = require('playwright');
const out = process.env.OUT || path.join(__dirname, 'shots-visuals') + '/';
require('fs').mkdirSync(out, { recursive: true });
const PORT = process.env.PORT || 4177;
const TAG = process.env.TAG || 'shot';
const ONLY = (process.env.ONLY || 'pines,coast,desert,orchard').split(',');
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor', 'redmesa', 'cactus', 'sunvalley', 'applecross', 'larkvale', 'portamber'];
const save = (town) => ({
  tutorialDone: true, town, day: 30, time: 'morning', unlocked: ALL, passedTowns: ALL,
  shiftsIn: Object.fromEntries(ALL.map((t) => [t, 3])), bank: 300, popularity: 60, found: [], bonuses: [],
});

async function start(b, town) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
  await p.goto(`http://localhost:${PORT}/`);
  await p.waitForTimeout(600);
  await p.evaluate((s) => { localStorage.setItem('bv-save-v1', JSON.stringify(s)); localStorage.setItem('bv-coach', JSON.stringify({ on: false, done: [] })); }, save(town));
  await p.reload();
  await p.waitForTimeout(900);
  await p.tap('[data-home=open]');
  await p.waitForTimeout(800);
  if (await p.$('[data-act=open]')) await p.tap('[data-act=open]');
  await p.waitForTimeout(300);
  await p.evaluate(() => window.__bv.manual(true));
  return p;
}
const ev = (p, f, a) => p.evaluate(f, a);
async function shot(p, name, clip) {
  await ev(p, () => { const h = document.querySelector('[data-r="hint"]'); if (h) h.style.visibility = 'hidden'; window.__bv.step(0.05); });
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}${TAG}-${name}.png`, ...(clip ? { clip } : {}) });
}
// Wait for customers and keep them patient.
async function customers(p, secs = 30) {
  for (let i = 0; i < secs; i++) await ev(p, () => { window.__bv.step(1); window.__bv.game.slots.forEach((s) => s.order && (s.patience = s.maxPatience)); });
}
// Every waiting customer's ticket in turn, as the active one.
async function tickets(p, name) {
  const n = await ev(p, () => window.__bv.game.slots.length);
  for (let i = 0; i < n; i++) {
    const ok = await ev(p, (i) => { const g = window.__bv.game; if (!g.slots[i].order || g.slots[i].leaving) return false; g.active = i; window.__bv.step(0.1); return g.slots[i].order.name; }, i);
    if (ok) await shot(p, `${name}-ticket-${i}`, { x: 0, y: 0, width: 390, height: 360 });
    console.log(name, 'slot', i, ok);
  }
}
let uid = 900000;
const piece = (kind, cook = [0, 0], extra = {}) => ({ uid: uid++, kind, cook, ...extra });

(async () => {
  const b = await chromium.launch();
  if (ONLY.includes('pines')) {
    const p = await start(b, 'summit');
    await customers(p, 25);
    await ev(p, () => window.__bv.goToPage(1));
    await ev(p, ([a, c, d]) => { const k = window.__bv.counter; k.addGrillItem(a, -1.2, 0.2); k.addGrillItem(c, 0.6, 0.2); k.addGrillItem(d, 2.0, 0.2); }, [piece('patty', [0.5, 0.2]), piece('bun', [0.4, 0]), piece('bacon', [0.5, 0.2])]);
    await ev(p, () => window.__bv.step(1.2));
    await shot(p, 'pines-grill');
    await tickets(p, 'pines');
    await p.context().close();
  }
  if (ONLY.includes('coast')) {
    const p = await start(b, 'harbor');
    await customers(p, 40);
    await ev(p, () => window.__bv.goToPage(1));
    await ev(p, () => window.__bv.step(1.2));
    await shot(p, 'coast-counter');
    await tickets(p, 'coast');
    // Breads side by side: a ciabatta and a sourdough each in an open bay, and the same breads on the trays.
    await ev(p, ([c, s, c2, m, s2, a]) => {
      const k = window.__bv.counter;
      const L = (piece) => ({ piece, offX: 0, offZ: 0 });
      k.setBay(k.bays[0], [L(c)]);
      k.setBay(k.bays[1], [L(s)]);
      const g = window.__bv.game;
      g.slots.forEach((sl, i) => {
        sl.plate.layers = i === 0 ? [L(c2), L(m)] : i === 1 ? [L(s2), L(a)] : sl.plate.layers;
        window.__bv.trayView.plates[i].setDish(true);
        window.__bv.trayView.plates[i].sync(sl.plate, false, () => {});
      });
    }, [piece('ciabatta', [0.2, 0.2]), piece('sourdough', [0.2, 0.2]), piece('ciabatta', [0.5, 0.5]), piece('mozzarella'), piece('sourdough', [0.5, 0.5]), piece('basil')]);
    await ev(p, () => window.__bv.step(0.3));
    await shot(p, 'coast-breads');
    await p.context().close();
  }
  if (ONLY.includes('desert')) {
    const p = await start(b, 'sunvalley');
    await customers(p, 30);
    await ev(p, () => window.__bv.goToPage(1));
    await ev(p, () => window.__bv.step(1));
    await shot(p, 'desert-counter');
    await ev(p, ([a, c, d, e, f]) => { const k = window.__bv.counter; k.addGrillItem(a, -1.2, -0.45); k.addGrillItem(c, 0.25, -0.45); k.addGrillItem(e, -1.2, 0.75); k.addGrillItem(f, 0.25, 0.75); k.addGrillItem(d, 1.85, 0.75); },
      [piece('corn', [0.12, 0.03]), piece('corn', [0.5, 0.12]), piece('flour', [0.4, 0.1]), piece('pineapple', [0.3, 0]), piece('corn', [0.85, 0.2])]);
    await ev(p, () => window.__bv.step(0.6));
    await shot(p, 'desert-comal');
    // The same pineapple on a tray (with tacos) and in the rack.
    await ev(p, ([c1, c2, pi, pk]) => {
      const g = window.__bv.game; const i = g.active;
      const s = g.slots[i];
      s.plate.layers = [c1, c2, pk, pi].map((piece) => ({ piece, offX: 0, offZ: 0 }));
      window.__bv.trayView.plates[i].sync(s.plate, false, () => {});
      window.__bv.counter.setRack([{ piece: { ...c1, uid: c1.uid + 50 }, offX: 0, offZ: 0 }, { piece: { ...pi, uid: pi.uid + 50 }, offX: 0, offZ: 0 }]);
    }, [piece('corn', [0.5, 0.1]), piece('corn', [0.5, 0.1]), piece('pineapple', [0.5, 0]), piece('pork')]);
    await ev(p, () => window.__bv.step(0.4));
    await shot(p, 'desert-pineapple');
    await tickets(p, 'desert');
    await p.context().close();
  }
  if (ONLY.includes('orchard')) {
    const p = await start(b, 'portamber');
    await customers(p, 30);
    await ev(p, () => window.__bv.goToPage(1));
    await ev(p, () => window.__bv.step(1));
    await shot(p, 'orchard-counter');
    await tickets(p, 'orchard');
    await p.context().close();
  }
  await b.close();
})();
