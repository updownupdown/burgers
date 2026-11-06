// The guided first order at the press, the comal and the oven (DESIGN §48), played by doing only
// what the coach's thumb shows (window.__bv.coach()), as tutorial-bot.cjs does for the grill.
// For each kitchen: a prepared save arriving in that region's first town (Saltwater Bay, Red Mesa,
// Applecross) with the grill's lessons already learned and tutorial mode on, Prep & Open, then
// follow the thumb until the guided order is served. Touch only (CDP touch events, 390 x 844),
// the game clock running in real time. Checks: the guided dish came, the clock held until it was
// served, it was served, the lesson is stored as learned, and the next shift there isn't guided.
//
// npm run build && npx vite preview --port 4181
// PORT=4181 [KITCHEN=press|comal|oven] [OUT=dir/] [NOSHOT=1] node tools/playtest/kitchen-coach-bot.cjs
const path = require('path');
const { chromium } = require('playwright');
const out = process.env.OUT || path.join(__dirname, 'out') + '/';
require('fs').mkdirSync(out, { recursive: true });
const PORT = process.env.PORT || 4181;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PINES = ['pinecrest', 'elkpass', 'cedarfalls', 'summit'];
const COAST = ['saltwater', 'gullpoint', 'driftwood', 'harbor'];
const ROCK = ['redmesa', 'cactus', 'sunvalley'];
const KITCHENS = {
  press: { town: 'saltwater', before: PINES, dish: 'Caprese' },
  comal: { town: 'redmesa', before: [...PINES, ...COAST], dish: 'Street Tacos' },
  oven: { town: 'applecross', before: [...PINES, ...COAST, ...ROCK], dish: 'Harvest Red' },
};
// The grill's lessons and the map's, as a player who has done them would have them.
const LEARNED = ['map-open', 'prep-open', 'closing', 'evening-sleep', 'map-pips', 'town-drive', 'town-tap', 'garage', 'first-ticket', 'bell', 'ticket-fold', 'ticket-open', 'drinks', 'fries', 'first-egg', 'first-toast', 'first-melt', 'first-sauce', 'first-smash', 'sent-back', 'back-to-grill'];
const saveFor = (k) => ({
  tutorialDone: true, town: k.town, day: 12, time: 'morning', unlocked: [...k.before, k.town], passedTowns: k.before,
  shiftsIn: Object.fromEntries(k.before.map((t) => [t, 3])), bank: 120, popularity: 45, found: [], bonuses: [],
});

async function play(name) {
  const k = KITCHENS[name];
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERR', e.message); });
  await p.goto(`http://localhost:${PORT}/`);
  await p.waitForTimeout(500);
  await p.evaluate(([s, done]) => {
    localStorage.clear();
    localStorage.setItem('bv-save-v1', JSON.stringify(s));
    localStorage.setItem('bv-coach', JSON.stringify({ on: true, done }));
    localStorage.setItem('bv-difficulty', 'chill');
  }, [saveFor(k), LEARNED]);
  await p.reload();
  await p.waitForTimeout(1200);
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 8, radiusY: 8, force: 0.6, id: 0 }] });
  const tapAt = async (x, y) => { await touch('touchStart', x, y); await sleep(70); await touch('touchEnd'); };
  const tapSel = async (sel) => { const r = await p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel); if (r) await tapAt(...r); return !!r; };
  const ev = (f, a) => p.evaluate(f, a);
  const fails = [];
  let n = 0;
  const shots = new Set();
  const snap = async (id) => { if (process.env.NOSHOT || shots.has(id)) return; shots.add(id); await ev(() => window.__bv.game.phase === 'playing' && window.__bv.step(0)); await p.screenshot({ path: `${out}kc-${name}-${String(++n).padStart(2, '0')}-${id}.png` }); };

  await tapSel('[data-home=open]');
  await p.waitForTimeout(900);
  await snap('prep');
  await tapSel('[data-act=open]');
  await p.waitForTimeout(600);
  // The clock runs in real time, but without drawing (software GL is too slow to draw at 60 fps,
  // and touches have to arrive on time for the peel's flicks); drawn only for screenshots.
  await ev(() => { window.__bv.manual(true); window.__run = setInterval(() => window.__bv.tick(1 / 60), 16); });
  const g0 = await ev(() => ({ guide: window.__bv.game.guide, phase: window.__bv.game.phase, tutorial: window.__bv.game.tutorial }));
  console.log(`[${name}] shift at ${k.town}:`, JSON.stringify(g0));
  if (g0.guide !== name) fails.push(`guide is ${g0.guide}, not ${name}`);

  const coach = () => ev(() => { const c = window.__bv.coach(); return c && { id: c.id, g: c.show.gesture, ok: !!c.show.ok, title: c.show.title, text: c.show.text }; });
  const seg = (a, z, steps) => Array.from({ length: steps + 1 }, (_, i) => ({ x: a.x + ((z.x - a.x) * i) / steps, y: a.y + ((z.y - a.y) * i) / steps }));
  const path = async (pts, ms) => { for (const q of pts) { await touch('touchMove', q.x, q.y); await sleep(ms); } };
  let last = '', same = 0, quiet = 0, orderTime = null, dish = null;
  const log = [];
  for (let guard = 0; guard < 500; guard++) {
    const st = await ev(() => { const g = window.__bv.game; const s = g.slots.find((x) => x.order && !x.leaving && x.lesson === 0); return { served: g.served, time: g.time, guide: g.guide, guided: g.guided, phase: g.phase, dish: s ? s.order.name : null }; });
    if (st.dish && !dish) { dish = st.dish; orderTime = st.time; }
    const c = await coach();
    if (st.served >= 1 && !st.guide && (!c || !c.id.endsWith('-after'))) break;
    if (!c) {
      if (++quiet > 80) { fails.push('nothing shown for too long'); break; }
      await ev(() => window.__bv.step(0.5));
      await sleep(250);
      continue;
    }
    quiet = 0;
    const key = c.id + '|' + c.title;
    // Waiting on a meter (no gesture) isn't being stuck.
    if (key === last) same += c.g || c.ok ? 1 : 0.1;
    else { same = 0; last = key; log.push(c.title); console.log(`  ${c.id}: ${c.title} — ${c.text}`); }
    await snap(c.id + '-' + String(c.title).replace(/[^a-z]+/gi, '_').toLowerCase());
    if (same > 40) { fails.push(`stuck on ${key}`); break; }
    if (c.ok) { await tapSel('.coach-ok'); await sleep(350); continue; }
    const g = c.g;
    if (!g) { await ev(() => window.__bv.step(0.5)); await sleep(200); continue; }
    if (g.kind === 'tap') {
      await tapAt(g.at.x, g.at.y);
    } else if (g.kind === 'drag' || g.kind === 'swipe') {
      await touch('touchStart', g.from.x, g.from.y); await sleep(60);
      await path(seg(g.from, g.to, g.kind === 'swipe' ? 6 : 16).slice(1), g.kind === 'swipe' ? 14 : 22);
      await sleep(70); await touch('touchEnd');
    } else if (g.kind === 'dragSwipe') {
      await touch('touchStart', g.from.x, g.from.y); await sleep(90);
      await path(seg(g.from, g.to, 18).slice(1), 24);
      await sleep(180);
      await path(seg(g.to, g.end, 6).slice(1), 15);
      await sleep(40); await touch('touchEnd');
    } else if (g.kind === 'circle' || g.kind === 'dragCircle') {
      // A spiral from the middle out over the close-up (the ladle), or a smaller round (pesto).
      const start = g.kind === 'circle' ? g.at : g.from;
      const ctr = g.kind === 'circle' ? { x: g.at.x, y: g.at.y + g.r * 0.8 } : g.to;
      await touch('touchStart', start.x, start.y); await sleep(60);
      if (g.kind === 'dragCircle') { await path(seg(g.from, ctr, 14).slice(1), 22); await sleep(450); }
      const R = g.r / 0.3;
      const reach = name === 'oven' ? 0.78 : 0.5;
      const N = 70;
      for (let i = 0; i <= N; i++) { const a = i * 0.45; const r = R * (0.08 + (reach - 0.08) * (i / N)); await touch('touchMove', ctr.x + Math.cos(a) * r, ctr.y + Math.sin(a) * r); await sleep(16); }
      await touch('touchEnd');
    } else if (g.kind === 'hold') {
      await touch('touchStart', g.at.x, g.at.y); await sleep(900); await touch('touchEnd');
    }
    await sleep(350);
  }
  const fin = await ev(() => ({ served: window.__bv.game.served, time: window.__bv.game.time, guide: window.__bv.game.guide, stars: window.__bv.game.stars, coach: JSON.parse(localStorage.getItem('bv-coach')).done }));
  await snap('end');
  const learned = fin.coach.includes(`guided-${name}`);
  console.log(`[${name}] dish ${dish}, clock ${orderTime?.toFixed(1)} s at the order, ${fin.time.toFixed(1)} s after serving; served ${fin.served}, stars ${JSON.stringify(fin.stars)}, learned ${learned}; ${log.length} coach steps`);
  if (dish !== k.dish) fails.push(`dish ${dish}, not ${k.dish}`);
  if (fin.served < 1) fails.push('not served');
  if (!learned) fails.push('lesson not stored as learned');
  if (orderTime !== null && fin.time - orderTime > 3) fails.push(`clock ran ${(fin.time - orderTime).toFixed(1)} s during the guided order`);
  // The next shift in this kitchen isn't guided again.
  const again = await ev(() => { window.__bv.startShift(); return window.__bv.game.guide; });
  if (again) fails.push(`the next shift is guided again (${again})`);
  if (errors.length) fails.push(`${errors.length} page errors`);
  await b.close();
  console.log(fails.length ? `[${name}] FAIL\n  ${fails.join('\n  ')}` : `[${name}] PASS`);
  return fails.length === 0;
}

(async () => {
  const which = (process.env.KITCHEN || 'press,comal,oven').split(',');
  let ok = true;
  for (const k of which) ok = (await play(k)) && ok;
  process.exit(ok ? 0 : 1);
})();
