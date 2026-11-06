// A shorter Prep and fewer chores (DESIGN §51): Prep opens folded, the fold stays open for the day,
// Lunch / Full day, an old slider window loading as the nearest choice, the evening drive to a far
// town with no lost day, the regular's name tag and ticket header, "N left to serve" while
// Closing and the walked-past count on the report card.
// PORT=4184 [OUT=dir/] node tools/playtest/prep51.cjs [prep,drive,regular,closing]
const { open, step, enterShift, out } = require('./lib.cjs');
const only = (process.argv[2] || '').split(',').filter(Boolean);
const want = (n) => !only.length || only.includes(n);
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor'];
const base = { town: 'saltwater', day: 5, time: 'morning', popularity: 43, bank: 135, tutorialDone: true, unlocked: ALL.slice(0, 5), shiftsIn: { pinecrest: 3, saltwater: 1 }, bonuses: ['bench', 'autostop', 'lamp'], found: ['bench', 'autostop', 'lamp'], picks: ['bench', 'lamp'] };
let fails = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); if (!ok) fails++; };

async function load(p, save) {
  await p.evaluate(({ s }) => {
    localStorage.clear();
    if (s) localStorage.setItem('bv-save-v1', JSON.stringify(s));
    localStorage.setItem('bv-coach', JSON.stringify({ on: false, done: [] }));
    localStorage.setItem('bv-welcomed', '1');
    localStorage.setItem('bv-difficulty', 'balanced');
  }, { s: save });
  await p.reload();
  await p.waitForTimeout(1400);
}
const tap = async (p, sel) => { await p.click(sel); await p.waitForTimeout(350); };

(async () => {
  const { b, p } = await open({ w: +(process.env.W || 390), h: +(process.env.H || 844), dpr: 2 });
  const shot = (n) => p.screenshot({ path: `${out}prep51-${n}.png` });

  if (want('prep')) {
    // An old save with a 9 to 5 slider window loads as a Full day.
    await load(p, { ...base, shift: { start: 9, end: 17 } });
    const sh = await p.evaluate(() => JSON.parse(localStorage.getItem('bv-save-v1')).shift);
    await p.click('[data-home=open]');
    await p.waitForTimeout(900);
    await shot('folded');
    const folded = await p.evaluate(() => ({
      menu: !!document.querySelector('.prep .prep-rows'),
      bonusList: !!document.querySelector('.prep .prep-bonuses'),
      brought: [...document.querySelectorAll('.prep .prep-brought .bv-chip')].map((e) => e.textContent.trim()),
      shift: document.querySelector('.prep [data-act=prep-shift][aria-pressed=true]')?.dataset.v,
      slider: !!document.querySelector('.prep input[type=range]'),
      height: document.querySelector('.prep .day-scroll').scrollHeight,
      view: document.querySelector('.prep .day-scroll').clientHeight,
    }));
    check('old 9 to 5 window shows as Full day', folded.shift === 'full', JSON.stringify(sh));
    check('Prep opens folded (no menu rows, no bonus list, no slider)', !folded.menu && !folded.bonusList && !folded.slider);
    check('folded Prep shows the bonuses brought last time', folded.brought.join() === 'Comfy bench,Heat lamp', folded.brought.join());
    check('folded Prep fits without much scrolling', folded.height <= folded.view + 140, `${folded.height} in ${folded.view}`);
    await tap(p, '.prep [data-act=prep-shift][data-v=lunch]');
    const lunch = await p.evaluate(() => ({ s: JSON.parse(localStorage.getItem('bv-save-v1')).shift, label: document.querySelector('.prep .prep-shift-label').textContent }));
    check('Lunch sets 11 to 3', lunch.s.start === 11 && lunch.s.end === 15, lunch.label);
    await tap(p, '.prep [data-act=prep-fold]');
    await shot('unfolded');
    const open1 = await p.evaluate(() => !!document.querySelector('.prep .prep-rows') && !!document.querySelector('.prep .prep-bonuses'));
    check('the fold opens the menu and the bonuses', open1);
    // Close Prep and come back: still unfolded today.
    await p.click('.prep [data-act=back]');
    await p.waitForTimeout(600);
    await p.click('[data-home=open]');
    await p.waitForTimeout(900);
    check('the fold stays open for the day', await p.evaluate(() => !!document.querySelector('.prep .prep-rows')));
    await p.evaluate(() => { const s = document.querySelector('.prep .day-scroll'); s.scrollTop = 9999; });
    await p.waitForTimeout(300);
    await shot('unfolded-end');
    // The next day it's folded again.
    await load(p, { ...base, day: 6 });
    await p.click('[data-home=open]');
    await p.waitForTimeout(900);
    check('folded again on another day', await p.evaluate(() => !document.querySelector('.prep .prep-rows')));
    // Full day: a longer, busier shift.
    const lunchN = await p.evaluate(() => +document.querySelector('.prep-expect .num').textContent);
    await tap(p, '.prep [data-act=prep-shift][data-v=full]');
    const fullN = await p.evaluate(() => +document.querySelector('.prep-expect .num').textContent);
    await shot('fullday');
    check('Full day expects more people', fullN > lunchN, `${lunchN} -> ${fullN}`);
    await p.click('[data-act=open]');
    await p.waitForTimeout(300);
    const g = await p.evaluate(() => ({ shift: window.__bv.game.shift, len: window.__bv.game.shiftLength }));
    check('the shift opens 10 to 4', g.shift.start === 10 && g.shift.end === 16, `${Math.round(g.len)} s`);
  }

  if (want('drive')) {
    // Evening at Pinecrest, day 7: Harbor City is far down the coast, and the drive is tonight.
    await load(p, { ...base, town: 'pinecrest', time: 'evening', day: 7, unlocked: ALL });
    for (let i = 0; i < 4; i++) { await p.click('[data-home=zoom-out]'); await p.waitForTimeout(350); }
    const harbor = await p.$('.home-town[data-town=harbor] circle');
    const bb = await harbor.boundingBox();
    await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await p.waitForTimeout(800);
    const label = await p.evaluate(() => document.querySelector('[data-home=drive]')?.textContent.trim());
    await shot('drive-sheet');
    check('a far town drives tonight', /tonight/.test(label || ''), label);
    await p.click('[data-home=drive]');
    await p.waitForTimeout(2600);
    const sv = await p.evaluate(() => JSON.parse(localStorage.getItem('bv-save-v1')));
    check('arrives the same evening, same day', sv.town === 'harbor' && sv.time === 'evening' && sv.day === 7, `${sv.town} ${sv.time} day ${sv.day}`);
    await shot('drive-arrived');
  }

  if (want('regular')) {
    // Pinecrest on its second shift: the regular is the third customer.
    await load(p, { ...base, town: 'pinecrest', shiftsIn: { pinecrest: 1 }, picks: [] });
    await enterShift(p);
    await p.evaluate(() => window.__bv.manual(true));
    let reg = null;
    for (let i = 0; i < 160 && !reg; i++) {
      await step(p, 1);
      // Serve nobody; call people up as they come so the regular reaches the window.
      reg = await p.evaluate(() => {
        const g = window.__bv.game;
        const k = g.slots.findIndex((s) => s.order && s.regular);
        return k >= 0 ? k : null;
      });
      if (reg === null) await p.evaluate(() => { const b = document.querySelector('.tray-call:not([hidden])'); if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    }
    await p.waitForTimeout(300);
    await shot('regular');
    const tag = await p.evaluate(() => ({ tag: [...document.querySelectorAll('.regular-tag')].filter((e) => !e.hidden).map((e) => e.textContent.trim()), head: [...document.querySelectorAll('.ticket .tk-regular, .ticket [data-regular]')].map((e) => e.textContent.trim()) }));
    check('the regular has a name tag over them', reg !== null && tag.tag.length === 1, JSON.stringify(tag));
    check("the ticket header says whose usual it is", tag.head.some((t) => /usual/.test(t)), JSON.stringify(tag.head));
  }

  if (want('closing')) {
    // A busy Summit City shift, played by nobody: Closing shows how many are left, the report card who walked past.
    await load(p, { ...base, town: 'summit', shiftsIn: { summit: 2 }, popularity: 80, picks: [] });
    await enterShift(p);
    await p.evaluate(() => window.__bv.manual(true));
    let seen = '';
    for (let i = 0; i < 600; i++) {
      await step(p, 1);
      const st = await p.evaluate(() => ({ t: window.__bv.game.time, len: window.__bv.game.shiftLength, phase: window.__bv.game.phase, left: document.querySelector('.hud-left')?.textContent?.trim() || '', hidden: document.querySelector('.hud-left')?.hidden }));
      if (st.t > st.len && st.left && !st.hidden && !seen) {
        seen = st.left;
        await p.waitForTimeout(200);
        await shot('closing');
      }
      if (st.phase !== 'playing') break;
    }
    check('Closing shows "N left to serve"', /left to serve/.test(seen), seen);
    await p.waitForTimeout(4500);
    for (let i = 0; i < 10 && !(await p.$('.report')); i++) {
      await p.mouse.click(195, 400);
      await p.waitForTimeout(800);
    }
    await p.waitForTimeout(2500);
    await shot('report');
    const row = await p.evaluate(() => [...document.querySelectorAll('.report *')].map((e) => e.textContent).find((t) => /walked past/.test(t)) || '');
    check('the report card says how many walked past', /walked past/.test(row), row.slice(0, 80));
  }

  await b.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();
