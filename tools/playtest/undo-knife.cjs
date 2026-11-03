// After DESIGN §31: undo, names on tap, two ways to sauce and the knife, played with a finger.
// The page runs as a phone (390 x 844, dpr 2, hasTouch, isMobile), every gesture a real CDP touch
// sequence at a person's pace (see touch.cjs), the clock in real time.
//   Pinecrest: a tap on a bin only names it; a lettuce dragged onto a tray and undone (flies back to
//   its pan); a patty moved grill -> tray and undone (back on the grill, still cooking); ketchup the
//   tap way (tap bottle, tap burger, one stroke), undone; mustard the drag way (no sauce until the
//   nozzle is in over the bun).
//   Harbor City: a panini built on the board, cut the tap way (tap knife, tap panini, slice), moved
//   to a tray and undone back to the board; a second one cut the drag way (knife dragged onto it).
//   Port Amber: dough dragged onto the peel, cheese dragged on and undone, then the flatbread on
//   the board cut in four both ways.
// npm run build && npx vite preview --port 4175
// PORT=4175 NODE_PATH=$(npm root -g) node tools/playtest/undo-knife.cjs  ->  tools/playtest/shots-undo/
const path = require('path');
const fs = require('fs');
const out = process.env.OUT || path.join(__dirname, 'shots-undo') + '/';
fs.mkdirSync(out, { recursive: true });
const { start, sleep, jit } = require('./touch.cjs');
const fails = [];
const check = (ok, what, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail !== undefined ? ' ' + JSON.stringify(detail) : ''}`); if (!ok) fails.push(what); };

const plateKinds = (t) => t.ev(() => { const g = window.__bv.game; return g.slots[g.active].plate.layers.map((l) => l.piece.kind); });
const undoBtn = (t) => t.ev(() => { const b = document.querySelector('.undo-btn'); const r = b.getBoundingClientRect(); return { at: [r.x + r.width / 2, r.y + r.height / 2], disabled: b.disabled }; });
const items = (t) => t.ev(() => window.__bv.comal().items);
const lineOf = (x0, y0, x1, y1, n) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);

/** Press the header's Undo with a thumb; screenshot mid-flight. */
async function undo(t, shotName) {
  const b = await undoBtn(t);
  check(!b.disabled, 'undo button is on before undoing');
  await t.down(b.at[0] + jit(3), b.at[1] + jit(3));
  await sleep(70);
  await t.up();
  await sleep(150);
  const flying = await t.ev(() => window.__bv.flying());
  if (shotName) await t.shot(shotName);
  await sleep(650);
  return flying;
}

async function pinecrest() {
  const t = await start('pinecrest', out);
  const slot = await t.ev(() => window.__bv.game.active);
  const plate = await t.plate(slot);
  check((await undoBtn(t)).disabled, 'undo greyed at the start');
  await t.shot('p0-start');

  // Names on tap: a tap on the lettuce pan names it, places nothing.
  await t.tap(await t.hp('bin', { kind: 'lettuce' }));
  const bubble = await t.ev(() => window.__bv.bubble());
  await t.shot('p1-name-bubble');
  check(/lettuce/i.test(bubble ?? ''), 'tap on a pan shows its name', bubble);
  check((await plateKinds(t)).length === 0, 'tap placed nothing');
  check(await t.ev(() => window.__bv.counter.grillItems.length) === 0, 'nothing on the grill after the tap');

  // A topping dragged onto the tray, then undone: it flies back to its pan.
  await t.drag(await t.hp('bin', { kind: 'bun' }), plate);
  await t.drag(await t.hp('bin', { kind: 'lettuce' }), plate);
  check(JSON.stringify(await plateKinds(t)) === '["bun","lettuce"]', 'bun and lettuce on the tray', await plateKinds(t));
  await t.shot('p2-lettuce-on-tray');
  const flew = await undo(t, 'p3-undo-lettuce-flying');
  check(flew, 'the lettuce flies back');
  check(JSON.stringify(await plateKinds(t)) === '["bun"]', 'undo took the lettuce off', await plateKinds(t));
  await t.shot('p4-undo-lettuce-done');

  // A patty grill -> tray, undone: back on the grill, its cooking kept.
  const z = await t.ev(() => window.__bv.counter.zonePoint(1).toArray());
  await t.drag(await t.hp('bin', { kind: 'patty' }), await t.proj(z));
  await sleep(4500);
  let pat = (await items(t)).find((i) => i.kind === 'patty');
  const at0 = pat.at;
  await t.drag(await t.proj(pat.at), plate);
  const cookOnTray = await t.ev(() => { const g = window.__bv.game; const l = g.slots[g.active].plate.layers.find((l) => l.piece.kind === 'patty'); return l && window.__bv.cookLevel(l.piece); });
  check(JSON.stringify(await plateKinds(t)) === '["bun","patty"]', 'patty on the tray', await plateKinds(t));
  await t.shot('p5-patty-on-tray');
  check(await undo(t, 'p6-undo-patty-flying'), 'the patty flies back');
  pat = (await items(t)).find((i) => i.kind === 'patty');
  check(!!pat && Math.hypot(pat.at[0] - at0[0], pat.at[2] - at0[2]) < 0.15, 'the patty is back where it was on the grill', pat && pat.at);
  check(!!pat && pat.cook >= cookOnTray - 1e-6, 'its cooking is kept', { tray: cookOnTray, back: pat && pat.cook });
  check(JSON.stringify(await plateKinds(t)) === '["bun"]', 'the tray has just the bun again');
  await t.shot('p7-undo-patty-done');
  // Back to the tray for the sauces.
  await t.drag(await t.proj(pat.at), plate);

  // Ketchup, the tap way: tap the bottle, tap the burger, one stroke.
  await t.tap(await t.hp('bottle', { sauce: 'ketchup' }));
  const armed = await t.ev(() => window.__bv.sauceState());
  await t.shot('p8-ketchup-armed', { hint: true });
  check(armed.armed === 'ketchup', 'a tap on the bottle lifts it to wait', armed);
  await t.tap(plate);
  await sleep(450);
  const open = await t.ev(() => window.__bv.sauceState());
  check(open.open && open.open.how === 'tap', 'a tap on the burger opens the close-up', open);
  await t.shot('p9-ketchup-open');
  const [cx, cy, side] = await t.ev(() => window.__bv.sauceCentre());
  const ring = [];
  for (let i = 0; i <= 44; i++) { const a = i * 0.36, r = side * Math.min(0.36, 0.06 + i * 0.008); ring.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r + 34]); }
  await t.down(...ring[0]);
  await t.path(ring.slice(1, 30), 16);
  await t.shot('p10-ketchup-stroke');
  await t.path(ring.slice(30), 16);
  await t.up();
  await sleep(600);
  const after = await t.ev(() => ({ s: window.__bv.sauceState(), kinds: (() => { const g = window.__bv.game; return g.slots[g.active].plate.layers.map((l) => `${l.piece.kind}${l.piece.stroke ? ':' + l.piece.stroke.length : ''}`); })() }));
  check(!after.s.open, 'one stroke, then it closes', after.s);
  check(after.kinds.some((k) => /^ketchup:\d+/.test(k) && +k.split(':')[1] > 5), 'ketchup went on', after.kinds);
  await t.shot('p11-ketchup-done');
  await undo(t, null);
  const noK = await plateKinds(t);
  check(!noK.includes('ketchup'), 'undo takes the squeeze back off', noK);

  // Mustard, the drag way: the thumb comes in over the near edge; nothing lands until it's over the bun.
  const bt = await t.hp('bottle', { sauce: 'mustard' });
  const pts = [...lineOf(bt[0], bt[1], cx + side * 0.05, cy + side * 0.62 + 34, 14), ...lineOf(cx + side * 0.05, cy + side * 0.62 + 34, cx, cy + 34, 18)];
  for (let k = 0; k <= 6; k++) pts.push(...lineOf(...pts[pts.length - 1], cx + (k % 2 ? 0.32 : -0.32) * side, cy - 0.25 * side + k * 0.09 * side + 34, 8).slice(1));
  await t.down(...pts[0]);
  await t.path(pts.slice(1, 40), 18);
  await t.shot('p12-mustard-drag');
  await t.path(pts.slice(40), 18);
  await t.up();
  await sleep(500);
  const must = await t.ev(() => { const g = window.__bv.game; const l = g.slots[g.active].plate.layers.find((l) => l.piece.kind === 'mustard'); return l && { n: l.piece.stroke.length, r0: Math.hypot(l.piece.stroke[0].x + l.offX, l.piece.stroke[0].z + l.offZ), rmax: Math.max(...l.piece.stroke.map((p) => Math.hypot(p.x + l.offX, p.z + l.offZ))) }; });
  check(!!must && must.n > 5, 'mustard went on the drag way', must);
  check(!!must && must.r0 < 0.72, 'no mustard on the near edge on the way in (first drop inside the grace)', must);
  await t.shot('p13-mustard-done');
  await t.b.close();
}

async function harbor() {
  const t = await start('harbor', out);
  const board = async () => (await t.ev(() => window.__bv.press().board));
  const build = async () => {
    for (const k of ['ciabatta', 'mozzarella', 'ciabatta']) await t.drag(await t.hp('bin', { kind: k }), await t.proj((await t.ev(() => window.__bv.counter.boardPoint().toArray()))));
  };
  await t.tap(await t.hp('bin', { kind: 'mozzarella' }));
  const bub = await t.ev(() => window.__bv.bubble());
  check(/mozzarella/i.test(bub ?? ''), 'tap on mozzarella names it', bub);
  await t.shot('h0-name-mozzarella');
  await build();
  const b0 = await board();
  check(b0 && b0.layers.join() === 'ciabatta,mozzarella,ciabatta', 'panini built on the board', b0);
  await t.shot('h1-panini-on-board');

  // The tap way: tap the knife, tap the panini, slice across.
  await t.tap(await t.hp('knife'));
  check((await t.ev(() => window.__bv.knife())).armed, 'a tap lifts the knife');
  await t.shot('h2-knife-lifted', { hint: true });
  await t.tap(await t.proj(b0.at));
  await sleep(450);
  let k = await t.ev(() => window.__bv.knife());
  check(k.view && k.view.how === 'tap' && k.view.need === 1, 'a tap on the panini opens the cut view', k.view);
  await t.shot('h3-cut-view');
  const [sx, sy, sw, sh] = k.square;
  const slice = lineOf(sx + sw * 0.04, sy + sh * 0.52, sx + sw * 0.96, sy + sh * 0.49, 26);
  await t.down(...slice[0]);
  await t.path(slice.slice(1, 15), 18);
  await t.shot('h4-slicing');
  await t.path(slice.slice(15), 18);
  await sleep(120);
  k = await t.ev(() => window.__bv.knife());
  await t.shot('h5-cut-made');
  await t.up();
  await sleep(1000);
  const cut1 = await t.ev(() => window.__bv.counter.board.layers.map((l) => ({ kind: l.piece.kind, cut: !!l.piece.cut, q: l.piece.cutQ })));
  check(cut1[0].cut && cut1[2].cut, 'panini cut in half', { made: k.view && k.view.made, cut1 });
  check(!(await t.ev(() => window.__bv.knife())).view, 'the cut view closes after the cut');
  await t.shot('h6-panini-cut');

  // To a tray, then undo: back onto the board.
  const slot = await t.ev(() => window.__bv.game.active);
  await t.drag(await t.proj(b0.at), await t.plate(slot));
  check((await plateKinds(t)).join() === 'ciabatta,mozzarella,ciabatta', 'cut panini on the tray', await plateKinds(t));
  check(await undo(t, 'h7-undo-panini-flying'), 'the panini flies back');
  const back = await board();
  check(back && back.layers.length === 3 && (await plateKinds(t)).length === 0, 'undo put it back on the board', back);
  await t.shot('h8-panini-back-on-board');
  // Off to the tray again, then a second panini cut the drag way.
  await t.drag(await t.proj(b0.at), await t.plate(slot));
  await build();
  const kn = await t.hp('knife');
  const bp = await t.proj(b0.at);
  await t.down(kn[0], kn[1]);
  await sleep(90);
  await t.move(bp[0] + 22, bp[1] - 2, 380);
  await sleep(300);
  k = await t.ev(() => window.__bv.knife());
  check(k.view && k.view.how === 'drag', 'the knife dragged onto the panini opens the cut view', k.view);
  await t.shot('h9-knife-dragged-in');
  const [qx, qy, qw, qh] = k.square;
  await t.path(lineOf(t.at[0], t.at[1], qx + qw * 0.03, qy + qh * 0.5, 20), 18);
  await sleep(100);
  k = await t.ev(() => window.__bv.knife());
  await t.shot('h10-drag-cut-made');
  await t.up();
  await sleep(900);
  const cut2 = await t.ev(() => window.__bv.counter.board.layers.map((l) => ({ kind: l.piece.kind, cut: !!l.piece.cut, q: l.piece.cutQ })));
  check(cut2[0].cut && cut2[2].cut, 'panini cut the drag way', { made: k.view && k.view.made, cut2 });
  await t.b.close();
}

async function portamber() {
  const t = await start('portamber', out);
  const oven = () => t.ev(() => window.__bv.oven());
  let o = await oven();
  await t.tap(await t.proj(o.dough));
  const bub = await t.ev(() => window.__bv.bubble());
  check(/dough/i.test(bub ?? '') && !(await oven()).peel.layers.length, 'a tap on the dough names it, places nothing', bub);
  await t.shot('a0-name-dough');
  await t.drag(await t.proj(o.dough), await t.proj(o.peel.at));
  o = await oven();
  check(o.peel.layers.length === 1, 'dough dragged onto the peel', o.peel.layers.map((l) => l.kind));
  for (let i = 0; i < 2; i++) await t.drag(await t.hp('bin', { kind: 'mozzarella' }), await t.proj((await oven()).peel.at));
  o = await oven();
  check(o.peel.layers.filter((l) => l.kind === 'mozzarella').length === 2, 'two cheeses dragged on', o.peel.layers.map((l) => l.kind));
  await t.shot('a1-cheese-on-pie');
  check(await undo(t, 'a2-undo-cheese-flying'), 'the cheese flies back');
  o = await oven();
  check(o.peel.layers.filter((l) => l.kind === 'mozzarella').length === 1, 'undo took one cheese off', o.peel.layers.map((l) => l.kind));
  // Skip the bake (oven-peel.cjs plays it): the pie, baked, on the board.
  await t.ev(() => { const c = window.__bv.counter; const ls = c.peel.layers; ls[0].piece.cook = [0.6, 0.6]; ls[0].piece.rim = [0.6, 0.6, 0.6, 0.6]; c.setPeel([]); c.setRest(ls); });
  o = await oven();
  check(o.rest.board && o.rest.layers.length >= 1, 'flatbread on the board', o.rest);
  await t.shot('a3-flatbread-on-board');

  // The tap way: knife, flatbread, two slices.
  await t.tap(await t.hp('knife'));
  await t.tap(await t.proj(o.rest.at));
  await sleep(450);
  let k = await t.ev(() => window.__bv.knife());
  check(k.view && k.view.need === 2, 'cut view open for a flatbread, two cuts wanted', k.view);
  await t.shot('a4-cut-view');
  let [sx, sy, sw, sh] = k.square;
  await t.down(sx + sw * 0.05, sy + sh * 0.51);
  await t.path(lineOf(sx + sw * 0.05, sy + sh * 0.51, sx + sw * 0.95, sy + sh * 0.5, 24).slice(1), 18);
  await t.up();
  await sleep(250);
  await t.shot('a5-first-cut');
  await t.down(sx + sw * 0.5, sy + sh * 0.05);
  await t.path(lineOf(sx + sw * 0.5, sy + sh * 0.05, sx + sw * 0.52, sy + sh * 0.95, 24).slice(1, 14), 18);
  await t.shot('a6-second-slice');
  await t.path(lineOf(sx + sw * 0.5, sy + sh * 0.05, sx + sw * 0.52, sy + sh * 0.95, 24).slice(14), 18);
  await sleep(100);
  k = await t.ev(() => window.__bv.knife());
  await t.shot('a7-in-four');
  await t.up();
  await sleep(900);
  o = await oven();
  check(o.rest.layers[0].cuts === 2, 'flatbread cut in four the tap way', { cuts: o.rest.layers[0].cuts, made: k.view && k.view.made, q: await t.ev(() => window.__bv.counter.rest.layers[0].piece.cutQ) });
  await t.shot('a8-flatbread-quarters');

  // The drag way, on a fresh one: the knife dragged onto it and on across, then once more.
  await t.ev(() => { const c = window.__bv.counter; c.rest.layers[0].piece.cuts = 0; c.updatePie(c.rest); });
  const kn = await t.hp('knife');
  const bp = await t.proj(o.rest.at);
  await t.down(kn[0], kn[1]);
  await sleep(90);
  await t.move(bp[0] + 40, bp[1] + 30, 420);
  await sleep(300);
  k = await t.ev(() => window.__bv.knife());
  check(k.view && k.view.how === 'drag', 'the knife dragged onto the flatbread opens the cut view', k.view);
  await t.shot('a9-drag-in');
  [sx, sy, sw, sh] = k.square;
  await t.path(lineOf(t.at[0], t.at[1], sx + sw * 0.04, sy + sh * 0.2, 22), 18);
  await t.up();
  await sleep(250);
  await t.down(sx + sw * 0.15, sy + sh * 0.1);
  await t.path(lineOf(sx + sw * 0.15, sy + sh * 0.1, sx + sw * 0.85, sy + sh * 0.92, 24).slice(1), 18);
  await sleep(100);
  k = await t.ev(() => window.__bv.knife());
  await t.shot('a10-drag-second');
  await t.up();
  await sleep(900);
  o = await oven();
  check(o.rest.layers[0].cuts === 2, 'flatbread cut in four the drag way', { cuts: o.rest.layers[0].cuts, made: k.view && k.view.made });
  await t.b.close();
}

(async () => {
  const only = process.env.ONLY || 'pha';
  if (only.includes('p')) await pinecrest();
  if (only.includes('h')) await harbor();
  if (only.includes('a')) await portamber();
  console.log(fails.length ? `FAILED ${fails.length}: ${fails.join('; ')}` : 'ALL OK');
  process.exit(fails.length ? 1 : 0);
})();
