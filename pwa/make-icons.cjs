// Renders the app icons and favicons to PNG (DESIGN §44). The SVG sources come from
// tools/brand/gen_assets.py; run that first if the mark changed, then:
//   node pwa/make-icons.cjs
// Each PNG is its own drawing at its own size: nothing here pads, scales or recolours the art.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const pub = path.join(__dirname, '..', 'public');
const src = (f) => path.join(__dirname, f);
// [source svg, output png, size, opaque]: the 'any' and Apple icons are full-bleed squares (iOS and
// launchers round them), the monochrome icon keeps its transparency (Android reads its alpha).
const jobs = [
  [src('icon.svg'), path.join(pub, 'icons', 'icon-192.png'), 192, true],
  [src('icon.svg'), path.join(pub, 'icons', 'icon-512.png'), 512, true],
  [src('icon.svg'), path.join(pub, 'icons', 'apple-touch-icon.png'), 180, true],
  [src('icon-maskable.svg'), path.join(pub, 'icons', 'maskable-512.png'), 512, true],
  [src('icon-monochrome.svg'), path.join(pub, 'icons', 'monochrome-512.png'), 512, false],
  [src('favicon-16.svg'), path.join(pub, 'favicon-16.png'), 16, false],
  [path.join(pub, 'favicon.svg'), path.join(pub, 'favicon-32.png'), 32, false],
];
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ deviceScaleFactor: 1 })).newPage();
  for (const [inp, out, size, opaque] of jobs) {
    const svg = fs.readFileSync(inp, 'utf8');
    if (/#244640/i.test(svg)) throw new Error(`${inp} is the old green icon; run tools/brand/gen_assets.py`);
    await p.setViewportSize({ width: size, height: size });
    const url = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
    await p.setContent(`<body style="margin:0;background:${opaque ? '#2a3340' : 'transparent'}"><img src="${url}" width="${size}" height="${size}" style="display:block"></body>`);
    await p.waitForFunction(() => document.images[0].complete);
    await p.screenshot({ path: out, omitBackground: !opaque });
    console.log('wrote', path.relative(path.join(__dirname, '..'), out));
  }
  await b.close();
})();
