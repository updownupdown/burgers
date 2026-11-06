// The map dock never cuts off text (DESIGN §46): every town at 320, 360 and 390 px, morning and evening,
// and on its event day, checks the town's name and the line under it for overflow and prints PASS/FAIL. With OUT= it also
// saves one sheet per width of every town's dock (`<OUT>dock-<w>.png`).
// PORT=4191 [OUT=dir/] [TEXT=large] node tools/playtest/dock-fit.cjs
const { chromium } = require('playwright');
const TOWNS = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor', 'redmesa', 'cactus', 'sunvalley', 'applecross', 'larkvale', 'portamber'];
// Each town's event day (stops.ts EVENTS): the dock's line reads the event's name then.
const EVENT_DAYS = { cedarfalls: 3, summit: 5, driftwood: 6, harbor: 9, cactus: 10, redmesa: 12, larkvale: 15 };
const out = process.env.OUT;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  let fails = 0;
  for (const w of [320, 360, 390]) {
    const p = await (await b.newContext({ viewport: { width: w, height: 760 }, deviceScaleFactor: 2 })).newPage();
    if (process.env.TEXT) await p.addInitScript((t) => localStorage.setItem('bv-text', t), process.env.TEXT); // TEXT=large: DESIGN §52
    await p.goto('http://localhost:' + (process.env.PORT || 4173) + '/');
    const shots = [];
    for (const town of TOWNS) {
      for (const time of ['morning', 'evening', ...(EVENT_DAYS[town] ? ['event'] : [])]) {
        const save = { town, day: time === 'event' ? EVENT_DAYS[town] : 6, time: time === 'event' ? 'morning' : time, popularity: 43, bank: 135, tutorialDone: true, unlocked: TOWNS, shiftsIn: { [town]: 1 } };
        await p.evaluate((s) => { localStorage.setItem('bv-save-v1', JSON.stringify(s)); localStorage.setItem('bv-coach', JSON.stringify({ on: false, done: [] })); localStorage.setItem('bv-welcomed', '1'); }, save);
        await p.reload();
        await p.waitForSelector('.home-dock:not([hidden]) b');
        await p.evaluate(() => document.fonts.ready);
        await p.waitForTimeout(350);
        const r = await p.evaluate(() => {
          const d = document.querySelector('.home-dock');
          const name = d.querySelector('.home-dock-info b');
          const t = d.querySelector('.bv-caption .t') || d.querySelector('.bv-caption');
          const btn = d.querySelector('.home-dock-row > .bv-btn');
          const over = (el) => el && el.scrollWidth > el.clientWidth + 0.5;
          // The button must sit inside the dock's padding, not run over its edge.
          const dr = d.getBoundingClientRect();
          const btnOut = btn.getBoundingClientRect().right > dr.right - parseFloat(getComputedStyle(d).paddingRight) + 0.5;
          return { name: name.textContent, size: getComputedStyle(name).fontSize, nameCut: over(name), line: t ? t.textContent : '', lineCut: over(t), btnCut: over(btn) || btnOut };
        });
        const ok = !r.nameCut && !r.lineCut && !r.btnCut;
        if (!ok) fails++;
        console.log(`${ok ? 'PASS' : 'FAIL'} ${w}px ${time.padEnd(7)} ${r.name.padEnd(16)} ${r.size} | ${r.line}${r.nameCut ? ' [name cut]' : ''}${r.lineCut ? ' [line cut]' : ''}${r.btnCut ? ' [button cut]' : ''}`);
        if (out && time === 'morning') {
          const bb = await (await p.$('.home-dock')).boundingBox();
          shots.push(await p.screenshot({ clip: { x: 0, y: bb.y - 6, width: w, height: bb.height + 12 } }));
        }
      }
    }
    if (out) {
      const html = `<body style="margin:0;background:#2a3340;display:grid;gap:6px;padding:6px 0;width:${w}px">${shots.map((s) => `<img style="width:${w}px" src="data:image/png;base64,${s.toString('base64')}">`).join('')}</body>`;
      await p.setViewportSize({ width: w, height: 400 });
      await p.setContent(html);
      await p.screenshot({ path: `${out}dock-${w}.png`, fullPage: true });
    }
    await p.close();
  }
  console.log(fails ? `${fails} FAIL` : 'all PASS');
  await b.close();
})();
