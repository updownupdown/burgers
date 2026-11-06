// UI polish after build #88 (DESIGN §46): screenshots every surface it changed at 390x844 @2x.
// PORT=4191 OUT=dir/ [W=320 H=640] node tools/playtest/ui46-shots.cjs [only,only]
// Parts: map, sheet, garage, reviews, settings, prep, kitchen, press, report, welcome.
const { open, step, enterShift, out } = require('./lib.cjs');
const only = (process.argv[2] || '').split(',').filter(Boolean);
const want = (n) => !only.length || only.includes(n);
const TOWNS = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater'];
const base = { town: 'saltwater', day: 5, time: 'morning', popularity: 43, bank: 135, tutorialDone: true, unlocked: TOWNS, shiftsIn: { pinecrest: 3, saltwater: 1 } };

async function load(p, save, welcomed = true) {
  await p.evaluate(({ s, welcomed }) => {
    localStorage.clear();
    if (s) localStorage.setItem('bv-save-v1', JSON.stringify(s));
    localStorage.setItem('bv-coach', JSON.stringify({ on: false, done: [] }));
    if (welcomed) localStorage.setItem('bv-welcomed', '1');
  }, { s: save, welcomed });
  await p.reload();
  await p.waitForTimeout(1400);
}

(async () => {
  const { b, p } = await open({ w: +(process.env.W || 390), h: +(process.env.H || 844), dpr: 2 });
  const shot = (n, clip) => p.screenshot({ path: `${out}${n}.png`, clip });
  if (want('map') || want('sheet') || want('garage') || want('reviews') || want('settings') || want('prep')) await load(p, base);
  if (want('map')) {
    await shot('map');
    const vp = p.viewportSize();
    await shot('dock', { x: 0, y: vp.height - 144, width: vp.width, height: 144 });
    await shot('zoom', { x: vp.width - 150, y: 120, width: 150, height: 260 });
  }
  if (want('sheet')) {
    const town = await p.$('.home-town.here');
    const bb = await town.boundingBox();
    await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await p.waitForTimeout(800);
    await shot('sheet');
    await p.click('[data-home=close]');
    await p.waitForTimeout(500);
  }
  if (want('garage')) {
    await p.click('[data-home=garage]'); await p.waitForTimeout(700); await shot('garage');
    await p.evaluate(() => { const s = document.querySelector('.garage .day-scroll'); if (s) s.scrollTop = 520; }); await p.waitForTimeout(300); await shot('garage-far');
    await p.click('.garage [data-act=back]'); await p.waitForTimeout(500);
  }
  if (want('reviews')) { await p.click('[data-home=reviews]'); await p.waitForTimeout(700); await shot('reviews-empty'); await p.click('.day-screen [data-act=back]'); await p.waitForTimeout(500); }
  if (want('settings')) { await p.click('[data-home=settings]'); await p.waitForTimeout(700); await shot('settings'); await p.click('.settings [data-m=close]'); await p.waitForTimeout(500); }
  if (want('prep')) { await p.click('[data-home=open]'); await p.waitForTimeout(900); await shot('prep'); await p.click('.prep [data-m=close], .prep [data-act=back]'); await p.waitForTimeout(500); }
  if (want('reviews')) {
    await load(p, { ...base, reviewCounts: [0, 1, 0, 3, 6, 9] });
    await p.click('[data-home=reviews]'); await p.waitForTimeout(700); await shot('reviews');
  }
  if (want('kitchen')) {
    // Pinecrest on day 5: the active tray's ring on the wood, the local ask as a flag in the HUD and,
    // after a tap on it, its words as a tip in the lane under the HUD.
    await load(p, { ...base, town: 'pinecrest' });
    await enterShift(p);
    await p.evaluate(() => window.__bv.manual(true));
    await step(p, 8);
    await p.waitForTimeout(300);
    await p.addStyleTag({ content: '.hint{transition:none!important}' });
    await p.evaluate(() => { document.querySelector('.hint').hidden = true; });
    await shot('kitchen');
    await shot('hud', { x: 0, y: 0, width: p.viewportSize().width, height: 140 });
    const chip = await p.$('.askchip:not([hidden])');
    if (chip) {
      await chip.click();
      await step(p, 0.1); await p.waitForTimeout(200);
      await shot('kitchen-tip');
      await shot('tip', { x: 0, y: 0, width: p.viewportSize().width, height: 220 });
    } else console.log('no ask chip at pinecrest day 5');
    await p.click('[data-r=menuBtn]'); await p.waitForTimeout(600); await shot('pause');
  }
  if (want('press')) {
    // Harbor City: the press bays (steel) beside the trays; the active tray's ring there.
    await load(p, { ...base, town: 'harbor', unlocked: [...TOWNS, 'gullpoint', 'driftwood', 'harbor'], shiftsIn: { harbor: 1 } });
    await enterShift(p);
    await p.evaluate(() => window.__bv.manual(true));
    await step(p, 8);
    await p.waitForTimeout(300);
    await p.evaluate(() => { document.querySelector('.hint').hidden = true; });
    await shot('press');
  }
  if (want('report')) {
    await load(p, { ...base, town: 'saltwater', day: 4 });
    await p.addStyleTag({ content: '.hint{display:none!important}' });
    await enterShift(p);
    await p.waitForTimeout(1200);
    await p.evaluate(() => { const g = window.__bv.game; g.stars.push(5, 4, 4, 5, 3, 4, 5, 4, 2, 5, 4); g.served = 11; g.lost = 1; g.money += 118; g.tips += 17;
      g.reviews.push({ stars: 5, text: 'Worth the drive.', stop: 'x' }, { stars: 4, text: 'Fries could be crispier.', stop: 'x' });
      g.customers = g.spawned; g.line.length = 0; g.time = g.shiftLength + 1; });
    await p.waitForSelector('.report-card', { timeout: 30000 });
    await p.waitForTimeout(1500);
    await shot('report');
  }
  if (want('welcome')) {
    await load(p, null, false);
    await p.waitForTimeout(600);
    await shot('welcome');
  }
  await b.close();
})();
