// After build #86: the shift's report card (a modal over the evening map) and the one-row map bar.
// PORT=4188 OUT=/mnt/project-files/playtest86/ TAG=after [W=390] [GREAT=1] node tools/playtest/report86-shots.cjs
// GREAT=1 plays a great shift with big savings: the unlocked bonus, Buy on the card, the Garage dot.
const { open, out } = require('./lib.cjs');
const tag = process.env.TAG || 'now';
const W = Number(process.env.W || 390);
const great = !!process.env.GREAT;
(async () => {
  const { b, p } = await open({ w: W, h: 844, dpr: 2 });
  await p.evaluate((great) => { localStorage.setItem('bv-save-v1', JSON.stringify({ stop: 1, tutorialDone: true, popularity: 41, day: 4, bank: great ? 12340 : 1240 })); localStorage.setItem('bv-coach', JSON.stringify({ on: false, done: [] })); localStorage.setItem('bv-welcomed', '1'); }, great);
  await p.reload(); await p.waitForTimeout(1200);
  await p.addStyleTag({ content: '.hint{display:none!important}' });
  const shot = (n) => p.screenshot({ path: `${out}report-${tag}-${W}${great ? '-great' : ''}-${n}.png` });
  await shot('a-morning');
  await p.click('[data-home=open]'); await p.waitForTimeout(800);
  await p.click('[data-act=open]'); await p.waitForTimeout(1500);
  await p.evaluate((great) => { const g = window.__bv.game;
    if (great) { g.stars.push(5,5,5,5,5,5,5,5,5,5,5,5); g.served = 12; g.lost = 0; g.money += 150; g.tips += 30; }
    else { g.stars.push(5,4,4,5,3,4,5,4,2,5,4); g.served = 11; g.lost = 1; g.money += 118; g.tips += 17;
      g.reviews.push(5, 4); }
    g.customers = g.spawned; g.line.length = 0; g.time = g.shiftLength + 1; }, great);
  await p.waitForSelector('.report-card, .home-results.in', { timeout: 30000 }); await p.waitForTimeout(1200);
  await shot('b-arrive');
  const modal = await p.$('.report-card');
  if (modal && great) {
    const buy = await p.$('.report-card [data-rep=buy]');
    console.log('buy button', !!buy);
    if (buy) { await buy.click(); await p.waitForTimeout(400); await shot('c-bought'); }
    await p.click('.report-card [data-rep="continue"]'); await p.waitForTimeout(700); await shot('d-map-evening');
  } else if (modal) {
    await p.click('.report-card [data-rep="sec"][data-v="take"]'); await p.waitForTimeout(300); await shot('c-take-open');
    await p.click('.report-card [data-rep="sec"][data-v="rev"]'); await p.waitForTimeout(300); await shot('d-rev-open');
    await p.click('.report-card [data-rep="continue"]'); await p.waitForTimeout(700); await shot('e-map-evening');
    await p.click('[data-home=results]'); await p.waitForTimeout(700); await shot('f-reopened');
    await p.click('.report-card [data-m="close"]'); await p.waitForTimeout(500); await shot('g-closed');
  } else {
    const r = await p.$('.home-results [data-home=results]');
    if (r) { await r.click(); await p.waitForTimeout(700); await shot('c-old-results'); }
  }
  await b.close();
})();
