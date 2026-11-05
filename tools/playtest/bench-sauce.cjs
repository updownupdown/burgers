// Sauce on the press after build #87 (DESIGN §40): drag the aioli bottle over bread in an open
// press bay and the counter close-up opens on it, as on a tray; the line drawn there is scored by
// coverage. Then the same with a burger on the tray (the finger rests a moment over the bay).
// PORT=4175 node tools/playtest/bench-sauce.cjs  ->  out/bench-*.png, PASS/FAIL lines
const { open, step, line, out, enterShift } = require('./lib.cjs');
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor'];
const save = (town, shiftsIn) => ({
  tutorialDone: true, town, day: 20, time: 'morning', unlocked: ALL, passedTowns: ALL,
  shiftsIn, bank: 300, popularity: 60, found: [], bonuses: [],
});
(async () => {
  const { b, p } = await open({ w: 390, h: 844, dpr: 1 });
  const ev = (f, a) => p.evaluate(f, a);
  const fire = (t, x, y) => ev(([t, x, y]) => document.getElementById('gl').dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, pointerId: 7, bubbles: true, pointerType: 'touch', isPrimary: true })), [t, x, y]);
  const drag = async (pts, ms = 16) => {
    await fire('pointerdown', ...pts[0]);
    for (const q of pts.slice(1)) { await p.waitForTimeout(ms); await fire('pointermove', ...q); }
    await p.waitForTimeout(ms);
    await fire('pointerup', ...pts[pts.length - 1]);
    await step(p, 0.4);
  };
  const hp = (type, f = {}) => ev(([type, f]) => {
    const c = window.__bv.counter;
    const m = c.hitMeshes.find((h) => h.userData.hit.type === type && Object.entries(f).every(([k, v]) => h.userData.hit[k] === v));
    if (!m) throw new Error('no proxy ' + type + JSON.stringify(f));
    return window.__bv.project('counter', m.position.x, m.position.y, m.position.z);
  }, [type, f]);
  const proj = (v) => ev((v) => window.__bv.project('counter', v[0], v[1], v[2]), v);
  const plate = (i) => ev((i) => { const b = window.__bv.trayView.plates[i].burger; b.updateWorldMatrix(true, false); const e = b.matrixWorld.elements; return window.__bv.project('tray', e[12], 0.3, e[14]); }, i);
  const check = (ok, what) => console.log(ok ? 'PASS' : 'FAIL', what);
  const cov = () => ev(() => { const c = window.__bv.counter; const ls = c.bays[0].layers; const t = ls[ls.length - 1]; return { kind: t && t.piece.kind, n: t && t.piece.stroke ? t.piece.stroke.length : 0, layers: ls.length }; });

  // 1. Harbor City, an empty tray: bread in bay 0, then aioli dragged onto it.
  await p.evaluate((s) => localStorage.setItem('bv-save-v1', JSON.stringify(s)), save('harbor', Object.fromEntries(ALL.map((t) => [t, 3]))));
  await p.reload();
  await p.waitForTimeout(800);
  await enterShift(p);
  await ev(() => window.__bv.manual(true));
  await step(p, 1.5);
  const pr = await ev(() => window.__bv.press());
  const [bx, by] = await proj(pr.bays[0].plate);
  const [cx, cy] = await hp('bin', { kind: 'ciabatta' });
  await drag(line(cx, cy, bx, by, 12));
  const run = async (tag, rest) => {
    const bt = await hp('bottle', { sauce: 'aioli' });
    await fire('pointerdown', ...bt);
    for (const q of line(bt[0], bt[1], bx, by, 10)) { await p.waitForTimeout(16); await fire('pointermove', ...q); }
    if (rest) { await p.waitForTimeout(300); await fire('pointermove', bx + 1, by); }
    await step(p, 0.5);
    const st = await ev(() => window.__bv.sauceState());
    check(st.open && st.open.locked, `${tag}: the close-up locks on the bay (${JSON.stringify(st.open)})`);
    // Draw a zigzag in the zoomed square (the nozzle rides 34px above the finger).
    const r = await ev(() => { const el = document.querySelector('.sauce-ui'); const q = el.getBoundingClientRect(); return [q.x, q.y, q.width, q.height, el.hidden]; });
    check(!r[4] && r[2] > 150, `${tag}: the zoom square is up, ${Math.round(r[2])}px`);
    let at = [bx, by];
    for (let z = 0; z <= 6; z++) {
      const q = [r[0] + r[2] * (z % 2 ? 0.7 : 0.3), r[1] + r[3] * (0.3 + z * 0.07) + 34];
      for (const s of line(at[0], at[1], q[0], q[1], 8)) { await p.waitForTimeout(8); await fire('pointermove', ...s); }
      at = q;
    }
    await step(p, 0.05);
    await p.screenshot({ path: `${out}bench-${tag}-zoom.png` });
    await fire('pointerup', ...at);
    await step(p, 0.6);
    const c = await cov();
    check(c.kind === 'aioli' && c.n > 10, `${tag}: aioli drawn on the bread (${JSON.stringify(c)})`);
    await p.screenshot({ path: `${out}bench-${tag}-after.png` });
  };
  await run('empty-tray', false);
  // Undo takes the squeeze off again.
  await ev(() => window.__bv.undo && window.__bv.undo());
  // 2. With bread on the tray too: rest over the bay a moment.
  const [px, py] = await plate(0);
  await drag(line(cx, cy, px, py, 10));
  await run('busy-tray', true);

  // 3. Saltwater Bay after Harbor City: the board is out.
  await p.evaluate((s) => localStorage.setItem('bv-save-v1', JSON.stringify(s)), save('saltwater', { saltwater: 1, harbor: 1 }));
  await p.reload();
  await p.waitForTimeout(800);
  await enterShift(p);
  await ev(() => window.__bv.manual(true));
  await step(p, 1.5);
  const board = await ev(() => !!window.__bv.counter.board && window.__bv.counter.board.on);
  check(board, 'Saltwater Bay has the board once Harbor City has been worked');
  await p.screenshot({ path: `${out}bench-saltwater-board.png` });
  await b.close();
})();
