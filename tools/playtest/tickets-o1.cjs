// Tickets (O1 Clean receipt) with real orders in each region: three customers called up, open and folded.
// PORT=4175 [W=390] [OUT=dir/] node tools/playtest/tickets-o1.cjs
const { open, step, out, enterShift } = require('./lib.cjs');
const W = +(process.env.W || 390), H = W === 360 ? 740 : 844;
const dir = process.env.OUT || out;
const towns = (process.env.TOWNS || 'summit,harbor,sunvalley,portamber').split(',');
(async () => {
  for (const town of towns) {
    const { b, p } = await open({ w: W, h: H, dpr: 2 });
    await p.evaluate((t) => { localStorage.setItem('bv-save-v1', JSON.stringify({ town: t, stop: 1, day: 6, popularity: 70, unlocked: ['pinecrest','elkpass','cedarfalls','summit','saltwater','gullpoint','driftwood','harbor','redmesa','cactus','sunvalley','applecross','larkvale','portamber'], tutorialDone: true })); localStorage.setItem('bv-coach', JSON.stringify({ on: false, done: [] })); localStorage.setItem('bv-welcomed', '1'); }, town);
    await p.reload(); await p.waitForTimeout(800);
    await enterShift(p);
    await p.evaluate(() => window.__bv.manual(true));
    await step(p, 3);
    for (let k = 0; k < 14; k++) {
      await p.evaluate(() => { const g = window.__bv.game; g.slots.forEach((s) => { if (s.order) s.patience = s.maxPatience * 0.8; }); while (g.line.length < 3) g.line.push({ seed: Math.floor(Math.random() * 1000), patience: 999, maxPatience: 999 }); [...document.querySelectorAll('.tray-call')].filter((x) => !x.hidden).forEach((x) => { x.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); x.click(); }); });
      await step(p, 1.5);
    }
    await p.addStyleTag({ content: '.hint,.coach{display:none!important}' });
    const shot = async (tag) => { await step(p, 0.3); await p.waitForTimeout(250); await p.screenshot({ path: `${dir}tk-${town}-${W}-${tag}.png`, clip: { x: 0, y: 0, width: W, height: Math.round(H * 0.6) } }); };
    const info = await p.evaluate(() => window.__bv.game.slots.map((s) => s.order && s.order.name));
    console.log(town, JSON.stringify(info));
    for (const a of [0, 1, 2]) {
      await p.evaluate((a) => { window.__bv.game.active = a; }, a);
      await shot(`open${a}`);
      const of = await p.evaluate(() => [...document.querySelectorAll('[data-r=ticket]')].filter((t) => !t.hidden).map((t) => { const tb = t.querySelector('.tb'); return t.scrollHeight - t.clientHeight + (tb ? tb.scrollHeight - tb.clientHeight : 0); }));
      console.log('  open', a, 'overflow px', JSON.stringify(of));
    }
    await p.click('[data-r=ticket][data-mode=big]'); await shot('fold');
    await b.close();
  }
})();
