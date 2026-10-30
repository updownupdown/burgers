// Shared helpers for scripted playtests: the game loop is frozen and gestures are
// dispatched as synthetic pointer events with real timing, then time is stepped.
const { chromium } = require('playwright');
const out = process.env.OUT || require('path').join(__dirname, 'out') + '/';
require('fs').mkdirSync(out, { recursive: true });
async function open(opts = {}) {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: opts.w || 390, height: opts.h || 844 }, deviceScaleFactor: opts.dpr || 1 })).newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message, e.stack));
  p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
  await p.goto('http://localhost:4173/' + (opts.query || ''));
  await p.waitForTimeout(600);
  return { b, p };
}
// Gesture: list of [x,y] points, msPer step. Runs inside the page with setTimeout timing.
async function gesture(p, pts, msPer = 16) {
  await p.evaluate(async ({ pts, msPer }) => {
    window.__bv.manual(true);
    const c = document.getElementById('gl');
    const fire = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, bubbles: true, pointerType: 'touch', isPrimary: true }));
    fire('pointerdown', pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) { await new Promise(r => setTimeout(r, msPer)); fire('pointermove', pts[i][0], pts[i][1]); }
    await new Promise(r => setTimeout(r, msPer));
    const l = pts[pts.length - 1];
    fire('pointerup', l[0], l[1]);
  }, { pts, msPer });
}
function line(x0, y0, x1, y1, n = 10) { const a = []; for (let i = 0; i <= n; i++) a.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]); return a; }
async function hold(p, x, y, ms) {
  await p.evaluate(async ({ x, y, ms }) => {
    window.__bv.manual(true);
    const c = document.getElementById('gl');
    const fire = (type) => c.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, bubbles: true, pointerType: 'touch', isPrimary: true }));
    fire('pointerdown');
    window.__bv.step(ms / 1000);
    fire('pointerup');
  }, { x, y, ms });
}
const step = (p, s) => p.evaluate((s) => window.__bv.step(s), s);
const state = (p) => p.evaluate(() => {
  const g = window.__bv.game, c = window.__bv.counter;
  const f = (pc) => pc.kind + ':' + pc.cook.map(x => x.toFixed(2)).join('/') + (pc.melt != null ? ' melt' + pc.melt.toFixed(2) : '');
  return {
    t: +g.time.toFixed(1), phase: g.phase, active: g.active, served: g.served, lost: g.lost, money: g.money, tips: g.tips,
    slots: g.slots.map(s => s.order && !s.leaving ? { id: s.order.id, name: s.order.name, want: s.order.layers.map(l => l.kind + (l.doneness ? '(' + l.doneness + ')' : '') + (l.toasted ? '(t)' : '') + (l.melted ? '(m)' : '')).join(' '), fries: s.order.fries, drink: s.order.drink, patience: +(s.patience / s.maxPatience).toFixed(2), plate: s.plate.layers.map(l => f(l.piece)), pf: s.plate.fries, pd: s.plate.drink } : null),
    grill: c.grillItems.map(i => f(i.piece) + '@' + i.x.toFixed(1) + ',' + i.z.toFixed(1)),
    page: c.page, gesture: window.__bv.gesture(),
  };
});
module.exports = { open, gesture, line, hold, step, state, out };
