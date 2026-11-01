// Backdrops for the meter/tabs study: each counter with tags, hint, ticket and tabs hidden, plus tag positions.
const { open, step, out, enterShift } = require('./lib.cjs');
(async () => {
  const { b, p } = await open({ w: 390, h: 844, dpr: 2 });
  await p.evaluate(() => localStorage.setItem('bv-save-v1', JSON.stringify({ stop: 0, tutorialDone: true })));
  await p.reload(); await p.waitForTimeout(600);
  await enterShift(p);
  await p.evaluate(() => window.__bv.manual(true));
  await step(p, 1);
  await p.evaluate(() => window.__bv.goToPage(1));
  await step(p, 1);
  const zones = await p.evaluate(() => [0, 1, 2].map((i) => window.__bv.counter.zoneSpots(i)));
  await p.evaluate((zones) => {
    const c = window.__bv.counter; let uid = 7000;
    const pc = (kind, cook, extra = {}) => ({ uid: uid++, kind, cook, ...extra });
    c.addGrillItem(pc('patty', [0.15, 0.05]), zones[0][0].x, zones[0][0].z);
    c.addGrillItem(pc('patty', [0.7, 0.4], { marks: [0, 0.9], flips: 1 }), zones[0][1].x, zones[0][1].z);
    c.addGrillItem(pc('bacon', [0.7, 0.4]), zones[0][2].x, zones[0][2].z);
    c.addGrillItem(pc('egg', [0.4, 0.1]), zones[1][0].x, zones[1][0].z);
    c.addGrillItem(pc('patty', [0.95, 0.6]), zones[1][2].x, zones[1][2].z);
    c.addGrillItem(pc('patty', [0.3, 0.2]), zones[1][1].x, zones[1][1].z);
    c.addGrillItem(pc('patty', [0.55, 0.55]), zones[2][0].x, zones[2][0].z);
    c.addGrillItem(pc('bun', [0.5, 0]), zones[2][2].x, zones[2][2].z);
  }, zones);
  const shots = {};
  const hide = `.gtag,.ftag,.hint,.tabs,.ticket,.tickets,.rail,[class*=ticket]{visibility:hidden!important}`;
  await step(p, 0.2); await p.waitForTimeout(300);
  const tags = async (sel) => p.evaluate((sel) => [...document.querySelectorAll(sel)].filter(e => e.offsetParent && getComputedStyle(e).display !== 'none').map(e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, cls: (e.querySelector('.cmeter')||{}).className || '' }; }), sel);
  shots.grillTags = await tags('.gtag');
  const tabsH = await p.evaluate(() => document.querySelector('.tabs').getBoundingClientRect().top);
  shots.tabsTop = tabsH;
  await p.addStyleTag({ content: hide });
  await p.waitForTimeout(200);
  await p.screenshot({ path: `${out}bd-1.png` });
  for (const pg of [0, 2]) {
    await p.evaluate((pg) => window.__bv.goToPage(pg), pg);
    if (pg === 2) {
      await p.evaluate(() => { const c = window.__bv.counter; c.baskets.forEach((b, i) => { if (i < 2) { b.loaded = true; b.amount = 0.9; b.cook = 0.3 + i * 0.4; b.down = true; } }); });
    }
    await step(p, 1.5); await p.waitForTimeout(300);
    if (pg === 2) { await p.addStyleTag({ content: '.ftag{visibility:visible!important}' }); await step(p, 0.1); shots.fryTags = await tags('.ftag'); await p.addStyleTag({ content: '.ftag{visibility:hidden!important}' }); }
    await p.screenshot({ path: `${out}bd-${pg}.png` });
  }
  console.log(JSON.stringify(shots));
  await b.close();
})();
