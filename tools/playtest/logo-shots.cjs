// Screenshots the logo work (DESIGN §44): the map header at 390 and 320 px (with and without the
// Trip eyebrow), the lockup family on slate and cream, and the splash: loading (the main script held
// back), the lift at fixed times, and the map after it.
//   PORT=4175 [OUT=dir/] node tools/playtest/logo-shots.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 4173;
const OUT = process.env.OUT || path.join(__dirname, 'out') + '/';
fs.mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:' + PORT + '/';
const SAVE = (trips) => JSON.stringify({ stop: 1, tutorialDone: true, ratingCount: 14, ratingSum: 31, popularity: 34, bonuses: ['bench', 'tipjar'], bonus: 'tipjar', day: 7, trips });

async function page(b, w, save) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.goto(URL);
  await p.evaluate((s) => localStorage.setItem('bv-save-v1', s), save);
  return p;
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

  // The header, after the splash has gone.
  for (const [w, trips, tag] of [[390, 0, '390'], [390, 2, '390-trip'], [320, 0, '320'], [320, 2, '320-trip'], [360, 2, '360-trip']]) {
    const p = await page(b, w, SAVE(trips));
    await p.reload();
    await p.waitForSelector('#splash', { state: 'detached', timeout: 20000 });
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const box = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => +v.toFixed(1)); };
      return { logo: box('.home-logo .bv-logo'), top: box('.home-top'), eyebrow: box('.home-brand .bv-eyebrow'), actions: box('.home-actions') };
    });
    console.log('header', tag, JSON.stringify(r));
    await p.screenshot({ path: `${OUT}header-${tag}.png`, clip: { x: 0, y: 0, width: w, height: 150 } });
    if (tag === '390') await p.screenshot({ path: `${OUT}map-390.png` });
    await p.context().close();
  }

  // The lockup family, from the generated files, on slate and on cream.
  {
    const p = await (await b.newContext({ viewport: { width: 390, height: 420 }, deviceScaleFactor: 2 })).newPage();
    const pub = path.join(__dirname, '..', '..', 'public');
    const img = (f, h) => `<img src="data:image/svg+xml;base64,${fs.readFileSync(path.join(pub, f)).toString('base64')}" style="height:${h}px;display:block">`;
    const tile = (bg, f, h) => `<div style="background:${bg};border-radius:12px;padding:16px;display:grid;place-items:center">${img(f, h)}</div>`;
    await p.setContent(`<body style="margin:0;padding:16px;background:#efe9dd;display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${tile('#2a3340', 'logo-lockup.svg', 36)}${tile('#f6f2ea', 'logo-lockup-paper.svg', 36)}
      ${tile('#2a3340', 'logo-line.svg', 18)}${tile('#f6f2ea', 'logo-line-paper.svg', 18)}
      ${tile('#2a3340', 'logo-line.svg', 13)}${tile('#f6f2ea', 'logo-line-paper.svg', 13)}
      ${tile('#2a3340', 'logo.svg', 40)}${tile('#f6f2ea', 'logo-ink.svg', 40)}</body>`);
    await p.waitForTimeout(200);
    await p.screenshot({ path: `${OUT}lockups.png`, fullPage: true });
    await p.context().close();
  }

  // The splash: hold the main script back to see the loading frames, then step the lift.
  {
    const p = await page(b, 390, SAVE(0));
    let release;
    const held = new Promise((r) => (release = r));
    await p.route(/assets\/main-.*\.js$/, async (route) => { await held; await route.continue(); });
    const t0 = Date.now();
    p.goto(URL, { waitUntil: 'commit' }).catch(() => {});
    for (const t of [150, 1500, 4000]) {
      const w = t - (Date.now() - t0);
      if (w > 0) await p.waitForTimeout(w);
      await p.screenshot({ path: `${OUT}splash-load-${t}.png` });
    }
    release();
    await p.waitForFunction(() => window.__bvSplash, null, { timeout: 30000 });
    await p.evaluate(() => window.__bvSplash.forEach((a) => a.pause()));
    for (const t of [0, 200, 340, 480, 600]) {
      await p.evaluate((t) => window.__bvSplash.forEach((a) => { a.currentTime = Math.min(t, a.effect.getTiming().duration); }), t);
      await p.waitForTimeout(80);
      await p.screenshot({ path: `${OUT}splash-lift-${t}.png` });
    }
    await p.evaluate(() => window.__bvSplash.forEach((a) => a.play()));
    await p.waitForTimeout(160);
    await p.screenshot({ path: `${OUT}splash-fade.png` });
    await p.waitForSelector('#splash', { state: 'detached', timeout: 3000 });
    await p.screenshot({ path: `${OUT}splash-after.png` });
    // How long the hand-off takes from ready to gone, unpaused.
    await p.evaluate((s) => { localStorage.setItem('bv-save-v1', s); }, SAVE(0));
    await p.unroute(/assets\/main-.*\.js$/);
    await p.reload({ waitUntil: 'commit' });
    const ms = await p.evaluate(() => new Promise((res) => {
      const iv = setInterval(() => {
        if (window.__bvSplash && !window.__t0) window.__t0 = performance.now();
        if (window.__t0 && !document.getElementById('splash')) { clearInterval(iv); res(Math.round(performance.now() - window.__t0)); }
      }, 10);
    }));
    console.log('splash hand-off ms', ms);
    await p.context().close();
  }

  // Reduced motion: no lift, only the fade.
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.waitForSelector('#splash', { state: 'detached', timeout: 20000 });
    console.log('reduced motion: splash gone, lift', await p.evaluate(() => !!window.__bvSplash));
    await ctx.close();
  }
  await b.close();
})();
