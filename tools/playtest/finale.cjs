// The end of the trip, stamps and the postcard book (DESIGN §50), on a phone with touch.
// From a prepared save one shift short of Port Amber's first pass: the stamps on the map at 390 and
// 320 px, the postcard book (and Back closing it), Port Amber's sheet and Prep (signature dish first),
// the pass ("Road done"), sleep, the last night on the dock and Prep, the trip card, the night's
// report over it, the drive-off, the credits and Start trip 2 (looks and stamps kept, popularity 40,
// header "Trip 2"). A second run with reduced motion checks Back through the trip card and credits.
// Prints PASS/FAIL per check; screenshots to OUT (default tools/playtest/out/) as fin-*.png.
//   npm run build && npx vite preview --port 4183 &
//   PORT=4183 [OUT=dir/] node tools/playtest/finale.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const out = process.env.OUT || path.join(__dirname, 'out') + '/';
fs.mkdirSync(out, { recursive: true });
const url = 'http://localhost:' + (process.env.PORT || 4183) + '/';
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fails++; };

const towns = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor', 'redmesa', 'cactus', 'sunvalley', 'applecross', 'larkvale', 'portamber'];
const shiftsIn = Object.fromEntries(towns.filter((t) => t !== 'portamber').map((t) => [t, 3]));
const SAVE = {
  version: 2, town: 'portamber', day: 30, time: 'morning', driven: 0, last: null,
  unlocked: towns, passedTowns: towns.filter((t) => t !== 'portamber'), shiftsIn,
  bank: 5200, found: ['bench', 'autostop', 'lamp', 'guestbook', 'sear'], bonuses: ['bench', 'lamp'], picks: [], hidden: [],
  shift: { start: 11, end: 15 }, reviewCounts: [0, 1, 4, 20, 30], best: { pinecrest: 4.2, summit: 4.9, harbor: 4.5, cactus: 3.8 }, bestTakings: {},
  looks: ['sage', 'string', 'canoe'], look: { paint: 'sage', awning: 'mustard', roof: 'canoe', lights: 'string', wheels: 'steel', inflatable: 'flat', tag: 'solo' },
  tutorialDone: true, trips: 0, known: {}, popularity: 78, regulars: { pinecrest: 3, harbor: 3, cactus: 1 }, press: [],
  worked: 41, tripBest: { name: 'Lumberjack Stack', score: 97, town: 'summit' },
  fives: { 'Trailhead Classic': 5, Caprese: 3 },
};

async function open(opts = {}) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: opts.w || 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: opts.reduce ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { console.log('PAGEERR', e.message); fails++; });
  await p.goto(url);
  await p.evaluate((s) => {
    localStorage.setItem('bv-save-v1', JSON.stringify(s));
    localStorage.setItem('bv-coach', JSON.stringify({ on: false, done: [] }));
    localStorage.setItem('bv-welcomed', '1');
  }, SAVE);
  await p.reload();
  await p.waitForTimeout(1500);
  await p.addStyleTag({ content: '.hint{display:none!important}' });
  return { b, p };
}
const shot = (p, n) => p.screenshot({ path: `${out}fin-${n}.png` });
const tap = async (p, sel) => { await p.tap(sel); await p.waitForTimeout(600); };
/** Into a shift from the map, then straight to its end as a passed shift. */
async function playShift(p, name) {
  await tap(p, '.home-dock [data-home=open]');
  await p.waitForTimeout(300);
  await shot(p, `${name}-prep`);
  await tap(p, '[data-act=open]');
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    const g = window.__bv.game;
    g.stars.push(5, 5, 4, 5, 4, 5, 5, 4, 5, 5, 4, 5);
    g.served = 12; g.money += 160; g.tips += 30;
    g.customers = g.spawned; g.line.length = 0; g.time = g.shiftLength + 1;
    // Whoever is at the window gives up at once, so the closing doesn't wait on them.
    for (const s of g.slots) if (s.order) s.patience = 0.01;
  });
  // Tap through the sundown, then let the report (or trip) card come up.
  await p.waitForTimeout(900);
  await p.touchscreen.tap(200, 400);
  const t0 = Date.now();
  await p.waitForSelector('.report-card, .fin-card', { state: 'attached', timeout: 45000 }).catch(() => console.log('  (no card after 45 s)'));
  console.log('  card after', Date.now() - t0, 'ms');
  await p.waitForTimeout(600);
}
const back = async (p) => { await p.evaluate(() => history.back()); await p.waitForTimeout(500); };

(async () => {
  // ---- Run 1: the whole end, with motion.
  let { b, p } = await open();
  check(await p.$$eval('.home-town .stamp', (s) => s.length) > 10, 'stamps on the map nodes (seeded from the old save)');
  await shot(p, '01-map');
  check(!(await p.$('.home-brand .bv-eyebrow')), 'no Trip eyebrow on the first trip');
  await tap(p, '[data-home=book]');
  check(!!(await p.$('.menu-card.pc-book')), 'postcard book opens from the map header');
  const sum = await p.textContent('.pc-sum');
  check(/of \d+ stamps/.test(sum) && /of \d+ dishes/.test(sum), `book summary: ${sum.trim()}`);
  await shot(p, '02-book');
  await p.evaluate(() => document.querySelector('.pc-body').scrollTo(0, 99999));
  await p.waitForTimeout(200);
  await shot(p, '03-book-dishes');
  await back(p);
  check(!(await p.$('.menu-card.pc-book')), 'Back closes the postcard book');
  await tap(p, '.home-dock [data-home=here]');
  const sheet = await p.textContent('.home-sheet');
  check(/Known for its Calzone/.test(sheet), 'town sheet names the signature dish');
  check(!!(await p.$('.home-sheet .home-stamps')), 'town sheet shows its stamps');
  await shot(p, '04-sheet');
  await tap(p, '.home-sheet [data-home=book-town]');
  check(!!(await p.$('#pc-portamber.here')), 'sheet stamps open the book at the town');
  await back(p);
  await tap(p, '.home-sheet [data-home=close]');

  await playShift(p, '05-pass');
  const first = await p.$eval('.home-dock [data-home=open], .home-dock [data-home=sleep]', (e) => e.dataset.home).catch(() => '');
  check(!!(await p.$('.report-card')), 'first pass at Port Amber ends on the report card');
  await p.evaluate(() => { const b = [...document.querySelectorAll('.rep-sec-h')].find((x) => x.dataset.v === 'road'); b && b.click(); });
  await p.waitForTimeout(300);
  const road = await p.textContent('.report-card');
  check(/Road done/.test(road) && /last night of the trip/.test(road), 'road row: Road done, last night tomorrow');
  await shot(p, '06-report-road');
  await tap(p, '.report-card [data-rep=continue]');
  await tap(p, '.home-dock [data-home=sleep]');
  await p.waitForTimeout(4200);
  const dock = await p.textContent('.home-dock');
  check(/Last night of the trip/.test(dock), `morning dock shows the last night (${dock.replace(/\s+/g, ' ').trim()})`);
  await shot(p, '07-dock-last-night');
  await playShift(p, '08-finale');
  check(!!(await p.$('.menu-card.fin-card')), 'the last night ends on the trip card');
  check(!(await p.$('.report-card')), 'no report card in its place');
  const card = await p.textContent('.fin-card');
  check(/Lumberjack Stack/.test(card) && /Days/.test(card) && /Regulars won/.test(card), 'trip card shows days, best order, regulars');
  await shot(p, '09-trip-card');
  await p.evaluate(() => document.querySelector('.fin-body').scrollTo(0, 99999));
  await p.waitForTimeout(200);
  await shot(p, '10-trip-card-towns');
  await tap(p, '.fin-card [data-fin=report]');
  check(!!(await p.$('.report-card')), "the night's report opens over the trip card");
  await shot(p, '11-night-report');
  await tap(p, '.report-card [data-rep=continue]');
  check(!!(await p.$('.menu-card.fin-card')), 'closing it goes back to the trip card');
  await p.tap('.fin-card [data-fin=drive]');
  // Screenshots take a while at 2x: check the drive by the page's own clock, mid-way.
  const drive = await p.evaluate(() => new Promise((res) => setTimeout(() => res({ trail: !!document.querySelector('.home-trail'), moving: document.querySelector('.home-truck').getAnimations().length > 0, credits: !!document.querySelector('.fin-credits') }), 1600)));
  check(drive.trail, 'the trip trail is drawn on the map');
  check(drive.moving && !drive.credits, 'the truck drives off before the credits');
  await shot(p, '12-drive-off');
  await p.waitForSelector('.menu-card.fin-credits', { state: 'attached', timeout: 15000 }).catch(() => {});
  check(!!(await p.$('.menu-card.fin-credits')), 'credits after the drive-off');
  await p.waitForTimeout(3000);
  await shot(p, '14-credits');
  await tap(p, '.fin-credits [data-fin=trip2]');
  check(/Tap again/.test(await p.textContent('.fin-credits [data-fin=trip2]')), 'Start trip 2 asks once more');
  await tap(p, '.fin-credits [data-fin=trip2]');
  await p.waitForTimeout(800);
  const s2 = await p.evaluate(() => JSON.parse(localStorage.getItem('bv-save-v1')));
  check(s2.tripNo === 2 && s2.popularity === 40 && s2.town === 'pinecrest', `trip 2 starts at Pinecrest, popularity 40 (got ${s2.tripNo}, ${s2.popularity}, ${s2.town})`);
  check(s2.looks.includes('canoe') && s2.look.roof === 'canoe', 'looks kept');
  check(s2.stamps && s2.stamps.portamber && s2.stamps.portamber.event === 1, 'stamps kept, with the last night as Port Amber\'s event');
  check(s2.bank === 0 && s2.bonuses.length === 0, 'savings and bonuses reset');
  check(/Trip 2/.test(await p.textContent('.home-brand')), 'header says Trip 2');
  await shot(p, '15-trip2-map');
  await b.close();

  // ---- Run 2: reduced motion, Back through the end, at 320 px.
  ({ b, p } = await open({ reduce: true, w: 320 }));
  await shot(p, '20-map-320');
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('bv-save-v1'));
    s.passedTowns.push('portamber'); s.shiftsIn.portamber = 1; s.trips = 1; s.finale = { from: 30, done: false };
    localStorage.setItem('bv-save-v1', JSON.stringify(s));
  });
  await p.reload(); await p.waitForTimeout(1500);
  await p.addStyleTag({ content: '.hint{display:none!important}' });
  check(/Last night of the trip/.test(await p.textContent('.home-dock')), 'old-style save at Port Amber: the last night is offered');
  await shot(p, '21-dock-320');
  await playShift(p, '22-finale-320');
  check(!!(await p.$('.menu-card.fin-card')), 'reduced motion: trip card');
  await shot(p, '23-trip-card-320');
  await back(p);
  check(!(await p.$('.menu-card.fin-card')) && !!(await p.$('.menu-card.fin-credits')), 'Back on the trip card goes to the credits');
  check(await p.$eval('.fin-roll', (e) => getComputedStyle(e).animationName === 'none'), 'reduced motion: the credits stand still');
  await shot(p, '24-credits-320');
  await back(p);
  check(!(await p.$('.menu-card.fin-credits')), 'Back on the credits keeps touring');
  const s3 = await p.evaluate(() => JSON.parse(localStorage.getItem('bv-save-v1')));
  check(s3.finale && s3.finale.done && (s3.tripNo ?? 1) === 1 && s3.town === 'portamber', 'keep touring: same trip, finale done');
  await tap(p, '.home-stats [data-home=results]');
  check(!!(await p.$('.menu-card.fin-card')) && !!(await p.$('.fin-card [data-fin=close]')), 'Results brings the trip card back, with Close');
  await tap(p, '.fin-card [data-fin=close]');
  check(!(await p.$('.menu-card.fin-credits')), 'closing the replayed trip card does not replay the credits');
  await b.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();
