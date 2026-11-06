// Saves, Android readiness, sound and access (DESIGN §52). Prints PASS/FAIL per check; screenshots to OUT.
// PORT=4185 [OUT=dir/] node tools/playtest/platform52.cjs [fonts,gfx,settings,code,native,large,hand,glyphs,ambience,stepdown,log,storage]
const { chromium } = require('playwright');
const { out } = require('./lib.cjs');
const PORT = process.env.PORT || 4173;
const URL = `http://localhost:${PORT}/`;
const only = (process.argv[2] || '').split(',').filter(Boolean);
const want = (n) => !only.length || only.includes(n);
let fails = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) fails++; };

const TOWNS = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater'];
const base = { town: 'saltwater', day: 5, time: 'morning', popularity: 43, bank: 135, tutorialDone: true, unlocked: TOWNS, shiftsIn: { pinecrest: 3, saltwater: 1 } };

async function page(b, { w = 390, h = 844, init } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { console.log('PAGEERR', e.message); fails++; });
  if (init) await p.addInitScript(init);
  const reqs = [];
  p.on('request', (r) => reqs.push(r.url()));
  await p.goto(URL);
  await p.waitForTimeout(500);
  return { p, ctx, reqs };
}
async function load(p, save, extra = {}) {
  await p.evaluate(({ s, extra }) => {
    localStorage.clear();
    if (s) localStorage.setItem('bv-save-v1', JSON.stringify(s));
    localStorage.setItem('bv-coach', JSON.stringify({ on: false, done: [] }));
    localStorage.setItem('bv-welcomed', '1');
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
  }, { s: save, extra });
  await p.reload();
  await p.waitForTimeout(1300);
}
const shot = (p, n, clip) => p.screenshot({ path: `${out}p52-${n}.png`, clip });
const tap = (p, sel) => p.tap(sel);
async function settings(p) { await tap(p, '[data-home=settings]'); await p.waitForTimeout(600); }
async function enterShift(p) {
  await tap(p, '[data-home=open]'); await p.waitForTimeout(800);
  if (await p.$('[data-act=open]')) await tap(p, '[data-act=open]');
  await p.waitForTimeout(600);
}
async function endShift(p) {
  await p.evaluate(() => { const g = window.__bv.game; g.stars.push(5, 4, 4); g.served = 3; g.money += 30; g.customers = g.spawned; g.line.length = 0; g.time = g.shiftLength + 7; });
  for (let i = 0; i < 40 && (await p.evaluate(() => window.__bv.game.phase)) !== 'summary'; i++) await p.waitForTimeout(250);
  await p.waitForTimeout(1500);
}

(async () => {
  const b = await chromium.launch();

  if (want('fonts')) {
    const { p, ctx, reqs } = await page(b);
    await load(p, base);
    await p.evaluate(() => document.fonts.ready);
    const fam = await p.evaluate(() => ['Young Serif', 'Hanken Grotesk', 'DM Mono'].map((f) => [f, document.fonts.check(`600 14px "${f}"`)]));
    check('fonts: no request to Google Fonts', !reqs.some((u) => /fonts\.(googleapis|gstatic)/.test(u)));
    check('fonts: woff2 served from the bundle', reqs.some((u) => u.startsWith(URL) && u.endsWith('.woff2')));
    check('fonts: all three families load', fam.every(([, ok]) => ok), JSON.stringify(fam));
    await ctx.close();
  }

  if (want('gfx')) {
    const { p, ctx } = await page(b);
    await load(p, base);
    await settings(p);
    const cur = await p.$eval('[data-m=gfx][aria-pressed=true]', (e) => e.dataset.v);
    check('gfx: a new install starts on Standard', cur === 'standard', cur);
    const aa = await p.evaluate(() => document.getElementById('gl').getContext('webgl2')?.getContextAttributes()?.antialias ?? document.getElementById('gl').getContext('webgl')?.getContextAttributes()?.antialias);
    await load(p, base, { 'bv-gfx': 'low' });
    const aaLow = await p.evaluate(() => (document.getElementById('gl').getContext('webgl2') || document.getElementById('gl').getContext('webgl')).getContextAttributes().antialias);
    check('gfx: MSAA on above Low, off on Low', aa === true && aaLow === false, `std=${aa} low=${aaLow}`);
    await ctx.close();
  }

  if (want('settings')) {
    for (const w of [390, 320]) {
      const { p, ctx } = await page(b, { w, h: w === 320 ? 640 : 844 });
      await load(p, base);
      await settings(p);
      const labels = await p.$$eval('.settings .lbl, .settings .main b', (els) => els.map((e) => e.textContent.trim()));
      const has = (s) => labels.some((l) => l.startsWith(s));
      check(`settings ${w}: Effects, Ambience, Text size, Hand, Copy and Paste save code`, ['Effects', 'Ambience', 'Text size', 'Hand', 'Copy save code', 'Paste save code'].every(has));
      const over = await p.evaluate(() => { const c = document.querySelector('.settings .menu-body'); return c.scrollWidth - c.clientWidth; });
      check(`settings ${w}: no sideways scroll`, over <= 0, String(over));
      await shot(p, `settings-${w}`);
      await p.evaluate(() => { const s = document.querySelector('.settings .menu-scroll'); s.scrollTop = 420; });
      await p.waitForTimeout(200);
      await shot(p, `settings-${w}-b`);
      await ctx.close();
    }
  }

  if (want('code')) {
    const { p, ctx } = await page(b);
    await p.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL });
    await load(p, { ...base, day: 9, bank: 777 });
    await settings(p);
    await tap(p, '[data-m=code-copy]');
    await p.waitForTimeout(400);
    const code = await p.$eval('[data-sc=text]', (e) => e.value);
    const msg = await p.$eval('[data-sc=msg]', (e) => e.textContent);
    check('code: copy shows a BV code', /^BV2\.[A-Za-z0-9+/=]+\.[0-9a-f]{8}$/.test(code), code.slice(0, 24) + '…');
    check('code: copy says it copied', /Copied|Select/.test(msg), msg);
    await shot(p, 'code-copy');
    await tap(p, '[data-m=code-done]');
    await p.click('.settings [data-m=close]');
    // Another trip on this phone; paste the first one back.
    await load(p, { ...base, town: 'pinecrest', day: 2, bank: 5 });
    await settings(p);
    await tap(p, '[data-m=code-paste]');
    await p.fill('[data-sc=text]', 'not a code');
    await tap(p, '[data-m=code-check]');
    const bad = await p.$eval('[data-sc=msg]', (e) => e.textContent);
    check('code: a wrong code is refused', /isn't a Bun Voyage save code/.test(bad), bad);
    const cut = code.slice(0, 30) + code.slice(32);
    await p.fill('[data-sc=text]', cut);
    await tap(p, '[data-m=code-check]');
    const bad2 = await p.$eval('[data-sc=msg]', (e) => e.textContent);
    check('code: a code missing characters is refused', /missing/.test(bad2), bad2);
    await p.fill('[data-sc=text]', `  ${code.slice(0, 40)}\n${code.slice(40)}  `);
    await tap(p, '[data-m=code-check]');
    const sum = await p.$eval('[data-sc=msg]', (e) => e.textContent);
    check('code: a good code says what it holds', /Day 9 in Saltwater Bay, 5 towns open, \$777 saved/.test(sum), sum);
    await shot(p, 'code-confirm');
    const still = await p.evaluate(() => JSON.parse(localStorage.getItem('bv-save-v1') || 'null')?.day ?? 'fresh');
    check('code: nothing loads before the confirm', still !== 9, String(still));
    await tap(p, '[data-m=code-load]');
    await p.waitForTimeout(900);
    const now = await p.evaluate(() => JSON.parse(localStorage.getItem('bv-save-v1')));
    check('code: Load this trip replaces the save', now.day === 9 && now.bank === 777 && now.town === 'saltwater', `day ${now.day} bank ${now.bank} ${now.town}`);
    check('code: Settings closed onto the map', !(await p.$('.settings')) && !!(await p.$('[data-home=open]')));
    await shot(p, 'code-loaded');
    // Paste isn't offered in a shift.
    await enterShift(p);
    await p.evaluate(() => { window.__bv.game.phase = 'paused'; window.__bv.openSettings?.(); });
    await ctx.close();
  }

  if (want('native')) {
    const { p, ctx } = await page(b, { init: () => { window.Capacitor = { isNativePlatform: () => true }; } });
    await load(p, base);
    await settings(p);
    check('native: no Check for updates under Capacitor', !(await p.$('.settings [data-m=update]')));
    await p.click('.settings [data-m=close]');
    const sw = await p.evaluate(() => navigator.serviceWorker?.getRegistrations?.().then((r) => r.length) ?? 0);
    check('native: no service worker under Capacitor', sw === 0, String(sw));
    await ctx.close();
    const web = await page(b);
    await load(web.p, base);
    await settings(web.p);
    check('native: the web keeps Check for updates', !!(await web.p.$('.settings [data-m=update]')));
    await web.ctx.close();
  }

  if (want('large')) {
    for (const w of [390, 320]) {
      const { p, ctx } = await page(b, { w, h: w === 320 ? 640 : 844 });
      await load(p, { ...base, town: 'pinecrest' }, { 'bv-text': 'large' });
      const root = await p.evaluate(() => getComputedStyle(document.documentElement).fontSize);
      check(`large ${w}: root is 115%`, root === '18.4px', root);
      await shot(p, `large-map-${w}`);
      await enterShift(p);
      await p.evaluate(() => window.__bv.manual(true));
      await p.evaluate(() => window.__bv.step(9));
      await p.waitForTimeout(300);
      const tk = await p.evaluate(() => { const t = [...document.querySelectorAll('.ticket:not([hidden])')][0]; return t ? { fs: getComputedStyle(t.querySelector('*') || t).fontSize, over: t.scrollWidth - t.clientWidth } : null; });
      await shot(p, `large-kitchen-${w}`);
      check(`large ${w}: a ticket is up`, !!tk, JSON.stringify(tk));
      await ctx.close();
    }
    // Normal vs large, same ticket text.
    const sizes = {};
    for (const t of ['normal', 'large']) {
      const { p, ctx } = await page(b);
      await load(p, { ...base, town: 'pinecrest' }, { 'bv-text': t });
      await enterShift(p);
      await p.evaluate(() => window.__bv.manual(true));
      await p.evaluate(() => window.__bv.step(9));
      sizes[t] = await p.evaluate(() => {
        const t = document.querySelector('.ticket:not([hidden])');
        const el = t && [...t.querySelectorAll('*')].find((e) => e.childElementCount === 0 && e.textContent.trim());
        const hint = document.querySelector('.hint');
        return { ticket: el ? parseFloat(getComputedStyle(el).fontSize) : 0, hint: parseFloat(getComputedStyle(hint).fontSize) };
      });
      await ctx.close();
    }
    check('large: tickets grow', sizes.large.ticket > sizes.normal.ticket * 1.1, JSON.stringify(sizes));
    check('large: tips grow', sizes.large.hint > sizes.normal.hint * 1.1);
  }

  if (want('hand')) {
    const { p, ctx } = await page(b);
    await load(p, { ...base, town: 'pinecrest' }, { 'bv-hand': 'left' });
    await enterShift(p);
    await p.evaluate(() => window.__bv.manual(true));
    await p.evaluate(() => window.__bv.step(3));
    const pos = await p.evaluate(() => ({ undo: document.querySelector('.undo-btn').getBoundingClientRect().x, pause: document.querySelector('[aria-label=Pause]').getBoundingClientRect().x }));
    check('hand: left puts Pause left of Undo', pos.pause < pos.undo, JSON.stringify(pos));
    await shot(p, 'hand-left', { x: 0, y: 0, width: 390, height: 120 });
    await ctx.close();
  }

  if (want('glyphs')) {
    const { p, ctx } = await page(b);
    await load(p, { ...base, town: 'pinecrest' });
    await enterShift(p);
    await p.evaluate(() => window.__bv.manual(true));
    await p.evaluate(() => window.__bv.step(3));
    await p.evaluate(() => {
      const bs = [...document.querySelectorAll('.cbtn')];
      bs.forEach((b) => { b.style.animation = 'none'; });
      // Hold the lamps (the game would set them back next frame, but the loop is frozen).
      if (bs[0]) bs[0].dataset.lamp = 'coral';
      if (bs[2]) bs[2].dataset.lamp = 'amber';
      const tag = document.createElement('div');
      tag.className = 'gtag pt';
      tag.style.cssText = 'left:195px;top:600px';
      tag.innerHTML = '<span class="hbar fresh"><i style="width:80%"></i></span><span class="hbar drying"><i style="width:45%"></i></span><span class="hbar dry"><i style="width:15%"></i></span>';
      document.getElementById('ui').appendChild(tag);
    });
    await p.waitForTimeout(100);
    const glyph = await p.evaluate(() => getComputedStyle(document.querySelector('.cbtn[data-lamp=coral]'), '::before').content);
    check('glyphs: the coral lamp carries a "!"', glyph === '"!"', glyph);
    const stripe = await p.evaluate(() => getComputedStyle(document.querySelector('.hbar.dry > i')).backgroundImage);
    check('glyphs: a red hold bar is striped', /repeating-linear-gradient/.test(stripe));
    await shot(p, 'glyphs');
    await ctx.close();
  }

  if (want('ambience')) {
    const { p, ctx } = await page(b);
    await load(p, { ...base, town: 'saltwater' });
    await p.tap('canvas#gl').catch(() => {});
    await p.mouse.click(10, 300);
    await p.waitForTimeout(2500);
    const a = await p.evaluate(() => { const am = window.__bv.ambience; return { region: am.region, level: am.level, beds: [...am.beds.keys()], on: am.on, state: am.ctx?.state }; });
    check('ambience: the coast bed plays on the map', a.region === 'coast' && a.level === 1 && a.beds.includes('coast'), JSON.stringify(a));
    await enterShift(p);
    await p.waitForTimeout(800);
    const k = await p.evaluate(() => window.__bv.ambience.level);
    check('ambience: quieter under the kitchen', k > 0 && k < 1, String(k));
    await p.evaluate(() => { window.__bv.game.phase = 'paused'; });
    await p.waitForTimeout(300);
    await p.evaluate(() => { window.__bv.game.phase = 'playing'; });
    await ctx.close();
    const off = await page(b);
    await load(off.p, base, { 'bv-ambience': '0' });
    await settings(off.p);
    const st = await off.p.$eval('[data-m=ambience]', (e) => e.getAttribute('aria-checked'));
    check('ambience: its switch remembers Off', st === 'false', st);
    await off.p.tap('[data-m=ambience]');
    const st2 = await off.p.evaluate(() => [localStorage.getItem('bv-ambience'), window.__bv.ambience.on]);
    check('ambience: switching it on sticks', st2[0] === '1' && st2[1] === true, JSON.stringify(st2));
    const fx = await off.p.evaluate(() => localStorage.getItem('bv-muted'));
    check('ambience: Effects stay as they were', fx !== '1');
    await off.ctx.close();
  }

  if (want('stepdown')) {
    // Slow every frame by ~40 ms (a heavy phone) and play a shift past the warm-up.
    const slow = () => {
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); while (performance.now() - s < 40); cb(t); });
    };
    const { p, ctx } = await page(b, { init: slow });
    await load(p, { ...base, town: 'pinecrest' }, { 'bv-test-auto': '1' });
    await enterShift(p);
    for (let i = 0; i < 10; i++) { await p.waitForTimeout(1500); const w = await p.evaluate(() => ({ ...window.__bv.frameWatch, phase: window.__bv.game.phase })); if (process.env.DEBUG) console.log(JSON.stringify(w)); if (w.done) break; }
    const r = await p.evaluate(() => ({ gfx: localStorage.getItem('bv-gfx'), auto: localStorage.getItem('bv-gfx-auto'), toast: document.querySelector('.bv-toast.on')?.textContent ?? null }));
    check('stepdown: slow frames drop Standard to Low once', r.gfx === 'low' && r.auto === '1', JSON.stringify(r));
    check('stepdown: with a toast', /Graphics set to Low/.test(r.toast || ''), r.toast || '');
    await shot(p, 'stepdown');
    await ctx.close();
    // Not in the guided first shift.
    const g = await page(b, { init: slow });
    await g.p.evaluate(() => { localStorage.clear(); localStorage.setItem('bv-test-auto', '1'); });
    await g.p.reload();
    await g.p.waitForTimeout(1200);
    const guided = await g.p.evaluate(() => { window.__bv.startShift(); return window.__bv.game.tutorial; });
    await g.p.waitForTimeout(9000);
    const gr = await g.p.evaluate(() => localStorage.getItem('bv-gfx'));
    check('stepdown: never in the guided first shift', guided === true && gr === null, `tutorial=${guided} gfx=${gr}`);
    await g.ctx.close();
  }

  if (want('storage')) {
    // A private window: a small quota and no lasting storage. One toast after the first shift, never again.
    const priv = () => {
      const s = navigator.storage;
      s.estimate = async () => ({ quota: 60 * 1024 * 1024, usage: 0 });
      s.persist = async () => false;
      s.persisted = async () => false;
    };
    const { p, ctx } = await page(b, { init: priv });
    await load(p, { ...base, town: 'pinecrest' }, { 'bv-test-auto': '1' });
    await enterShift(p);
    await endShift(p);
    const t1 = await p.evaluate(() => document.querySelector('.bv-toast.on')?.textContent ?? null);
    check('storage: a private window gets one note after the shift', /may not keep your trip/.test(t1 || ''), t1 || 'none');
    await shot(p, 'storage-toast');
    // Next morning (a reload keeps the device's flags).
    await p.evaluate((s) => localStorage.setItem('bv-save-v1', JSON.stringify(s)), { ...base, town: 'pinecrest', day: 6 });
    await p.reload();
    await p.waitForTimeout(1300);
    await enterShift(p);
    await endShift(p);
    const t2 = await p.evaluate(() => document.querySelector('.bv-toast.on')?.textContent ?? null);
    check('storage: and not again', !t2, t2 || 'none');
    await ctx.close();
  }

  if (want('log') || want('storage')) {
    const { p, ctx } = await page(b);
    await load(p, { ...base, town: 'pinecrest' }, { 'bv-dev': '1', 'bv-test-auto': '1' });
    await enterShift(p);
    await endShift(p);
    const log = await p.evaluate(() => JSON.parse(localStorage.getItem('bv-shiftlog') || '[]'));
    check('log: the shift was logged', log.length === 1 && log[0].town === 'pinecrest' && log[0].served === 3, JSON.stringify(log[0]));
    const toast = await p.evaluate(() => document.querySelector('.bv-toast.on')?.textContent ?? null);
    const quota = await p.evaluate(() => navigator.storage.estimate().then((e) => e.quota));
    if (want('storage')) {
      // A fresh Playwright context has a small quota, like a private window: the warning shows once.
      check('storage: a one-time note when storage may not last', quota < 130 * 1024 * 1024 ? /may not keep your trip/.test(toast || '') : !toast, `quota ${(quota / 1048576).toFixed(0)} MB, toast ${toast}`);
      await shot(p, 'storage-toast');
    }
    if (await p.$('.report-card [data-rep=continue]')) await tap(p, '.report-card [data-rep=continue]');
    await p.waitForTimeout(700);
    await settings(p);
    await p.evaluate(() => { const s = document.querySelector('.settings .menu-scroll'); s.scrollTop = s.scrollHeight; });
    await p.waitForTimeout(200);
    const rows = await p.$$eval('.sl-table tbody tr', (r) => r.length);
    check('log: Settings shows it with dev mode on', rows === 1, String(rows));
    await shot(p, 'shift-log');
    await ctx.close();
  }

  await b.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();
