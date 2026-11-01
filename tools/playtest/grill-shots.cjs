// The grill mid-shift: patties at each doneness (one with grill marks, one stack), eggs sunny and
// flipped, bacon, a toasting bun, a stack of buns on the warm end and an egg mess on the grille.
// Real gestures too: drag two patties from the pan onto one spot (they stack), tap a patty (flip).
// PORT=4175 node tools/playtest/grill-shots.cjs [tag]  ->  tools/playtest/out/grill-<tag>.png
const { open, step, out, enterShift, gesture, line, state } = require('./lib.cjs');
const tag = process.argv[2] || 'now';
(async () => {
  const { b, p } = await open({ w: 390, h: 844, dpr: 2 });
  await p.evaluate(() => localStorage.setItem('bv-save-v1', JSON.stringify({ stop: 0, tutorialDone: true })));
  await p.reload();
  await p.waitForTimeout(600);
  await enterShift(p);
  await p.evaluate(() => window.__bv.manual(true));
  await step(p, 1);
  await p.evaluate(() => window.__bv.goToPage(1));
  await step(p, 1);
  const zones = await p.evaluate(() => [0, 1, 2].map((i) => window.__bv.counter.zoneSpots(i)));
  await p.evaluate((zones) => {
    const c = window.__bv.counter;
    let uid = 7000;
    const pc = (kind, cook, extra = {}) => ({ uid: uid++, kind, cook, ...extra });
    // Grille: raw, medium with marks.
    c.addGrillItem(pc('patty', [0.15, 0.05]), zones[0][0].x, zones[0][0].z);
    c.addGrillItem(pc('patty', [0.7, 0.4], { marks: [0, 0.9], flips: 1 }), zones[0][1].x, zones[0][1].z);
    c.addGrillItem(pc('bacon', [0.7, 0.4]), zones[0][2].x, zones[0][2].z);
    // Flat: egg sunny, egg flipped, well-done patty.
    c.addGrillItem(pc('egg', [0.4, 0.1]), zones[1][0].x - 0.5, zones[1][0].z);
    c.addGrillItem(pc('egg', [0.3, 0.3], { flips: 1 }), zones[1][0].x + 0.55, zones[1][0].z);
    c.addGrillItem(pc('patty', [0.95, 0.6]), zones[1][2].x, zones[1][2].z);
    // Warm: a stack of three patties and a stack of two buns.
    let s = c.addGrillItem(pc('patty', [0.55, 0.55]), zones[2][0].x, zones[2][0].z);
    s = c.addGrillItem(pc('patty', [0.55, 0.55]), 0, 0, undefined, s);
    c.addGrillItem(pc('patty', [0.6, 0.5], { marks: [0.8, 0] }), 0, 0, undefined, s);
    const bn = c.addGrillItem(pc('bun', [0.5, 0]), zones[2][2].x, zones[2][2].z);
    c.addGrillItem(pc('bun', [0.5, 0]), 0, 0, undefined, bn);
    c.addMess(zones[0][1].x + 0.2, zones[0][1].z + 0.9);
  }, zones);
  // Drag two raw patties from the pan to the same spot on the flat: they should stack.
  const pan = await p.evaluate(() => { const b = window.__bv.counter.bins.find((x) => x.kind === 'patty'); return window.__bv.project('counter', b.x + window.__bv.counter.world(1, 0, 0, 0).x, b.y, b.z); });
  const spot = await p.evaluate((z) => window.__bv.project('counter', window.__bv.counter.world(1, 0, 0, 0).x + z.x, 0.9, z.z), zones[1][1]);
  for (let i = 0; i < 2; i++) { await gesture(p, line(pan[0], pan[1], spot[0], spot[1], 14), 16); await step(p, 0.3); }
  await step(p, 2);
  await p.waitForTimeout(300);
  console.log(JSON.stringify((await state(p)).grill));
  await p.screenshot({ path: `${out}grill-${tag}.png` });
  await b.close();
})();
