// Screenshots of the map, Prep & Open, Settings (from the map and from the pause menu).
// PORT=4173 node tools/playtest/ui-shots.cjs [tag]  ->  tools/playtest/out/ui-<tag>-*.png
const { open, out, enterShift, step } = require('./lib.cjs');
const tag = process.argv[2] || 'now';
(async () => {
  const { b, p } = await open({ w: 390, h: 844, dpr: 2 });
  await p.evaluate(() => localStorage.setItem('bv-save-v1', JSON.stringify({ stop: 1, tutorialDone: true, ratingCount: 14, ratingSum: 31, popularity: 34, bonuses: ['bench', 'tipjar'], bonus: 'tipjar', day: 7 })));
  await p.reload();
  await p.waitForTimeout(1000);
  const shot = (n) => p.screenshot({ path: `${out}ui-${tag}-${n}.png` });
  await shot('map');
  await p.click('[data-home=settings]');
  await p.waitForTimeout(500);
  await shot('settings');
  await p.click('.settings [data-m=close]');
  await p.waitForTimeout(500);
  // Tap a town for the sheet.
  const town = await p.$('.home-town:not(.here)');
  if (town) { const bb = await town.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(600); await shot('sheet'); if (await p.$('.home-sheet:not([hidden]) [data-home=close]')) await p.click('[data-home=close]'); await p.waitForTimeout(500); }
  await p.click('[data-home=open]');
  await p.waitForTimeout(800);
  await shot('prep');
  await p.evaluate(() => { const s = document.querySelector('.prep .day-scroll, .prep-scroll'); if (s) s.scrollTop = 600; });
  await p.waitForTimeout(200);
  await shot('prep-mid');
  await p.evaluate(() => { const s = document.querySelector('.prep .day-scroll, .prep-scroll'); if (s) s.scrollTop = 9999; });
  await p.waitForTimeout(200);
  await shot('prep-end');
  await p.click('[data-act=prep-ing]');
  await p.waitForTimeout(300);
  await p.evaluate(() => { const s = document.querySelector('.prep .day-scroll'); if (s) s.scrollTop = 500; });
  await shot('prep-ing');
  await p.click('[data-act=prep-ing]');
  await p.mouse.click(195, 4);
  await p.waitForTimeout(500);
  await shot('prep-closed');
  await p.click('[data-home=open]');
  await p.waitForTimeout(800);
  await p.click('[data-act=open]');
  await p.waitForTimeout(400);
  await p.evaluate(() => window.__bv.manual(true));
  await step(p, 3);
  await p.click('[data-r=menuBtn]');
  await p.waitForTimeout(400);
  await p.click('.pause [data-m=settings]');
  await p.waitForTimeout(400);
  await shot('pause-settings');
  await b.close();
})();
