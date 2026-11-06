// The graphics polish after build #89 (DESIGN §45), shot in the real game at 390x844 @2x:
// walnut boards (burnt food, the cola cup), pies uncut / cut / with the ticket folded, the hearth
// oven, the grille with bacon and buns on its bars, pressed chicken and the veggie patty through
// their cooks, the window in each area (haze, inner shadow, movers, every hat), golden hour, the
// packing pads and the ink chute. Prints draw calls per frame with and without customers.
// PORT=4193 [ONLY=trays,pies,oven,grille,press,window,gold,fryer] [OUT=dir/] node tools/playtest/graphics45-shots.cjs
const { chromium } = require('playwright');
const path = require('path');
const out = process.env.OUT || path.join(__dirname, 'out') + '/';
require('fs').mkdirSync(out, { recursive: true });
const ONLY = (process.env.ONLY || 'trays,pies,oven,grille,press,window,gold,fryer').split(',');
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor', 'redmesa', 'cactus', 'sunvalley', 'applecross', 'larkvale', 'portamber'];
const save = (town) => ({
  tutorialDone: true, town, day: 30, time: 'morning', unlocked: ALL, passedTowns: ALL,
  shiftsIn: Object.fromEntries(ALL.map((t) => [t, 3])), bank: 300, popularity: 60, found: [], bonuses: [],
});

async function start(town) {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
  // Count draw calls (for the bean bake).
  await p.addInitScript(() => {
    window.__dc = 0;
    for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const o = C.prototype[f];
      if (o) C.prototype[f] = function (...a) { window.__dc++; return o.apply(this, a); };
    }
  });
  await p.goto('http://localhost:' + (process.env.PORT || 4193) + '/');
  await p.waitForTimeout(600);
  await p.evaluate((s) => localStorage.setItem('bv-save-v1', JSON.stringify(s)), save(town));
  await p.reload();
  await p.waitForTimeout(800);
  await p.addStyleTag({ content: `.hint,.coach{display:none !important}` });
  await p.click('[data-home=open]');
  await p.waitForTimeout(700);
  if (await p.$('[data-act=open]')) await p.click('[data-act=open]');
  await p.waitForTimeout(200);
  await p.evaluate(() => window.__bv.manual(true));
  await step(p, 1.2);
  return { b, p };
}
const step = (p, s) => p.evaluate((s) => window.__bv.step(s), s);
async function shot(p, name, band, pad = 0) {
  await step(p, 0.05);
  await p.waitForTimeout(150);
  const r = await p.evaluate((band) => window.__bv.bands[band], band);
  await p.screenshot({ path: `${out}${name}.png`, clip: { x: r.x, y: Math.max(0, r.y - pad), width: r.w, height: r.h + pad * 2 } });
  console.log('shot', name);
}

// Orders and plates straight onto the trays (as tray-shots.cjs does).
async function trays(p, plates, active = 1, boost = [1, 1, 1]) {
  await p.evaluate(([plates, active, boost]) => {
    const g = window.__bv.game;
    const base = { price: 9, mods: [], friesSize: 'M', drinkSize: 'M', ice: null, layers: [{ kind: 'bun' }], fries: false, drink: null };
    plates.forEach((pl, i) => {
      const s = g.slots[i];
      const o = { ...base, id: 100 + i, name: 'T' + i, fries: !!pl.fries, drink: pl.drink ? pl.drink.flavor : null };
      Object.assign(s, { order: o, leaving: false, maxPatience: 900, patience: 800, ticketKey: '', plate: { layers: pl.layers, fries: pl.fries || null, drink: pl.drink || null } });
      const pv = window.__bv.trayView.plates[i];
      pv.setDish(pl.layers.length > 0);
      pv.setWants(!!pl.fries, !!pl.drink);
      pv.sync(s.plate, false, () => {});
      pv.boost = boost[i];
    });
    g.active = active;
  }, [plates, active, boost]);
  await step(p, 1);
}
let uid = 9000;
const pc = (kind, cook = 0.55, extra = {}) => ({ piece: { uid: uid++, kind, cook: [cook, cook], melt: kind === 'cheese' || kind === 'mozzarella' ? 1 : undefined, marks: kind === 'patty' ? [0.9, 0] : undefined, ...extra }, offX: 0, offZ: 0 });

(async () => {
  if (ONLY.includes('trays')) {
    const { b, p } = await start('summit');
    await trays(p, [
      { layers: ['bun', 'patty', 'cheese', 'lettuce', 'tomato', 'bun'].map((k) => pc(k)), fries: { cook: 0.72, size: 'M', fill: 1, salt: 0.6 }, drink: { flavor: 'cola', fill: 0.9, size: 'M', ice: true, lid: true } },
      { layers: [pc('bun', 1.1), pc('patty', 1.15), pc('bun', 1.1)], fries: { cook: 1.1, size: 'M', fill: 1, salt: 0 }, drink: null },
      { layers: [], fries: { cook: 0.72, size: 'L', fill: 1, salt: 0.6 }, drink: { flavor: 'cola', fill: 0.9, size: 'L', ice: true, lid: false } },
    ]);
    await shot(p, 'g45-trays-summit', 'tray');
    // Empty trays waiting for their food: the dashed marks on the walnut.
    await p.evaluate(() => {
      for (let i = 0; i < 3; i++) {
        const pv = window.__bv.trayView.plates[i];
        const s = window.__bv.game.slots[i];
        s.plate = { layers: [], fries: null, drink: null };
        pv.setDish(true);
        pv.setWants(true, true);
        pv.sync(s.plate, false, () => {});
      }
    });
    await step(p, 1);
    await shot(p, 'g45-trays-marks', 'tray');
    await b.close();
    const h = await start('harbor');
    await trays(h.p, [
      { layers: [pc('ciabatta', 0.6), pc('chicken', 0.62), pc('mozzarella'), pc('basil'), pc('ciabatta', 0.6)], fries: null, drink: { flavor: 'cola', fill: 0.9, size: 'M', ice: true, lid: true } },
      { layers: [pc('sourdough', 0.62), pc('veggie', 0.6), pc('cheddar'), pc('sourdough', 0.62)], fries: { cook: 0.72, size: 'M', fill: 1, salt: 0.6 }, drink: null },
      { layers: [pc('sourdough', 1.1), pc('chicken', 1.1), pc('sourdough', 1.1)], fries: null, drink: null },
    ]);
    await shot(h.p, 'g45-trays-harbor', 'tray');
    await h.b.close();
  }
  if (ONLY.includes('pies') || ONLY.includes('oven')) {
    const { b, p } = await start('applecross');
    const pie = (cook, cuts = 0, tops = ['redsauce', 'mozzarella', 'mushroom']) => [pc('dough', cook, { rim: Array(8).fill(cook), cuts }), ...tops.map((k) => pc(k, cook))];
    if (ONLY.includes('pies')) {
      // Uncut, cut four ways, and uncut with its ticket folded (the tray zoom no longer applies).
      await trays(p, [{ layers: pie(0.6) }, { layers: pie(0.6, 2) }, { layers: pie(0.62, 0, ['oil', 'ham', 'fig']) }], 1, [1, 1, 1.3]);
      await shot(p, 'g45-pies-trays', 'tray');
    }
    if (ONLY.includes('oven')) {
      await p.evaluate(() => {
        const c = window.__bv.counter;
        let u = 9500;
        const l = (kind, cook, x = {}) => ({ piece: { uid: u++, kind, cook: [cook, cook], melt: kind === 'mozzarella' ? 0.6 : undefined, ...x }, offX: 0, offZ: 0 });
        const pies = [[l('dough', 0.1, { rim: Array(8).fill(0.1) }), l('redsauce', 0.1), l('mozzarella', 0.1)], [l('dough', 0.55, { rim: Array(8).fill(0.55) }), l('oil', 0.5), l('pear', 0.5), l('blue', 0.5)], [l('dough', 0.8, { rim: Array(8).fill(0.8) }), l('redsauce', 0.8), l('mozzarella', 0.8), l('mushroom', 0.8)]];
        for (let i = 0; i < Math.min(c.ovenCount, pies.length); i++) c.setSpot(i, pies[i]);
      });
      await shot(p, 'g45-oven', 'counter');
    }
    await b.close();
  }
  if (ONLY.includes('grille')) {
    const { b, p } = await start('summit');
    await p.evaluate(() => {
      const c = window.__bv.counter;
      const x0 = c.world(1, 0, 0, 0).x;
      const [g, f] = [0, 1].map((i) => c.zonePoint(i).x - x0);
      let u = 9700;
      const P = (kind, cook) => ({ uid: u++, kind, cook: [cook, cook], marks: kind === 'patty' ? [0.6, 0] : undefined });
      // The grille zone (left), and the flat plate (middle) for comparison.
      c.addGrillItem(P('bacon', 0.5), g - 0.3, -0.75);
      c.addGrillItem(P('bacon', 0.7), g + 0.35, -0.7);
      c.addGrillItem(P('bun', 0.4), g - 0.3, 0.3);
      c.addGrillItem(P('patty', 0.5), g + 0.4, 0.35);
      c.addGrillItem(P('bacon', 0.5), f, -0.7);
      c.addGrillItem(P('bun', 0.4), f, 0.3);
    });
    const items = await p.evaluate(() => window.__bv.counter.grillItems.map((g) => [g.piece.kind, +g.x.toFixed(2), +g.obj.position.y.toFixed(3)]));
    console.log('grill items (kind, x, y):', JSON.stringify(items));
    await shot(p, 'g45-grille', 'counter');
    await b.close();
  }
  if (ONLY.includes('press')) {
    const { b, p } = await start('harbor');
    await p.evaluate(() => {
      const c = window.__bv.counter;
      c.bayCount = Math.max(c.bayCount, 2);
      let u = 9800;
      const L = (kind, cook) => ({ piece: { uid: u++, kind, cook: [cook, cook] }, offX: 0, offZ: 0 });
      // Raw, cooked through, perfect, dry: one stage per bay that's out.
      const stages = [0.15, 0.62, 0.9, 0.35];
      c.bays.slice(0, c.bayCount).forEach((bay, i) => c.setBay(bay, [L(i === 3 ? 'veggie' : 'chicken', stages[i % stages.length])]));
    });
    const n = await p.evaluate(() => window.__bv.counter.bayCount);
    console.log('bays', n);
    await shot(p, 'g45-press-chicken', 'counter');
    // Every cook stage on its own, in the first bay.
    for (const [i, t] of [0, 0.3, 0.45, 0.62, 0.8, 0.95, 1.05].entries()) {
      await p.evaluate(([t, i]) => {
        const c = window.__bv.counter;
        c.setBay(c.bays[0], [{ piece: { uid: 9900 + i, kind: 'chicken', cook: [t, t] }, offX: 0, offZ: 0 }]);
        c.setBay(c.bays[1], [{ piece: { uid: 9950 + i, kind: 'veggie', cook: [t, t] }, offX: 0, offZ: 0 }]);
      }, [t, i]);
      await shot(p, `g45-press-cook-${String(t).replace('.', '')}`, 'counter');
    }
    await b.close();
  }
  if (ONLY.includes('window')) {
    const { b, p } = await start('pinecrest');
    // When each area's mover is mid-view (seconds since the view was built).
    const kinds = { mountains: 7.1, beach: 0, desert: 5.1, orchard: 3 };
    // Two sets of customers: between them every hat in each area (hat = floor(seed / 3) % 5), and
    // seeds 9 and 19 wear the peach that replaced the khaki.
    const sets = { a: [1, 4, 7], b: [9, 12, 19] };
    for (const [kind, t] of Object.entries(kinds)) {
      for (const [tag, seeds] of [['', sets.a], ['-hats', sets.b], ['-empty', null]]) {
        await p.evaluate(([kind, seeds]) => {
          const v = window.__bv.customersView;
          v.setBackdrop(kind);
          for (let i = 0; i < 3; i++) {
            const fig = v.arrive(i, seeds ? seeds[i] : 1);
            fig.root.visible = !!seeds;
            v.slots[i].enterT = 1;
          }
        }, [kind, seeds]);
        await step(p, 1.5);
        await p.evaluate(([seeds, t]) => {
          const v = window.__bv.customersView;
          for (const s of v.slots) if (s.fig) s.fig.root.visible = !!seeds;
          v.moverT = t;
        }, [seeds, t]);
        await step(p, 0.05);
        const dc = await p.evaluate(() => { window.__dc = 0; window.__bv.step(0.001); return window.__dc; });
        console.log(`draw calls, whole frame, ${kind}${seeds ? ' 3 at the window' : ' empty window'}: ${dc}`);
        await shot(p, `g45-window-${kind}${tag}`, 'customers');
      }
      // A second frame for the mover, a few seconds on (the sails move with time stepped).
      await p.evaluate(([t, dt]) => { window.__bv.customersView.moverT = t + dt; }, [t, kind === 'desert' ? 1.5 : 4]);
      if (kind === 'beach') await step(p, 20);
      await shot(p, `g45-window-${kind}-later`, 'customers');
    }
    await b.close();
  }
  if (ONLY.includes('gold')) {
    const { b, p } = await start('cedarfalls');
    for (const f of [0.3, 0.75, 0.97]) {
      await p.evaluate((f) => { const g = window.__bv.game; g.time = g.shiftLength * f; }, f);
      await step(p, 0.1);
      await shot(p, `g45-gold-${Math.round(f * 100)}`, 'customers', 0);
    }
    // The sundown carries on from there (no jump back to noon).
    await p.evaluate(() => { const g = window.__bv.game; g.time = g.shiftLength; g.spawned = 99; g.customers = 0; g.line = []; for (const s of g.slots) { s.order = null; s.fig = null; } });
    await step(p, 0.1);
    console.log('phase after close', await p.evaluate(() => window.__bv.game.phase));
    await shot(p, 'g45-gold-sundown-start', 'customers');
    await step(p, 0.6);
    await shot(p, 'g45-gold-sundown-mid', 'customers');
    await b.close();
  }
  if (ONLY.includes('fryer')) {
    const { b, p } = await start('summit');
    await p.evaluate(() => {
      window.__bv.goToPage(2);
      // A carton of fries on the first pad, to see it stand on the paper.
      const c = window.__bv.counter;
      Object.assign(c.packs[0], { size: 'M', cook: 0.72, fill: 1, salt: 0.5 });
      c.syncPack(0);
    });
    await step(p, 1);
    await shot(p, 'g45-fryer-pads', 'counter');
    await b.close();
  }
})();
