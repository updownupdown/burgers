// The doneness meters and counter buttons: grill with food at every doneness, fryer with loaded
// baskets, and a frame mid-way between counters so the buttons' glide shows.
// PORT=4175 node tools/playtest/nav-shots.cjs [tag]  ->  tools/playtest/out/nav-<tag>-*.png
const { open, step, out, enterShift } = require('./lib.cjs');
const tag = process.argv[2] || 'now';
(async () => {
  const { b, p } = await open({ w: 390, h: 844, dpr: 2 });
  await p.evaluate(() => localStorage.setItem('bv-save-v1', JSON.stringify({ stop: 0, tutorialDone: true })));
  await p.reload(); await p.waitForTimeout(600);
  await enterShift(p);
  await p.evaluate(() => window.__bv.manual(true));
  await step(p, 1);
  await p.addStyleTag({ content: '.hint{display:none!important}' });
  await p.evaluate(() => window.__bv.goToPage(1));
  await step(p, 1.5);
  const zones = await p.evaluate(() => [0, 1, 2].map((i) => window.__bv.counter.zoneSpots(i)));
  await p.evaluate((zones) => {
    const c = window.__bv.counter; let uid = 7000;
    const pc = (kind, cook, extra = {}) => ({ uid: uid++, kind, cook, ...extra });
    c.addGrillItem(pc('patty', [0.15, 0.05]), zones[0][0].x, zones[0][0].z);
    c.addGrillItem(pc('patty', [0.7, 0.4], { marks: [0, 0.9], flips: 1 }), zones[0][1].x, zones[0][1].z);
    c.addGrillItem(pc('bacon', [0.7, 0.4]), zones[0][2].x, zones[0][2].z);
    c.addGrillItem(pc('egg', [0.4, 0.1]), zones[1][0].x, zones[1][0].z);
    c.addGrillItem(pc('patty', [0.3, 0.2]), zones[1][1].x, zones[1][1].z);
    c.addGrillItem(pc('patty', [1.2, 0.8]), zones[1][2].x, zones[1][2].z);
    const s = c.addGrillItem(pc('patty', [0.55, 0.55]), zones[2][0].x, zones[2][0].z);
    c.addGrillItem(pc('patty', [0.55, 0.55]), 0, 0, undefined, s);
    c.addGrillItem(pc('bun', [0.5, 0]), zones[2][2].x, zones[2][2].z);
  }, zones);
  await step(p, 0.1); await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}nav-${tag}-grill.png` });
  await p.evaluate(() => window.__bv.goToPage(2));
  await step(p, 0.12); await p.waitForTimeout(100);
  await p.screenshot({ path: `${out}nav-${tag}-moving.png` });
  await p.evaluate(() => { window.__bv.counter.baskets.forEach((b, i) => { b.loaded = true; b.amount = 0.9; b.cook = 0.3 + i * 0.45; b.down = true; }); });
  await step(p, 1.5); await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}nav-${tag}-fryer.png` });
  await p.evaluate(() => window.__bv.goToPage(0));
  await step(p, 2); await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}nav-${tag}-drinks.png` });
  await b.close();
})();
