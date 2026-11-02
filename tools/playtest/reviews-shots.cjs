// Opinions and reviews (DESIGN.md §26): faces over served customers, a specific line, a review's
// stars popping out, the pause tally, Closing's reviews, Popularity & reviews and the map's Rating.
// PORT=4176 node tools/playtest/reviews-shots.cjs  ->  tools/playtest/shots-reviews/*.png
const path = require('path');
process.env.OUT = process.env.OUT || path.join(__dirname, 'shots-reviews') + '/';
const { open, step, out, enterShift } = require('./lib.cjs');
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater'];
const base = (extra = {}) => ({
  version: 2, tutorialDone: true, town: 'summit', day: 14, time: 'morning', unlocked: ALL, passedTowns: ALL,
  shiftsIn: Object.fromEntries(ALL.map((t) => [t, 3])), bank: 300, popularity: 58,
  reviewCounts: [3, 2, 4, 11, 19],
  press: [{ outlet: 'paper', source: 'The Summit City Herald', headline: 'A solid stop in Summit City', quote: 'Soggy fries.', stars: 4, pop: 4 }],
  ...extra,
});
const hideHint = (p) => p.evaluate(() => { for (const h of document.querySelectorAll('[data-r="hint"], .coach')) h.style.display = 'none'; });

(async () => {
  // 1. A shift: three at the window, each showing an opinion; two leave reviews.
  {
    const { b, p } = await open({ w: 390, h: 844, dpr: 2 });
    await p.evaluate((s) => localStorage.setItem('bv-save-v1', JSON.stringify(s)), base());
    await p.reload();
    await p.waitForTimeout(800);
    await enterShift(p);
    await p.evaluate(() => window.__bv.manual(true));
    await p.evaluate(() => { window.__bv.game.pacing = 'balanced'; });
    for (let k = 0; k < 40; k++) {
      await step(p, 2);
      const n = await p.evaluate(() => { window.__bv.ring(); return window.__bv.game.slots.filter((s) => s.order).length; });
      if (n >= 3) break;
      await p.waitForTimeout(30);
    }
    await step(p, 2.5);
    await hideHint(p);
    await p.evaluate(() => {
      const bv = window.__bv;
      bv.opinion(0, 5, null, true);
      bv.opinion(1, 4, null, false);
      bv.opinion(2, 2, 'Forgot the drink!', true);
    });
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}1-opinions.png` });
    await p.waitForTimeout(2600);
    await p.evaluate(() => {
      const bv = window.__bv;
      bv.opinion(0, 3, null, false);
      bv.opinion(1, 5, 'That was quick!', false);
      bv.opinion(2, 1, 'Too slow! I\'m off.', true);
    });
    await p.waitForTimeout(700);
    await hideHint(p);
    await p.screenshot({ path: `${out}2-opinions-more.png` });
    await p.waitForTimeout(2600);

    // A real serve of a plate that's only a bun: sent back first, then they decide.
    const said = [];
    for (let k = 0; k < 2; k++) {
      await p.evaluate(() => {
        const g = window.__bv.game;
        const i = g.slots.findIndex((s) => s.order && !s.leaving);
        const s = g.slots[i];
        s.plate.layers = [{ piece: { uid: 99000 + Math.floor(Math.random() * 999), kind: s.order.layers[0]?.kind ?? 'bun', cook: [0.5, 0] }, offX: 0, offZ: 0 }];
        window.__lastServe = i;
        window.__bv.serve(i);
      });
      await p.waitForTimeout(400);
      said.push(await p.evaluate(() => [...document.querySelectorAll('.bubble, .opinion')].map((e) => e.className + ': ' + e.textContent).join(' | ')));
      await hideHint(p);
      await p.screenshot({ path: `${out}3-serve-${k}.png` });
      await p.waitForTimeout(1200);
    }
    console.log('serve', JSON.stringify(said));

    // The pause card's tally.
    await p.evaluate(() => { const g = window.__bv.game; g.stars.push(5, 4, 4, 3, 5, 2, 4); g.served += 7; g.reviews.push(5, 2, 5); });
    await p.evaluate(() => window.__bv.menu.openMenu());
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${out}4-pause.png` });
    await p.evaluate(() => window.__bv.menu.closeAll());
    await p.waitForTimeout(200);

    // Run out the shift for Closing.
    await p.evaluate(() => { const g = window.__bv.game; g.time = g.shiftLength + 1; g.line = []; g.slots.forEach((s) => { if (s.order) s.patience = 9999; }); });
    for (let k = 0; k < 30; k++) {
      const ph = await p.evaluate(() => {
        const g = window.__bv.game;
        g.slots.forEach((s) => { if (s.order && !s.leaving) { s.plate.layers = []; s.order = null; s.fig && window.__bv.customersView.leave(g.slots.indexOf(s), () => {}); s.fig = null; } });
        return g.phase;
      });
      if (ph === 'summary') break;
      await step(p, 1);
    }
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${out}5-closing.png` });
    const box = await p.$('[data-v="closing:rev"]');
    if (box) {
      await box.click();
      await p.waitForTimeout(300);
      await p.evaluate(() => document.querySelector('[data-v="closing:rev"]').scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(200);
      await p.screenshot({ path: `${out}6-closing-reviews.png` });
    }
    console.log('closing', JSON.stringify(await p.evaluate(() => { const s = window.__bv.save; return { counts: s.reviewCounts, last: s.last && { reviews: s.last.reviews, rating: s.last.rating, before: s.last.ratingBefore, stars: s.last.stars } }; })));
    await b.close();
  }

  // 2. The map's Rating plate, and Popularity & reviews.
  {
    const { b, p } = await open({ w: 390, h: 844, dpr: 2 });
    await p.evaluate((s) => localStorage.setItem('bv-save-v1', JSON.stringify(s)), base());
    await p.reload();
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${out}7-map.png` });
    await p.click('[data-home=reviews]');
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${out}8-reviews.png` });
    await b.close();
  }

  // 3. An old three-star save: ratings wiped, everything else kept.
  {
    const { b, p } = await open({ w: 390, h: 844, dpr: 2 });
    const old = base({ ratingCount: 40, ratingSum: 90, rep: 2.4, repWeight: 30, reviews: [{ stars: 3, text: "Just like grandma's!", stop: 'Summit City' }], best: { summit: 2.6 } });
    delete old.version; delete old.reviewCounts;
    await p.evaluate((s) => localStorage.setItem('bv-save-v1', JSON.stringify(s)), old);
    await p.reload();
    await p.waitForTimeout(1200);
    const s = await p.evaluate(() => { const s = window.__bv.save; return { v: s.version, counts: s.reviewCounts, bank: s.bank, best: s.best, press: s.press.length, rep: s.rep, reviews: s.reviews }; });
    console.log('old save', JSON.stringify(s));
    await p.screenshot({ path: `${out}9-map-old-save.png` });
    await b.close();
  }
})();
