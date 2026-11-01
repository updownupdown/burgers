// Screenshots of the HUD, the pause menu (and its confirm), the map dock and the night transition.
// PORT=4173 node tools/playtest/menus-shots.cjs [tag]  ->  tools/playtest/out/menus-<tag>-*.png
const { open, step, out, enterShift } = require('./lib.cjs');
const tag = process.argv[2] || 'now';
(async () => {
  const { b, p } = await open({ w: 390, h: 844, dpr: 2 });
  await p.evaluate(() => localStorage.setItem('bv-save-v1', JSON.stringify({ stop: 1, tutorialDone: true, ratingCount: 14, ratingSum: 31, popularity: 34 })));
  await p.reload();
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}menus-${tag}-map.png` });
  await enterShift(p);
  await p.evaluate(() => window.__bv.manual(true));
  await step(p, 70);
  await p.evaluate(() => {
    const g = window.__bv.game;
    g.served = Math.max(g.served, 5); g.stars.push(3, 2, 3, 1, 2); g.lost = 1; g.money += 42; g.tips += 6;
    g.reviews.push({ stars: 3, text: 'Best burger this side of the pass.', stop: 'x' }, { stars: 1, text: 'Fries were cold by the time I got them.', stop: 'x' });
  });
  await step(p, 0.1);
  await p.screenshot({ path: `${out}menus-${tag}-hud.png`, clip: { x: 0, y: 0, width: 390, height: 120 } });
  await p.click('[data-r=menuBtn]');
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}menus-${tag}-pause.png` });
  await p.click('.pause-foot [data-m=quit]');
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}menus-${tag}-pause-quit.png` });
  await p.evaluate(() => document.querySelector('.pause-body').scrollTop = 9999);
  await p.click('.pause-confirm:not([hidden]) [data-m=cancel]');
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}menus-${tag}-pause-scrolled.png` });
  await b.close();
})();

// Second pass: the map dock, popularity & reviews, the night, dev mode.
(async () => {
  await new Promise((r) => setTimeout(r, 100));
  const { b, p } = await open({ w: 390, h: 844, dpr: 2 });
  await p.evaluate(() => localStorage.setItem('bv-save-v1', JSON.stringify({ stop: 1, tutorialDone: true, ratingCount: 14, ratingSum: 31, popularity: 34 })));
  await p.reload();
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}menus-${tag}-map2.png` });
  await p.click('[data-home=reviews]');
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}menus-${tag}-reviews.png` });
  await p.click('[data-act=back]');
  await p.waitForTimeout(600);
  // Play a shift to the evening quickly, then sleep.
  await enterShift(p);
  await p.evaluate(() => { window.__bv.manual(true); const g = window.__bv.game; g.customers = 0; g.stars.push(3, 2); g.served = 2; });
  await step(p, 400);
  await p.waitForTimeout(800);
  if (await p.$('[data-act=evening]')) { await p.click('[data-act=evening]'); }
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}menus-${tag}-evening.png` });
  await p.evaluate(() => window.__bv.manual(false));
  await p.click('.home-dock [data-home=sleep]');
  for (const ms of [300, 1400, 2700]) {
    await p.waitForTimeout(ms === 300 ? 300 : ms === 1400 ? 1100 : 1300);
    await p.screenshot({ path: `${out}menus-${tag}-night-${ms}.png` });
  }
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}menus-${tag}-morning.png` });
  // Dev mode
  await p.click('[data-home=settings]');
  await p.waitForTimeout(500);
  await p.click('[data-m=dev]');
  await p.click('[data-m=sim][data-v="50"]');
  await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('.settings .menu-body').scrollTop = 9999);
  await p.screenshot({ path: `${out}menus-${tag}-dev.png` });
  await p.click('.settings [data-m=close]');
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}menus-${tag}-sim50.png` });
  await b.close();
})();
