// Screenshots of each counter page mid-shift.
// PORT=4175 node tools/playtest/pages-shots.cjs [tag]  ->  tools/playtest/out/page-<tag>-<n>.png
const { open, step, out, enterShift } = require('./lib.cjs');
const tag = process.argv[2] || 'now';
(async () => {
  const { b, p } = await open({ w: 390, h: 844, dpr: 2 });
  await p.evaluate((t) => localStorage.setItem('bv-save-v1', JSON.stringify({ town: t, unlocked: ['pinecrest', 'elkpass', 'cedarfalls', 'summit', t], tutorialDone: true })), process.env.TOWN || 'summit');
  await p.reload();
  await p.waitForTimeout(600);
  await enterShift(p);
  await p.evaluate(() => window.__bv.manual(true));
  await step(p, 2);
  for (const page of [0, 1, 2]) {
    await p.evaluate((pg) => window.__bv.goToPage(pg), page);
    await step(p, 1.5);
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}page-${tag}-${page}.png` });
  }
  await b.close();
})();
