const { open, out } = require('./lib.cjs');
(async () => {
  const { b, p } = await open({ w: 390, h: 844, dpr: 2 });
  await p.evaluate(() => localStorage.setItem('bv-save-v1', JSON.stringify({ stop: 1, tutorialDone: true })));
  await p.reload(); await p.waitForTimeout(900);
  await p.evaluate(() => { const ids = [...document.querySelectorAll('.home-town')].map(t => t.dataset.town); const s = window.__bv.save; for (const id of ids) if (!s.unlocked.includes(id)) s.unlocked.push(id); window.__bv.showTitle(); });
  await p.waitForTimeout(800);
  const t = await p.$('.home-town[data-town=driftwood]') || await p.$('.home-town:not(.here)');
  const bb = await t.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}ui-e-sheet.png` });
  await p.click('[data-home=close]'); await p.waitForTimeout(400);
  for (let i = 0; i < 4; i++) { await p.click('[data-home=zoom-out]'); await p.waitForTimeout(350); }
  await p.screenshot({ path: `${out}ui-e-zoomout.png` });
  await b.close();
})();
