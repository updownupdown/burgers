// Renders pwa/icon.svg to the PNG icons in public/icons. Run after changing the icon:
//   node pwa/make-icons.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
const out = path.join(__dirname, '..', 'public', 'icons');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  // Maskable icons keep the art inside the central 80% safe zone.
  for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['maskable-512.png', 512, 0.12], ['apple-touch-icon.png', 180, 0]]) {
    await p.setViewportSize({ width: size, height: size });
    const inner = Math.round(size * (1 - pad * 2));
    await p.setContent(`<body style="margin:0;background:#244640;display:grid;place-items:center;width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body>`);
    await p.screenshot({ path: path.join(out, name) });
  }
  await b.close();
})();
