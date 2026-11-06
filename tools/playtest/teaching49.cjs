// Teaching fixes after the scope review (DESIGN §49), from prepared saves, at 390x844 with touch:
//   prep     Saltwater Bay's first Prep shows "New here"; in the shift it leads the tip lane for 6 s
//   event    Red Mesa's first shift on chili day: the event intro, then "New here", then the tips
//   ask      Port Amber's local ask doesn't say it counts toward roads
//   town     the first "new town" lesson names Cedar Falls
//   garage   the Garage card is an OK card at the top, clear of Prep & Open, gone with a sheet open
//   action   the fryer's "tap the basket to lower it" tip stays until the basket goes down; the HUD's
//            last-tip button shows it again
//   nudge    three great Relaxed shifts in a row: the report card offers Steady, and the tap sets it
// ONLY=prep,ask,... picks sections. Prints PASS/FAIL; screenshots to OUT (default out/) as t49-*.png.
const { open, out } = require('./lib.cjs');
const only = (process.env.ONLY || 'prep,event,ask,town,garage,action,nudge').split(',');
const LEARNED = ['map-open', 'prep-open', 'closing', 'evening-sleep', 'map-pips', 'town-tap', 'town-drive', 'garage', 'first-ticket', 'bell', 'ticket-fold', 'ticket-open', 'work-ahead', 'drinks', 'fries', 'first-egg', 'first-toast', 'first-melt', 'first-sauce', 'first-smash', 'sent-back', 'back-to-grill'];
let fails = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${extra ? ' · ' + extra : ''}`); if (!ok) fails++; };

async function fresh(p, save, { learned = LEARNED, pace = 'balanced', coach = true } = {}) {
  await p.evaluate(([save, learned, pace, coach]) => {
    localStorage.clear();
    localStorage.setItem('bv-welcomed', '1');
    localStorage.setItem('bv-difficulty', pace);
    localStorage.setItem('bv-coach', JSON.stringify({ on: coach, done: learned }));
    localStorage.setItem('bv-save-v1', JSON.stringify({ tutorialDone: true, time: 'morning', ...save }));
  }, [save, learned, pace, coach]);
  await p.reload();
  await p.waitForTimeout(1200);
}
const tip = (p) => p.evaluate(() => { const h = document.querySelector('.hint'); return h && !h.hidden ? h.textContent.trim() : null; });
async function prep(p) {
  await p.click('[data-home=open]');
  await p.waitForTimeout(800);
}
async function openShift(p) {
  await p.click('[data-act=open]');
  await p.waitForTimeout(300);
}
/** Tips seen over `secs` of shift time (the loop frozen and stepped), in order, every 0.25 s. */
async function tipsFor(p, secs) {
  const seen = [];
  await p.evaluate(() => window.__bv.manual(true));
  for (let t = 0; t < secs * 4; t++) {
    const x = await tip(p);
    if (x && seen[seen.length - 1] !== x) seen.push(x);
    await p.evaluate(() => window.__bv.step(0.25));
  }
  await p.evaluate(() => window.__bv.manual(false));
  return seen;
}
const touch = (p, type, x, y) => p.evaluate(([type, x, y]) => {
  document.getElementById('gl').dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 9, bubbles: true, pointerType: 'touch', isPrimary: true }));
}, [type, x, y]);
async function drag(p, a, z, n = 14) {
  await touch(p, 'pointerdown', a[0], a[1]);
  for (let i = 1; i <= n; i++) { await p.waitForTimeout(20); await touch(p, 'pointermove', a[0] + (z[0] - a[0]) * i / n, a[1] + (z[1] - a[1]) * i / n); }
  await p.waitForTimeout(30);
  await touch(p, 'pointerup', z[0], z[1]);
}
async function tap(p, a) { await touch(p, 'pointerdown', a[0], a[1]); await p.waitForTimeout(60); await touch(p, 'pointerup', a[0], a[1]); }

(async () => {
  const { b, p } = await open({ w: 390, h: 844 });
  await p.context().grantPermissions([]).catch(() => {});

  if (only.includes('prep')) {
    await fresh(p, { town: 'saltwater', day: 8, unlocked: ['pinecrest', 'cedarfalls', 'summit', 'saltwater'], shiftsIn: { pinecrest: 3, cedarfalls: 3, summit: 3 } }, { coach: false });
    await prep(p);
    const callout = await p.$eval('.prep .bv-callout.new', (e) => e.textContent.trim()).catch(() => null);
    check(!!callout && callout.startsWith('New here: the panini press'), 'Prep shows New here at Saltwater Bay', callout && callout.slice(0, 50));
    await p.screenshot({ path: `${out}t49-prep-newhere.png` });
    await openShift(p);
    const seen = await tipsFor(p, 9);
    check(seen[0]?.startsWith('New here: the panini press'), 'New here leads the tip lane', JSON.stringify(seen.map((s) => s.slice(0, 40))));
    check(seen.length >= 2 && !seen[1].startsWith('New here'), 'the first order\'s tip shows after it');
  }

  if (only.includes('event')) {
    await fresh(p, { town: 'redmesa', day: 12, unlocked: ['pinecrest', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor', 'redmesa'], shiftsIn: { pinecrest: 3, cedarfalls: 3, summit: 3, saltwater: 3, gullpoint: 3, driftwood: 3, harbor: 3 } }, { coach: false });
    await prep(p);
    const calls = await p.$$eval('.prep .prep-expect .bv-callout', (es) => es.map((e) => e.textContent.trim().slice(0, 30)));
    check(calls.some((c) => c.startsWith('Chili')) && calls.some((c) => c.startsWith('New here')), 'Prep on chili day at Red Mesa shows both', JSON.stringify(calls));
    await p.screenshot({ path: `${out}t49-prep-event.png` });
    await openShift(p);
    const seen = await tipsFor(p, 14);
    const ev = seen.findIndex((s) => s.includes('today!'));
    const nh = seen.findIndex((s) => s.startsWith('New here'));
    check(ev === 0 && nh === 1, 'event intro, then New here', JSON.stringify(seen.map((s) => s.slice(0, 40))));
  }

  if (only.includes('ask')) {
    await fresh(p, { town: 'portamber', day: 30, unlocked: ['pinecrest', 'applecross', 'larkvale', 'portamber'], shiftsIn: { pinecrest: 3, applecross: 3, larkvale: 3, portamber: 1 } });
    await prep(p);
    const ask = await p.$eval('.prep-ask', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
    check(!!ask && !/counts as two/.test(ask), 'Port Amber\'s ask says nothing of roads', ask);
    await p.screenshot({ path: `${out}t49-ask-portamber.png` });
    await fresh(p, { town: 'pinecrest', day: 3, shiftsIn: { pinecrest: 1 } });
    await prep(p);
    const ask2 = await p.$eval('.prep-ask', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
    check(!!ask2 && /counts as two/.test(ask2), 'Pinecrest\'s ask still counts toward roads');
  }

  if (only.includes('town')) {
    await fresh(p, { town: 'pinecrest', shiftsIn: { pinecrest: 3 }, passedTowns: ['pinecrest'], unlocked: ['pinecrest', 'elkpass', 'cedarfalls'], day: 4 }, { learned: LEARNED.filter((x) => x !== 'town-tap' && x !== 'town-drive') });
    await p.waitForTimeout(800);
    const c = await p.evaluate(() => window.__bv.coach());
    check(c?.id === 'town-tap' && /Cedar Falls/.test(c.show.text), 'new town lesson names Cedar Falls', c?.show.text);
    await p.screenshot({ path: `${out}t49-town-tap.png` });
  }

  if (only.includes('garage')) {
    await fresh(p, { town: 'pinecrest', shiftsIn: { pinecrest: 2 }, passedTowns: ['pinecrest'], unlocked: ['pinecrest'], day: 3, bank: 2000, found: ['bench'] }, { learned: LEARNED.filter((x) => x !== 'garage') });
    await p.waitForTimeout(800);
    const c = await p.evaluate(() => window.__bv.coach());
    const box = async (sel) => p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }).catch(() => null);
    const card = await box('.coach-card');
    const openBtn = await box('.home-dock [data-home=open]');
    const hit = card && openBtn && card.y < openBtn.y + openBtn.h && openBtn.y < card.y + card.h;
    check(c?.id === 'garage' && !!c.show.ok, 'Garage card is an OK card', c?.show.text);
    check(!!card && !!openBtn && !hit, 'Garage card clear of Prep & Open', JSON.stringify({ card, openBtn }));
    await p.screenshot({ path: `${out}t49-garage-card.png` });
    await p.click('.coach-ok');
    await p.waitForTimeout(500);
    const c2 = await p.evaluate(() => window.__bv.coach());
    check(!c2, 'OK puts it away for good');
  }

  if (only.includes('action')) {
    await fresh(p, { town: 'pinecrest', shiftsIn: { pinecrest: 1 }, passedTowns: ['pinecrest'], day: 2 }, { coach: false });
    await prep(p);
    await openShift(p);
    await p.waitForTimeout(7000);
    await p.evaluate(() => window.__bv.goToPage(2));
    await p.waitForTimeout(1200);
    const pts = await p.evaluate(() => {
      const c = window.__bv.counter;
      const pr = (f, dy = 0) => { const v = c.proxyPoint(f); return v && window.__bv.project('counter', v.x, v.y + dy, v.z); };
      return { bin: pr((h) => h.type === 'friesBin', 0.3), basket: pr((h) => h.type === 'basket' && h.idx === 0, 0.3) };
    });
    await drag(p, pts.bin, pts.basket);
    await p.waitForTimeout(500);
    const t0 = await tip(p);
    check(/Tap the basket to lower it/.test(t0 || ''), 'the scoop tip asks for the basket to go down', t0);
    await p.screenshot({ path: `${out}t49-action-tip.png` });
    await p.waitForTimeout(6000);
    const t1 = await tip(p);
    check(t1 === t0, 'it is still up 6 s later (it used to go after 4)');
    await tap(p, pts.basket);
    await p.waitForTimeout(600);
    const t2 = await tip(p);
    check(t2 !== t0, 'lowering the basket puts it away', t2);
    await p.waitForTimeout(5000);
    const btn = await p.$('[data-r=tipBtn]:not([hidden])');
    check(!!btn, 'the last-tip button shows in the HUD');
    if (btn) {
      await p.screenshot({ path: `${out}t49-tip-button.png` });
      await btn.click();
      await p.waitForTimeout(400);
      const t3 = await tip(p);
      check(!!t3, 'it shows the last tip again', t3);
      await p.screenshot({ path: `${out}t49-tip-again.png` });
    }
  }

  if (only.includes('nudge')) {
    await fresh(p, { town: 'pinecrest', shiftsIn: { pinecrest: 3 }, passedTowns: ['pinecrest'], unlocked: ['pinecrest', 'elkpass', 'cedarfalls'], day: 5, paceNudge: { streak: 2, offered: false } }, { pace: 'chill' });
    await prep(p);
    await openShift(p);
    await p.waitForTimeout(1500);
    // Play it as served: a full, five-star day, then close.
    await p.evaluate(() => {
      const g = window.__bv.game;
      g.customers = 8; g.spawned = 8; g.line.length = 0; g.served = 8; g.lost = 0; g.stars = [5, 5, 5, 5, 5, 5, 5, 5];
      g.slots.forEach((s) => { s.order = null; s.fig = null; });
      g.time = g.shiftLength + 1;
    });
    for (let i = 0; i < 40 && !(await p.$('.report-card')); i++) await p.waitForTimeout(500);
    await p.waitForTimeout(800);
    const line = await p.$eval('.rep-nudge', (e) => e.textContent.trim()).catch(() => null);
    check(!!line && /Try Steady/.test(line), 'report card offers Steady', line);
    await p.screenshot({ path: `${out}t49-nudge.png` });
    if (line) {
      await p.click('[data-rep=steady]');
      await p.waitForTimeout(300);
      const after = await p.evaluate(() => ({ pace: localStorage.getItem('bv-difficulty'), nudge: window.__bv.save.paceNudge, steady: window.__bv.save.last && window.__bv.save.last.steady }));
      check(after.pace === 'balanced' && after.nudge.offered && !after.steady, 'tap sets Steady and it is not offered again', JSON.stringify(after));
      await p.screenshot({ path: `${out}t49-nudge-done.png` });
    }
  }

  await b.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();
