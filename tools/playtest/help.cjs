// How to Play after build #80 (DESIGN §32), on a phone (390 x 844, dpr 2, hasTouch, isMobile; see
// touch.cjs). Opens Help from a shift's menu in one town of each region and checks it lands on that
// region's kitchen; from the Fryer counter (lands on Basics, the fryer); from the map. Every tab and
// kitchen is checked for anything wider than the card, then shot at phone size and full length.
// Frames of the looping drawings are shot paused at set points, and once with reduced motion.
// npm run build && npx vite preview --port 4176
// PORT=4176 NODE_PATH=$(npm root -g) node tools/playtest/help.cjs  ->  tools/playtest/shots-help/
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const out = process.env.OUT || path.join(__dirname, 'shots-help') + '/';
fs.mkdirSync(out, { recursive: true });
const { start, sleep } = require('./touch.cjs');
const PORT = process.env.PORT || 4175;
const fails = [];
const check = (ok, what, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail !== undefined ? ' ' + JSON.stringify(detail) : ''}`); if (!ok) fails.push(what); };

/** Which tab, kitchen and section show, and what's marked Here. */
const state = (p) => p.evaluate(() => {
  const card = document.querySelector('.menu-card.howto');
  if (!card) return null;
  const body = card.querySelector('.hw-body:not([hidden])');
  return {
    tab: card.querySelector('.hw-tabs [aria-selected="true"]')?.dataset.tab,
    kitchen: card.querySelector('.hw-kpick [aria-pressed="true"]')?.dataset.k ?? null,
    here: card.querySelector('.hw-kpick .here')?.dataset.k ?? null,
    pickShown: !card.querySelector('.hw-kpick').hidden,
    chip: body?.querySelector('.menu-chips .on')?.dataset.jump ?? null,
    eyebrow: card.querySelector('.menu-head .bv-eyebrow')?.textContent ?? null,
    scrollTop: body?.scrollTop ?? 0,
  };
});

/** Anything in the showing body wider than the card, and the page's own width. */
const overflow = (p) => p.evaluate(() => {
  const card = document.querySelector('.menu-card.howto');
  const cr = card.getBoundingClientRect();
  const body = card.querySelector('.hw-body:not([hidden])');
  const bad = new Set();
  body.querySelectorAll('*').forEach((el) => {
    if (el.closest('.menu-chips')) return; // the chip row scrolls sideways by design
    const r = el.getBoundingClientRect();
    if (r.width && (r.right > cr.right + 0.5 || r.left < cr.left - 0.5)) bad.add(`${el.tagName.toLowerCase()}.${(el.className?.baseVal ?? el.className) || ''}`);
  });
  const tabs = card.querySelector('.hw-tabs').getBoundingClientRect();
  return { bad: [...bad].slice(0, 8), body: [body.scrollWidth, body.clientWidth], doc: [document.documentElement.scrollWidth, innerWidth], card: [Math.round(cr.left), Math.round(cr.width)], tabH: Math.round(tabs.height) };
});

async function checkFit(p, what) {
  const o = await overflow(p);
  check(!o.bad.length && o.body[0] <= o.body[1] && o.doc[0] <= o.doc[1], `${what}: nothing wider than the card`, o);
}

/** The showing body at full length, in one tall shot. */
async function longShot(p, name) {
  const h = await p.evaluate(() => {
    const card = document.querySelector('.menu-card.howto');
    const body = card.querySelector('.hw-body:not([hidden])');
    return card.offsetHeight - body.clientHeight + body.scrollHeight + 80;
  });
  await p.addStyleTag({ content: '.menu-card.howto{height:auto!important;max-height:none!important}.menu-card.howto .hw-body:not([hidden]){overflow:visible!important;flex:none!important}.menu-card{animation:none!important}', }).then((h) => h.evaluate((el) => el.setAttribute('data-long', '')));
  await p.setViewportSize({ width: 390, height: Math.min(16000, h) });
  await sleep(250);
  await p.screenshot({ path: `${out}${name}.png` });
  await p.evaluate(() => document.querySelector('style[data-long]')?.remove());
  await p.setViewportSize({ width: 390, height: 844 });
  await sleep(250);
}

/** Pause every loop in `sel` at `frac` of its run and shoot it. */
async function frame(p, sel, frac, name) {
  const el = p.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  await p.evaluate(({ sel, frac }) => {
    const host = document.querySelector(sel);
    for (const a of host.getAnimations({ subtree: true })) {
      a.pause();
      a.currentTime = frac * a.effect.getTiming().duration;
    }
  }, { sel, frac });
  await sleep(60);
  await el.screenshot({ path: `${out}${name}.png` });
  await p.evaluate((sel) => document.querySelector(sel).getAnimations({ subtree: true }).forEach((a) => a.play()), sel);
}

const tabTo = async (p, tab) => { await p.tap(`.hw-tabs [data-tab="${tab}"]`); await sleep(300); };
const kitchenTo = async (p, k) => { await p.tap(`.hw-kpick [data-k="${k}"]`); await sleep(300); };
const jump = async (p, id) => { await p.tap(`.hw-body:not([hidden]) .menu-chips [data-jump="${id}"]`); await sleep(900); };

async function openFromShift(t) {
  await t.p.tap('[data-r=menuBtn]');
  await sleep(500);
  await t.p.tap('[data-m=howto]');
  await sleep(700);
}

const TOWNS = [
  ['pinecrest', 'grill'],
  ['harbor', 'press'],
  ['cactus', 'comal'],
  ['portamber', 'oven'],
];

(async () => {
  for (const [town, k] of TOWNS) {
    const t = await start(town, out);
    const p = t.p;
    await openFromShift(t);
    const s = await state(p);
    check(s && s.tab === 'kitchen' && s.kitchen === k && s.here === k && s.pickShown, `${town}: opens on the ${k}, marked Here`, s);
    check(s?.eyebrow === 'Paused', `${town}: the stacked header says Paused`, s?.eyebrow);
    await checkFit(p, `${town} ${k}`);
    await p.screenshot({ path: `${out}${town}-kitchen.png` });
    await longShot(p, `${town}-kitchen-long`);

    if (town === 'cactus') {
      await jump(p, 'tostada');
      check((await state(p)).chip === 'tostada', 'cactus: the Tostada chip lights once jumped to');
      await p.screenshot({ path: `${out}cactus-tostada.png` });
      await frame(p, '[data-sec="quesadilla"] .hwa-quesa', 0.26, 'frame-quesa-fold');
      await frame(p, '[data-sec="quesadilla"] .hwa-quesa', 0.5, 'frame-quesa-hold');
      await frame(p, '[data-sec="quesadilla"] .hwa-quesa', 0.66, 'frame-quesa-open');
      // The other kitchens stay reachable.
      for (const other of ['grill', 'press', 'oven']) {
        await kitchenTo(p, other);
        const o = await state(p);
        check(o.kitchen === other && o.scrollTop === 0, `cactus: the ${other} opens from the picker`, o);
        await checkFit(p, `cactus › ${other}`);
      }
    }
    if (town === 'harbor') {
      await frame(p, '[data-sec="counter"] .hwa-press', 0.15, 'frame-press-down');
      await frame(p, '[data-sec="counter"] .hwa-press', 0.45, 'frame-press-shut');
      await frame(p, '[data-sec="caprese"] .hwa-knife', 0.3, 'frame-knife-cut');
    }
    if (town === 'portamber') {
      for (const f of [0.18, 0.32, 0.45, 0.6]) await frame(p, '[data-sec="counter"] .hwa-peel', f, `frame-peel-${Math.round(f * 100)}`);
    }
    if (town === 'pinecrest') {
      await tabTo(p, 'basics');
      let b = await state(p);
      check(b.tab === 'basics' && !b.pickShown && b.scrollTop === 0, 'pinecrest: Basics opens at its top, no kitchen picker', b);
      await checkFit(p, 'basics');
      await p.screenshot({ path: `${out}basics.png` });
      await longShot(p, 'basics-long');
      await frame(p, '.hwa-tap', 0.34, 'frame-tap');
      await frame(p, '.hwa-drag', 0.4, 'frame-drag');
      await frame(p, '.hwa-flip', 0.44, 'frame-flip');
      await frame(p, '.hwa-undo', 0.42, 'frame-undo');
      await frame(p, '.hwa-sauce', 0.5, 'frame-sauce');
      await frame(p, '.hwa-knife.four', 0.55, 'frame-knife-four');
      for (const f of [0.2, 0.45, 0.7, 0.86]) await frame(p, '.hwm', f, `frame-meter-${Math.round(f * 100)}`);
      await jump(p, 'undo');
      await p.screenshot({ path: `${out}basics-undo.png` });
      await tabTo(p, 'trip');
      b = await state(p);
      check(b.tab === 'trip', 'pinecrest: The trip tab', b);
      await checkFit(p, 'trip');
      await p.screenshot({ path: `${out}trip.png` });
      await longShot(p, 'trip-long');
      // Reduced motion: the drawings hold their still frames.
      await tabTo(p, 'basics');
      await p.emulateMedia({ reducedMotion: 'reduce' });
      const running = await p.evaluate(() => document.querySelector('.hw-body:not([hidden])').getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length);
      check(running === 0, 'reduced motion: no loops run', running);
      await p.locator('[data-sec="hands"]').scrollIntoViewIfNeeded();
      await p.locator('[data-sec="hands"] .hw-fig').screenshot({ path: `${out}reduced-hands.png` });
      await p.locator('[data-sec="meters"] .hw-fig').screenshot({ path: `${out}reduced-meter.png` });
      await p.emulateMedia({ reducedMotion: 'no-preference' });
      // Close it, go to the fryer, open again: Basics at the fryer.
      await p.tap('.menu-card.howto [data-m="close"]');
      await sleep(400);
      await p.tap('.menu-card [data-m="resume"]').catch(() => {});
      await sleep(500);
      await p.tap('[data-r="tab"][data-page="2"]');
      await sleep(900);
      await openFromShift(t);
      const f = await state(p);
      check(f && f.tab === 'basics' && f.chip === 'fryer', 'pinecrest: from the Fryer it opens on Basics at the fryer', f);
      await p.screenshot({ path: `${out}fryer-open.png` });
    }
    await t.b.close();
  }

  // From the map (the town picked there decides the kitchen).
  {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('PAGEERR', e.message));
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForTimeout(600);
    const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor', 'redmesa', 'cactus', 'sunvalley', 'applecross', 'larkvale', 'portamber'];
    await p.evaluate((s) => { localStorage.setItem('bv-save-v1', JSON.stringify(s)); localStorage.setItem('bv-coach', JSON.stringify({ on: false, done: [] })); },
      { tutorialDone: true, town: 'larkvale', day: 30, time: 'morning', unlocked: ALL, passedTowns: ALL, shiftsIn: Object.fromEntries(ALL.map((t) => [t, 3])), bank: 300, popularity: 60, found: [], bonuses: [] });
    await p.reload();
    await p.waitForTimeout(1200);
    await p.tap('[data-home=howto]');
    await sleep(800);
    const s = await state(p);
    check(s && s.tab === 'kitchen' && s.kitchen === 'oven' && s.here === 'oven', 'map (Larkvale): opens on the oven', s);
    await checkFit(p, 'map › oven');
    await p.screenshot({ path: `${out}map-kitchen.png` });
    await tabTo(p, 'trip');
    await jump(p, 'trip');
    await p.screenshot({ path: `${out}map-trip.png` });
    await b.close();
  }

  console.log(fails.length ? `\n${fails.length} FAILED:\n- ${fails.join('\n- ')}` : '\nall ok');
  process.exit(fails.length ? 1 : 0);
})();
