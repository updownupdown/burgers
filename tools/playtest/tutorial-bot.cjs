// Plays a brand-new trip by doing only what the tutorial's thumb shows (window.__bv.coach()):
// welcome card, map, Prep, the first shift's guided orders, the closing screen and the evening.
// If the lessons point at the wrong place, the bot gets stuck and says where.
// Screenshots of each new lesson go to tools/playtest/out/tut-<n>-<id>.png.
const { open, step, out } = require('./lib.cjs');
(async () => {
  const W = +(process.env.W || 390), H = +(process.env.H || 844);
  const { b, p } = await open({ w: W, h: H });
  await p.evaluate(() => { localStorage.clear(); });
  await p.reload(); await p.waitForTimeout(900);
  const shots = new Set();
  let n = 0;
  const snap = async (id) => { if (shots.has(id) || process.env.NOSHOT) return; shots.add(id); await p.screenshot({ path: `${out}tut-${String(++n).padStart(2, '0')}-${id}.png` }); };
  await snap('welcome');
  await p.click('[data-w=go]'); await p.waitForTimeout(600);
  const coach = () => p.evaluate(() => { const c = window.__bv.coach(); return c && { id: c.id, g: c.show.gesture, ok: !!c.show.ok, title: c.show.title, text: c.show.text }; });
  const phase = () => p.evaluate(() => window.__bv.game.phase);
  // Real time throughout (the sauce zoom and the camera glide need it); waits add game time on top.
  const manual = async () => {};
  let last = '', same = 0, guard = 0, quiet = 0;
  const log = [];
  while (guard++ < 600) {
    const ph = await phase();
    const c = await coach();
    if (!c) {
      // Nothing shown: a nudge waiting for a quiet moment, or nothing to teach. Let time pass.
      quiet++;
      // The report card comes up over the evening map after the shift (DESIGN §39), and the coach
      // waits for the map to be clear: Continue, as a player would.
      if (ph === 'title' && (await p.$('.report-card [data-rep=continue]'))) {
        await snap('report-card');
        // The card ignores taps for a moment after it comes up.
        await p.waitForTimeout(500);
        await p.click('.report-card [data-rep=continue]');
        await p.waitForTimeout(400);
        continue;
      }
      // The sundown at the end of the shift runs on game time too (the loop is frozen).
      if (ph === 'playing' || ph === 'sundown') { await manual(); await step(p, 0.5); }
      await p.waitForTimeout(400);
      const st = await p.evaluate(() => ({ day: window.__bv.save.day, served: window.__bv.game.served, phase: window.__bv.game.phase }));
      if (st.day >= 2 && st.phase === 'title' && quiet > 16) break;
      // Past the guided orders, nothing new to learn: send everyone home so the shift ends (the map lessons come next).
      if (st.phase === 'playing' && st.served >= 3 && quiet > 6) {
        await p.evaluate(() => { const g = window.__bv.game; g.line.length = 0; g.customers = g.spawned; g.time = g.shiftLength; g.slots.forEach((s) => { if (s.order && !s.leaving) s.patience = 0; }); });
        await step(p, 3);
      }
      if (quiet > 60) { console.log('QUIET TOO LONG', JSON.stringify(st)); break; }
      continue;
    }
    quiet = 0;
    const key = c.id + '|' + c.title + '|' + JSON.stringify(c.g && c.g.kind);
    if (key === last) same++; else { same = 0; last = key; log.push(`${c.id}: ${c.title} — ${c.text}`); console.log(`[${ph}] ${c.id}: ${c.title} — ${c.text}`); }
    await snap(c.id + (c.title ? '-' + c.title.replace(/[^a-z]+/gi, '_').toLowerCase() : ''));
    if (same > 25) { console.log('STUCK ON', key); break; }
    const g = c.g;
    if (c.ok) { await p.click('.coach-ok'); await p.waitForTimeout(300); continue; }
    if (!g) { if (ph === 'playing') { await manual(); await step(p, 0.6); } else await p.waitForTimeout(300); continue; }
    const m = p.mouse;
    const path = async (pts, ms = 16) => { for (const q of pts) { await m.move(q.x, q.y); await p.waitForTimeout(ms); } };
    const lerp = (a, b2, k) => ({ x: a.x + (b2.x - a.x) * k, y: a.y + (b2.y - a.y) * k });
    const seg = (a, b2, steps = 12) => Array.from({ length: steps + 1 }, (_, i) => lerp(a, b2, i / steps));
    if (g.kind === 'tap') {
      await m.move(g.at.x, g.at.y); await m.down(); await p.waitForTimeout(60); await m.up();
    } else if (g.kind === 'drag' || g.kind === 'swipe') {
      await m.move(g.from.x, g.from.y); await m.down(); await p.waitForTimeout(40);
      await path(seg(g.from, g.to, g.kind === 'swipe' ? 6 : 14), g.kind === 'swipe' ? 12 : 20);
      await p.waitForTimeout(60); await m.up();
    } else if (g.kind === 'hold') {
      await m.move(g.at.x, g.at.y); await m.down();
      // Pour until the cup is full enough, stepping game time while the button is held.
      for (let i = 0; i < 40; i++) {
        await manual(); await step(p, 0.15);
        const fill = await p.evaluate(() => Math.max(0, ...window.__bv.counter.cups.map((c) => c.fill)));
        if (fill >= 0.86) break;
      }
      await m.up();
    } else if (g.kind === 'circle' || g.kind === 'dragCircle') {
      const start = g.kind === 'circle' ? g.at : g.from;
      await m.move(start.x, start.y); await m.down(); await p.waitForTimeout(40);
      let ctr = g.kind === 'circle' ? g.at : g.to;
      if (g.kind === 'dragCircle') {
        await path(seg(g.from, g.to, 14), 20);
        // Sauce: the view zooms in; circle around the zoomed burger instead.
        const z = await p.evaluate(() => { if ((window.__bv.ptr() || {}).mode !== 'sauce') return null; const s = window.__bv.sauceCentre(); return { x: s[0], y: s[1], r: s[2] }; });
        if (z && z.r > 50) ctr = { x: z.x, y: z.y + 34 };
      }
      const r = g.kind === 'dragCircle' && ctr !== g.to ? 70 : g.kind === 'dragCircle' ? 18 : g.r + 30;
      // The salt shaker needs game time to pour (the clock is held between moves); sauce doesn't.
      const timed = !(g.kind === 'dragCircle' && ctr !== g.to);
      for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 4; await m.move(ctr.x + Math.sin(a) * r * (0.4 + i / 80), ctr.y - Math.cos(a) * r * 0.6 * (0.4 + i / 80)); await p.waitForTimeout(18); if (timed) await step(p, 0.05); }
      await m.up();
    }
    await p.waitForTimeout(150);
    if ((await phase()) === 'playing') { await manual(); await step(p, 0.5); }
    await p.waitForTimeout(250);
  }
  const fin = await p.evaluate(() => ({ day: window.__bv.save.day, shifts: window.__bv.save.shiftsIn, served: window.__bv.game.served, lost: window.__bv.game.lost, tut: window.__bv.save.tutorialDone, phase: window.__bv.game.phase, stars: window.__bv.game.stars }));
  console.log('END', JSON.stringify(fin));
  await b.close();
})();
