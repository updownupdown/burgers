// Build #82 menus (DESIGN.md §36): the pause card per region, Prep and Settings updating in place,
// and the plain modal headers. At 390x844, touch.
// PORT=4173 OUT=/some/dir/ node tools/playtest/menus82-shots.cjs [tag]
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.env.OUT || require('path').join(__dirname, 'out') + '/';
fs.mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:' + (process.env.PORT || 4173) + '/';
const tag = process.argv[2] || 'now';
const log = (...a) => console.log(tag, ...a);

let b;
async function page(save) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.goto(URL);
  await p.evaluate((save) => {
    localStorage.clear();
    localStorage.setItem('bv-welcomed', '1');
    localStorage.setItem('bv-difficulty', 'balanced');
    localStorage.setItem('bv-save-v1', JSON.stringify({ version: 2, tutorialDone: true, ...save }));
  }, save);
  await p.reload();
  await p.waitForTimeout(900);
  return p;
}
const shot = (p, name) => p.screenshot({ path: `${OUT}${tag}-${name}.png` });
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor', 'redmesa', 'cactus', 'sunvalley', 'applecross', 'larkvale', 'portamber'];
const at = (town) => ({ town, unlocked: ALL, day: 6, shiftsIn: { pinecrest: 3, summit: 3, harbor: 3, sunvalley: 3 } });

async function enterShift(p) {
  await p.click('[data-home=open]');
  await p.waitForTimeout(800);
  await p.click('[data-act=open]');
  await p.waitForTimeout(600);
  await p.evaluate(() => window.__bv.manual(true));
  await p.evaluate(() => window.__bv.step(40));
}

/** Watch a card across a tap: is it the same element after, and did any entrance animation start? */
async function watchTap(p, cardSel, tapSel, scrollSel) {
  await p.evaluate(({ cardSel, scrollSel }) => {
    window.__card = document.querySelector(cardSel);
    const sc = document.querySelector(scrollSel);
    if (sc) sc.scrollTop = 260;
    window.__top = sc ? sc.scrollTop : 0;
  }, { cardSel, scrollSel });
  // A DOM click, so the page isn't scrolled to the button first.
  await p.evaluate((sel) => document.querySelector(sel).click(), tapSel);
  await p.waitForTimeout(50);
  return p.evaluate(({ cardSel, scrollSel }) => {
    const now = document.querySelector(cardSel);
    const sc = document.querySelector(scrollSel);
    const anims = document.getAnimations().map((a) => a.animationName).filter((n) => /menu-rise|menu-fade/.test(n || ''));
    return { sameCard: now === window.__card, entranceAnims: anims, scrollBefore: window.__top, scrollAfter: sc ? sc.scrollTop : null };
  }, { cardSel, scrollSel });
}

(async () => {
  b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

  // The pause card in each kind of kitchen: the top, then scrolled down to Today's menu and the sides.
  for (const town of ['summit', 'harbor', 'sunvalley', 'portamber']) {
    const p = await page(at(town));
    await enterShift(p);
    await p.click('[data-r=menuBtn]');
    await p.waitForTimeout(500);
    await shot(p, `pause-${town}`);
    const h = await p.evaluate(() => {
      const body = document.querySelector('.pause-body');
      const m = document.querySelector('.pause-menu');
      body.scrollTop = m.offsetTop - 8;
      return { scroll: body.scrollHeight, view: body.clientHeight };
    });
    await p.waitForTimeout(200);
    await shot(p, `pause-${town}-menu`);
    await p.evaluate(() => { const body = document.querySelector('.pause-body'); body.scrollTop = body.scrollHeight; });
    await p.waitForTimeout(200);
    await shot(p, `pause-${town}-end`);
    log('pause', town, JSON.stringify(h));
    if (town === 'summit') {
      // Settings over the pause card: change graphics and sound. The loop runs again (the shift
      // stays paused), so the kitchen behind is redrawn after a graphics change as in play.
      await p.evaluate(() => window.__bv.manual(false));
      await p.click('.pause [data-m=settings]');
      await p.waitForTimeout(500);
      await shot(p, 'settings');
      log('settings gfx', JSON.stringify(await watchTap(p, '.menu-card.settings', '.settings [data-m=gfx][data-v=low]', '.settings .menu-body')));
      log('settings sound', JSON.stringify(await watchTap(p, '.menu-card.settings', '.settings [data-m=sound]', '.settings .menu-body')));
      await p.waitForTimeout(300);
      await shot(p, 'settings-changed');
    }
    await p.context().close();
  }

  // Prep: every change updates the card in place, at the same scroll.
  {
    const p = await page(at('summit'));
    await p.click('[data-home=open]');
    await p.waitForTimeout(800);
    await shot(p, 'prep');
    log('prep pace', JSON.stringify(await watchTap(p, '.day-screen.prep', '.prep [data-act=prep-pace][data-v=stressful]', '.prep .day-scroll')));
    log('prep ingredients', JSON.stringify(await watchTap(p, '.day-screen.prep', '.prep [data-act=prep-ing]', '.prep .day-scroll')));
    log('prep dish', JSON.stringify(await watchTap(p, '.day-screen.prep', '.prep [data-act=prep-menu]', '.prep .day-scroll')));
    await p.waitForTimeout(300);
    await shot(p, 'prep-changed');
    await p.context().close();
  }

  // Other cards with the shared header: the Food menu and How to play from the map.
  {
    const p = await page(at('harbor'));
    await p.click('[data-home=menuref]').catch(() => {});
    await p.waitForTimeout(600);
    await shot(p, 'foodmenu');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    await p.click('[data-home=howto]').catch(() => {});
    await p.waitForTimeout(600);
    await shot(p, 'howto');
    await p.context().close();
  }
  await b.close();
})();
