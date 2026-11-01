// Road map screenshots for the four-region map (DESIGN.md §24 phase 1): early, middle and
// whole-trip saves, morning and evening, at the default zoom and zoomed out.
// PORT=4175 node tools/playtest/map-phase1.cjs  -> tools/playtest/shots-phase1/
const { open } = require('./lib.cjs');
const dir = require('path').join(__dirname, 'shots-phase1') + '/';
require('fs').mkdirSync(dir, { recursive: true });
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor', 'redmesa', 'cactus', 'sunvalley', 'applecross', 'larkvale', 'portamber'];
const save = (n, extra = {}) => {
  const worked = ALL.slice(0, n);
  return {
    tutorialDone: true, day: 3 + n * 4, town: worked[worked.length - 1] || 'pinecrest',
    unlocked: [...new Set([...ALL.slice(0, n + 2), 'pinecrest'])], passedTowns: worked,
    shiftsIn: Object.fromEntries(worked.map((id) => [id, 3])), bank: 300, ...extra,
  };
};
const SAVES = {
  early: { tutorialDone: true, day: 4, town: 'pinecrest', unlocked: ['pinecrest', 'elkpass', 'cedarfalls'], passedTowns: ['pinecrest'], shiftsIn: { pinecrest: 3 } },
  mid: save(8, { town: 'harbor' }),
  all: { ...save(14), unlocked: ALL, town: 'portamber' },
};
if (!process.env.TOUR) (async () => {
  const { b, p } = await open({ w: 390, h: 844, dpr: 2, query: process.env.Q || '' });
  for (const [name, s] of Object.entries(SAVES)) {
    if (process.env.ONLY && !process.env.ONLY.split(',').includes(name)) continue;
    for (const time of ['morning', 'evening']) {
      await p.evaluate((s) => localStorage.setItem('bv-save-v1', JSON.stringify(s)), { ...s, time });
      await p.reload();
      await p.waitForTimeout(1400);
      await p.screenshot({ path: `${dir}map-${name}-${time}.png` });
      if (time === 'morning') {
        for (let i = 0; i < 6; i++) { const z = await p.$('[data-home=zoom-out]'); if (!z) break; await z.click(); await p.waitForTimeout(250); }
        await p.waitForTimeout(500);
        await p.screenshot({ path: `${dir}map-${name}-zoomed-out.png` });
      }
    }
  }
  await b.close();
})();
// TOUR=1: the whole-trip map centred on a town in each area, for a closer look at the drawing.
if (process.env.TOUR) (async () => {
  const { b, p } = await open({ w: 390, h: 844, dpr: 2 });
  for (const town of (process.env.TOUR === '1' ? 'pinecrest,elkpass,summit,saltwater,driftwood,redmesa,cactus,sunvalley' : process.env.TOUR).split(',')) {
    await p.evaluate((s) => localStorage.setItem('bv-save-v1', JSON.stringify(s)), { ...SAVES.all, town, time: 'morning' });
    await p.reload();
    await p.waitForTimeout(1300);
    await p.screenshot({ path: `${dir}tour-${town}.png` });
  }
  await b.close();
})();
