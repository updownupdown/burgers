// Later lessons, from a prepared save: SCENE=town (a new town opens: tap it, drive there; the
// Garage when a bonus is affordable) or SCENE=sides (an order with fries and an egg on a
// toasted bun, guided like the first shift's third order). The bot only does what the thumb shows.
const { open, step, out } = require('./lib.cjs');
const scene = process.env.SCENE || 'town';
(async () => {
  const { b, p } = await open({ w: 390, h: 844 });
  const learned = ['map-open', 'prep-open', 'closing', 'evening-sleep', 'map-pips', 'first-ticket', 'bell', 'ticket-fold', 'ticket-open', 'drinks', 'first-sauce'];
  await p.evaluate(([scene, learned]) => {
    localStorage.clear();
    localStorage.setItem('bv-welcomed', '1');
    localStorage.setItem('bv-coach', JSON.stringify({ on: true, done: learned }));
    const save = scene === 'town'
      ? { tutorialDone: true, town: 'pinecrest', shiftsIn: { pinecrest: 3 }, passedTowns: ['pinecrest'], unlocked: ['pinecrest', 'elkpass', 'cedarfalls'], day: 4, time: 'morning', bank: 120, found: ['bench'] }
      : scene === 'smash'
        ? { tutorialDone: true, town: 'elkpass', shiftsIn: { pinecrest: 3 }, passedTowns: ['pinecrest'], unlocked: ['pinecrest', 'elkpass', 'cedarfalls'], day: 4, time: 'morning' }
        : { tutorialDone: true, town: 'pinecrest', shiftsIn: { pinecrest: 1 }, passedTowns: ['pinecrest'], day: 2, time: 'morning' };
    localStorage.setItem('bv-save-v1', JSON.stringify(save));
  }, [scene, learned]);
  await p.reload(); await p.waitForTimeout(900);
  let n = 0;
  const shots = new Set();
  const snap = async (id) => { if (shots.has(id)) return; shots.add(id); await p.screenshot({ path: `${out}scene-${scene}-${String(++n).padStart(2, '0')}-${id}.png` }); };
  if (scene === 'sides' || scene === 'smash') {
    await p.evaluate((sc) => { window.__scene = sc; }, scene);
    await p.click('[data-home=open]'); await p.waitForTimeout(700); await p.click('[data-act=open]'); await p.waitForTimeout(400);
    // Make the first order a Sunrise Summit (toasted bun, egg) with medium fries, guided like the third order.
    for (let i = 0; i < 40; i++) {
      const ok = await p.evaluate(() => {
        const g = window.__bv.game; const s = g.slots.find((x) => x.order);
        if (!s) return false;
        if (window.__scene === 'smash') Object.assign(s.order, { name: 'Summit Smash', layers: [{ kind: 'bun' }, { kind: 'patty', smashed: true }, { kind: 'cheese', melted: true }, { kind: 'pickle', count: 2 }, { kind: 'mustard' }, { kind: 'bun' }], fries: false, drink: null, mods: [] });
        else Object.assign(s.order, { name: 'Sunrise Summit', layers: [{ kind: 'bun', toasted: true }, { kind: 'lettuce' }, { kind: 'patty' }, { kind: 'egg' }, { kind: 'bun', toasted: true }], fries: true, friesSize: 'M', drink: null, mods: [] });
        s.ticketKey = ''; s.lesson = 2; s.patience = s.maxPatience = 900; g.tutorial = true;
        return true;
      });
      if (ok) break;
      await step(p, 0.5); await p.waitForTimeout(100);
    }
  }
  const coach = () => p.evaluate(() => { const c = window.__bv.coach(); return c && { id: c.id, g: c.show.gesture, ok: !!c.show.ok, title: c.show.title, text: c.show.text }; });
  let last = '', same = 0, quiet = 0;
  for (let guard = 0; guard < 400; guard++) {
    const c = await coach();
    const st = await p.evaluate(() => ({ town: window.__bv.save.town, phase: window.__bv.game.phase, overlay: window.__bv.game.overlay, served: window.__bv.game.served }));
    if (!c) {
      if (++quiet > 30) { console.log('QUIET', JSON.stringify(st)); break; }
      if (st.phase === 'playing') await step(p, 0.5);
      if (scene !== 'town' && st.served >= 1) break;
      await p.waitForTimeout(400);
      continue;
    }
    quiet = 0;
    const key = c.id + '|' + c.title;
    if (key === last) same++; else { same = 0; last = key; console.log(`[${st.phase}] ${c.id}: ${c.title} — ${c.text}`); }
    await snap(c.id + '-' + (c.title || '').replace(/[^a-z]+/gi, '_').toLowerCase());
    if (same > 25) { console.log('STUCK', key); break; }
    if (c.ok) { await p.click('.coach-ok'); await p.waitForTimeout(300); continue; }
    const g = c.g; const m = p.mouse;
    if (!g) { if (st.phase === 'playing') await step(p, 0.6); else await p.waitForTimeout(300); continue; }
    const seg = (a, z, k) => Array.from({ length: k + 1 }, (_, i) => ({ x: a.x + (z.x - a.x) * i / k, y: a.y + (z.y - a.y) * i / k }));
    if (g.kind === 'tap') { await m.move(g.at.x, g.at.y); await m.down(); await p.waitForTimeout(60); await m.up(); }
    else if (g.kind === 'drag' || g.kind === 'swipe') { await m.move(g.from.x, g.from.y); await m.down(); for (const q of seg(g.from, g.to, 14)) { await m.move(q.x, q.y); await p.waitForTimeout(18); } await m.up(); }
    else if (g.kind === 'dragCircle' || g.kind === 'circle') {
      const a = g.kind === 'circle' ? g.at : g.from; let z = g.kind === 'circle' ? g.at : g.to;
      await m.move(a.x, a.y); await m.down(); for (const q of seg(a, z, 14)) { await m.move(q.x, q.y); await p.waitForTimeout(18); }
      // Sauce zooms onto the burger: squeeze around the zoomed view's middle.
      const zc = await p.evaluate(() => (window.__bv.ptr() || {}).mode === 'sauce' ? window.__bv.sauceCentre() : null);
      if (zc) { await p.waitForTimeout(400); z = { x: zc[0], y: zc[1] + 34 }; }
      const rr = zc ? 60 : 18;
      for (let i = 0; i <= 40; i++) { const t = i / 40 * Math.PI * 6; await m.move(z.x + Math.sin(t) * rr, z.y + Math.cos(t) * rr * 0.6); await p.waitForTimeout(25); if (!zc) await step(p, 0.05); }
      await m.up();
    } else if (g.kind === 'hold') { await m.move(g.at.x, g.at.y); await m.down(); for (let i = 0; i < 8; i++) { await p.waitForTimeout(120); await step(p, 0.1); } await m.up(); }
    await p.waitForTimeout(200);
    if (st.phase === 'playing') await step(p, 0.4);
    await p.waitForTimeout(300);
  }
  console.log('END', JSON.stringify(await p.evaluate(() => ({ town: window.__bv.save.town, overlay: window.__bv.game.overlay, served: window.__bv.game.served, stars: window.__bv.game.stars }))));
  await b.close();
})();
