// Phase 1 kitchen checks: the drinks counter in a Pines town and a Coast town (each area's own
// fountain), and the Ticket rail's early ticket.
// PORT=4175 node tools/playtest/kitchen-phase1.cjs  ->  tools/playtest/shots-phase1/kitchen-*.png
const path = require('path');
process.env.OUT = process.env.OUT || path.join(__dirname, 'shots-phase1') + '/';
const { open, step, out, enterShift } = require('./lib.cjs');
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor'];
const save = (town, bonuses = []) => ({
  tutorialDone: true, town, day: 20, time: 'morning', unlocked: ALL, passedTowns: ALL,
  shiftsIn: Object.fromEntries(ALL.map((t) => [t, 3])), bank: 300, popularity: 60, found: bonuses, bonuses,
});
(async () => {
  for (const [town, bonus] of [['pinecrest', null], ['saltwater', null], ['summit', 'rail'], ['saltwater', 'rail']]) {
    const { b, p } = await open({ w: 390, h: 844, dpr: 2 });
    await p.evaluate((s) => localStorage.setItem('bv-save-v1', JSON.stringify(s)), save(town, bonus ? [bonus] : []));
    await p.reload();
    await p.waitForTimeout(800);
    await enterShift(p);
    if (bonus) {
      // Pick the bonus on Prep if enterShift skipped past it: the game remembers the last pick.
      await p.evaluate((id) => { const g = window.__bv.game; if (g.bonus !== undefined) g.bonus = id; }, bonus);
    }
    await p.evaluate(() => window.__bv.manual(true));
    await step(p, 2);
    if (bonus) {
      // A queue: one at the window, three in line.
      await step(p, 40);
      await p.evaluate(() => { const g = window.__bv.game; g.slots.forEach((s) => (s.patience = s.maxPatience)); });
    } else {
      await p.evaluate(() => window.__bv.goToPage(0));
      await step(p, 2);
    }
    await p.evaluate(() => document.querySelector('[data-r="hint"]').style.display = 'none');
    await p.screenshot({ path: `${out}kitchen-${town}${bonus ? '-' + bonus : '-drinks'}.png` });
    const info = await p.evaluate(() => ({
      labels: [...document.querySelectorAll('[data-r="dlabel"]')].map((e) => e.textContent),
      line: window.__bv.game.line.length,
      peek: !document.querySelector('[data-r="peek"]').hidden,
      bonus: window.__bv.game.bonus,
    }));
    console.log(town, JSON.stringify(info));
    await b.close();
  }
})();
