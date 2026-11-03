// Checks the review #78 bugs and menus fixes (DESIGN.md §33) on the built game, at 390x844 with touch.
// PORT=4173 node tools/playtest/review78-bugs-menus.cjs [tray|tutorial|hop|range|prep|pausemenu|screens]
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.env.OUT || require('path').join(__dirname, 'out') + '/';
fs.mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:' + (process.env.PORT || 4173) + '/';
const only = process.argv[2];
const results = [];
const ok = (name, cond, info = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`); console.log(results[results.length - 1]); };

let b;
async function page(save, extra = {}) {
  const ctx = await b.newContext({ viewport: { width: extra.w || 390, height: extra.h || 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => { p.errors.push(e.message); console.log('PAGEERR', e.message); });
  await p.goto(URL);
  await p.evaluate(({ save, ls }) => {
    localStorage.clear();
    localStorage.setItem('bv-welcomed', '1');
    localStorage.setItem('bv-difficulty', 'balanced');
    for (const [k, v] of Object.entries(ls || {})) localStorage.setItem(k, v);
    if (save) localStorage.setItem('bv-save-v1', JSON.stringify({ version: 2, tutorialDone: true, ...save }));
  }, { save, ls: extra.ls });
  await p.reload();
  await p.waitForTimeout(900);
  return p;
}
const step = (p, s) => p.evaluate((s) => window.__bv.step(s), s);
const saveOf = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('bv-save-v1') || 'null'));
async function enterShift(p) {
  await p.click('[data-home=open]');
  await p.waitForTimeout(800);
  await p.click('[data-act=open]');
  await p.waitForTimeout(300);
  await p.evaluate(() => window.__bv.manual(true));
}
const pines = { town: 'pinecrest', unlocked: ['pinecrest'], day: 3, shiftsIn: { pinecrest: 1 } };

const tests = {
  // B1: something put on a free tray stays when the customer steps up
  async tray() {
    const p = await page(pines);
    await enterShift(p);
    const r = await p.evaluate(() => {
      const g = window.__bv.game;
      const free = g.slots.findIndex((s) => !s.order && !s.fig);
      g.slots[free].plate.layers.push({ piece: { uid: 99999, kind: 'bun', cook: [0, 0] }, offX: 0, offZ: 0 });
      window.__bv.spawnCustomer(free, 7);
      return { free, kinds: g.slots[free].plate.layers.map((l) => l.piece.kind), order: !!g.slots[free].order };
    });
    await step(p, 1);
    await p.screenshot({ path: OUT + 'b1-tray-kept.png' });
    ok('B1 food on a free tray kept when someone steps up', r.order && r.kinds.join() === 'bun', JSON.stringify(r));
    await p.context().close();
  },
  // B2: tutorial on then off in Settings: next shift isn't guided
  async tutorial() {
    const p = await page({ town: 'summit', unlocked: ['pinecrest', 'summit'], day: 9, shiftsIn: { pinecrest: 3 } }, { ls: { 'bv-coach': JSON.stringify({ on: false, done: [] }) } });
    await p.click('[data-home=settings]');
    await p.waitForTimeout(500);
    await p.click('[data-m=tutorial]');
    await p.waitForTimeout(150);
    const mid = await saveOf(p);
    await p.click('[data-m=tutorial]');
    await p.waitForTimeout(150);
    const after = await saveOf(p);
    await p.click('.settings [data-m=close]');
    await p.waitForTimeout(500);
    await enterShift(p);
    await step(p, 30);
    const g = await p.evaluate(() => ({ tutorial: window.__bv.game.tutorial, time: window.__bv.game.time }));
    ok('B2 tutorial on then off: not guided', mid.tutorialDone === false && after.tutorialDone === true && !g.tutorial && g.time > 20, JSON.stringify({ mid: mid.tutorialDone, after: after.tutorialDone, ...g }));
    await p.context().close();
    // B3: replay outside a grill town is a normal shift
    const q = await page({ town: 'redmesa', unlocked: ['pinecrest', 'redmesa'], day: 20, shiftsIn: { pinecrest: 3 } }, { ls: { 'bv-coach': JSON.stringify({ on: false, done: [] }) } });
    await q.click('[data-home=settings]');
    await q.waitForTimeout(500);
    await q.click('[data-m=tutorial]');
    await q.click('.settings [data-m=close]');
    await q.waitForTimeout(500);
    await enterShift(q);
    await step(q, 20);
    const g2 = await q.evaluate(() => ({ tutorial: window.__bv.game.tutorial, time: window.__bv.game.time }));
    ok('B3 replayed tutorial in Red Mesa runs a normal shift', !g2.tutorial && g2.time > 15, JSON.stringify(g2));
    await q.context().close();
  },
  // B4: evening hop keeps Results; B16 Results only with a shift
  async hop() {
    const p = await page({ town: 'pinecrest', unlocked: ['pinecrest', 'elkpass', 'cedarfalls'], day: 4, shiftsIn: { pinecrest: 3 } });
    await enterShift(p);
    await p.evaluate(() => { const g = window.__bv.game; g.customers = 0; g.stars.push(5, 4); g.served = 2; });
    await step(p, 400);
    await p.evaluate(() => window.__bv.manual(false));
    await p.waitForTimeout(4500);
    // hide the results sheet if it's up
    if (await p.$('[data-home=results-close]:visible')) await p.click('[data-home=results-close]');
    await p.waitForTimeout(400);
    const s0 = await saveOf(p);
    // hop to a neighbour within range
    const target = await p.evaluate(() => {
      const el = [...document.querySelectorAll('[data-town]')].map((e) => e.dataset.town).filter((t) => t !== 'pinecrest');
      return el;
    });
    let hopped = null;
    for (const t of ['cedarfalls', 'elkpass']) {
      const box = await (await p.$(`[data-town="${t}"]`))?.boundingBox();
      if (!box) continue;
      await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await p.waitForTimeout(500);
      const btn = await p.$('[data-home=drive]:not([disabled])');
      if (btn && (await btn.textContent()).includes('tonight')) { await btn.click(); hopped = t; break; }
    }
    await p.waitForTimeout(2500);
    const s1 = await saveOf(p);
    const res = await p.$('.home-stats [data-home=results]');
    const disabled = res ? await res.isDisabled() : 'missing';
    await p.screenshot({ path: OUT + 'b4-evening-hop-results.png' });
    ok('B4 Results still there after an evening hop', hopped && s1.town === hopped && s1.last && disabled === false, JSON.stringify({ hopped, town: s1.town, last: !!s1.last, disabled, towns: target.length }));
    await p.reload();
    await p.waitForTimeout(900);
    const s2 = await saveOf(p);
    const res2 = await p.$('.home-stats [data-home=results]');
    ok('B4 ... and after a reload', !!(s2.last && res2), JSON.stringify({ last: !!s2.last }));
    await p.click('.home-dock [data-home=sleep]');
    await p.waitForTimeout(1600);
    const night = await p.evaluate(() => document.querySelector('.home-night')?.textContent || '');
    await p.screenshot({ path: OUT + 'b4-night-after-hop.png' });
    ok('B4 night card shows today, not "A day on the road"', !night.includes('A day on the road'), night.replace(/\s+/g, ' ').slice(0, 140));
    await p.context().close();
  },
  // B5: quit after open keeps the morning's driving
  async range() {
    const p = await page({ ...pines, driven: 60 });
    await enterShift(p);
    await step(p, 5);
    await p.click('[data-r=menuBtn]');
    await p.waitForTimeout(400);
    await p.screenshot({ path: OUT + 'm7-pause-card.png' });
    await p.click('.pause-foot [data-m=quit]');
    await p.click('[data-m=quit-yes]');
    await p.waitForTimeout(700);
    const s = await saveOf(p);
    ok('B5 quit after open keeps driven', s.driven === 60, `driven=${s.driven}`);
    await p.context().close();
  },
  // B6 prep note, B7 closing walkouts, B8 no 0.0 best
  async prep() {
    const p = await page(pines);
    await p.click('[data-home=open]');
    await p.waitForTimeout(800);
    const rows = await p.$$('.prep-row');
    // hide down to the minimum, then try once more
    for (let i = 0; i < rows.length; i++) { await p.click(`.prep-row >> nth=${i}`, { timeout: 5000, force: true }); await p.waitForTimeout(250); }
    const shown = await p.evaluate(() => !document.querySelector('.prep-min')?.hidden);
    await p.evaluate(() => document.querySelector('.prep-min')?.scrollIntoView({ block: 'center' }));
    await p.screenshot({ path: OUT + 'b6-prep-min.png' });
    ok('B6 prep says keep two recipes', shown);
    await p.click('[data-act=open]');
    await p.waitForTimeout(300);
    await p.evaluate(() => window.__bv.manual(true));
    await p.evaluate(() => { const g = window.__bv.game; g.customers = 0; g.lost = 4; });
    await step(p, 400);
    await p.evaluate(() => window.__bv.manual(false));
    await p.waitForTimeout(4500);
    const verdict = await p.evaluate(() => document.querySelector('.home-res-verdict')?.textContent || '');
    await p.screenshot({ path: OUT + 'b7-results-walkouts.png' });
    ok('B7 verdict when all walked out', verdict.includes('walked out'), verdict);
    const s = await saveOf(p);
    ok('B8 no 0.0 best', s.best.pinecrest === undefined, JSON.stringify(s.best));
    if (await p.$('.home-res-foot [data-home=results]')) {
      await p.click('.home-res-foot [data-home=results]');
      await p.waitForTimeout(700);
      await p.screenshot({ path: OUT + 'm14-closing.png' });
    }
    await p.context().close();
  },
  // M4 pause Today's menu outside the Pines
  async pausemenu() {
    for (const [town, needle] of [['redmesa', 'Corn tortilla ×3'], ['sunvalley', 'Quesadilla'], ['portamber', 'Mushroom'], ['saltwater', 'Avocado']]) {
      const p = await page({ town, unlocked: ['pinecrest', town], day: 20, shiftsIn: { pinecrest: 3 } });
      await enterShift(p);
      await step(p, 3);
      await p.click('[data-r=menuBtn]');
      await p.waitForTimeout(400);
      const txt = await p.evaluate(() => document.querySelector('.pause-menu')?.textContent.replace(/\s+/g, ' ') || '');
      await p.evaluate(() => document.querySelector('.pause-menu')?.scrollIntoView());
      await p.screenshot({ path: OUT + `m4-pause-menu-${town}.png` });
      const empty = await p.evaluate(() => [...document.querySelectorAll('.pause-dish small')].filter((s) => !s.textContent.trim()).length);
      ok(`M4 pause menu ${town}`, txt.includes(needle) && empty === 0 && !/toasted/.test(txt), txt.slice(0, 220));
      await p.context().close();
    }
  },
  // Screens: settings, help from pause, garage, reviews, town sheet, welcome, small map
  async screens() {
    const p = await page({ ...pines, bank: 500 });
    await p.screenshot({ path: OUT + 'b11-map-390.png' });
    await p.click('[data-home=settings]');
    await p.waitForTimeout(500);
    await p.screenshot({ path: OUT + 'm16-settings.png' });
    const devHidden = await p.evaluate(() => document.querySelector('.menu-devgroup')?.hidden);
    for (let i = 0; i < 5; i++) await p.click('.menu-build');
    const devShown = await p.evaluate(() => !document.querySelector('.menu-devgroup')?.hidden);
    ok('M16 dev mode behind five taps on the build line', devHidden === true && devShown, '');
    await p.click('[data-m=newtrip]');
    await p.waitForTimeout(300);
    await p.screenshot({ path: OUT + 'm10-newtrip-confirm.png' });
    await p.click('.settings [data-m=close]');
    await p.waitForTimeout(500);
    await p.click('[data-home=garage]');
    await p.waitForTimeout(700);
    await p.screenshot({ path: OUT + 'm8-garage.png' });
    await p.click('[data-act=back]');
    await p.waitForTimeout(500);
    await p.click('[data-home=reviews] >> nth=0');
    await p.waitForTimeout(700);
    await p.screenshot({ path: OUT + 'm8-reviews.png' });
    await p.click('[data-act=back]');
    await p.waitForTimeout(500);
    { const bx = await (await p.$('[data-town="pinecrest"]')).boundingBox(); await p.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2); }
    await p.waitForTimeout(600);
    await p.screenshot({ path: OUT + 'm8-town-sheet.png' });
    await p.context().close();
    // pause help at the current counter
    const q = await page({ town: 'redmesa', unlocked: ['pinecrest', 'redmesa'], day: 20, shiftsIn: { pinecrest: 3 } });
    await q.click('[data-home=menuref]');
    await q.waitForTimeout(600);
    await q.evaluate(() => document.querySelector('[data-sec=extras]')?.scrollIntoView());
    await q.screenshot({ path: OUT + 'm13-menu-extras-redmesa.png' });
    await q.evaluate(() => document.querySelector('[data-sec=burgers]')?.scrollIntoView());
    await q.screenshot({ path: OUT + 'm12-menu-tacos.png' });
    await q.keyboard.press('Escape');
    await q.waitForTimeout(400);
    await enterShift(q);
    await step(q, 2);
    await q.click('[data-r=menuBtn]');
    await q.waitForTimeout(400);
    const label = await q.textContent('.pause-help');
    await q.click('.pause-help');
    await q.waitForTimeout(600);
    const tab = await q.evaluate(() => [document.querySelector('.hw-tabs [aria-selected=true]')?.textContent, document.querySelector('.hw-kpick [aria-pressed=true]')?.dataset.k]);
    await q.screenshot({ path: OUT + 'm7-help-from-pause.png' });
    ok('M7 pause opens Help at the comal', /Comal/.test(label) && tab[1] === 'comal', `${label} ${tab}`);
    await q.context().close();
    // welcome card
    const w = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const wp = await w.newPage();
    await wp.goto(URL);
    await wp.evaluate(() => localStorage.clear());
    await wp.reload();
    await wp.waitForTimeout(1000);
    await wp.screenshot({ path: OUT + 'm16-welcome.png' });
    await w.close();
    // 320 wide map
    const s = await page(pines, { w: 320, h: 568 });
    await s.screenshot({ path: OUT + 'b11-map-320.png' });
    const clip = await s.evaluate(() => { const b = document.querySelector('[data-home=open]'); return b ? b.scrollWidth <= b.clientWidth + 1 : 'none'; });
    ok('B11 Prep & Open fits at 320', clip === true, String(clip));
    await s.context().close();
  },
};

(async () => {
  b = await chromium.launch();
  for (const [k, f] of Object.entries(tests)) {
    if (only && only !== k) continue;
    try { await f(); } catch (e) { ok(k, false, 'threw ' + e.message.split('\n')[0]); }
  }
  await b.close();
  console.log('\n' + results.join('\n'));
})();
