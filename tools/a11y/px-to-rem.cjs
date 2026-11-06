#!/usr/bin/env node
// Text size (DESIGN §52): every UI font size is in rem, so the root size (Settings → Text size)
// scales all of it. This rewrites px font sizes in the CSS under src/ to rem at 16 px = 1 rem:
// `font-size: 13px`, the size in a `font:` shorthand (`font: 800 12px/1.2 ...`), and the
// `--bv-fs-*` tokens, and px line heights. Sizes under 6 px are left alone: those are SVG user units on the paper map.
// Safe to run again; run it after merging CSS that brings new px sizes.
//
//   node tools/a11y/px-to-rem.cjs [--check]
//
// --check lists what it would change and exits 1 if anything is left in px.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..", "src");
const check = process.argv.includes("--check");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".css")) out.push(p);
  }
  return out;
}

const rem = (px) => {
  const v = Math.round((px / 16) * 10000) / 10000;
  return `${v}rem`;
};
const conv = (num) => (Number(num) < 6 ? null : rem(Number(num)));

let total = 0;
for (const file of walk(root)) {
  const src = fs.readFileSync(file, "utf8");
  let n = 0;
  let out = src.replace(/(font-size\s*:\s*)(\d+(?:\.\d+)?)px/g, (m, pre, num) => {
    const r = conv(num);
    if (!r) return m;
    n++;
    return pre + r;
  });
  out = out.replace(/(--bv-fs-[a-z0-9]+\s*:\s*)(\d+(?:\.\d+)?)px/g, (m, pre, num) => {
    const r = conv(num);
    if (!r) return m;
    n++;
    return pre + r;
  });
  // Line heights in px would pin rows at the normal size: they follow the root too.
  out = out.replace(/(line-height\s*:\s*)(\d+(?:\.\d+)?)px/g, (m, pre, num) => {
    const r = conv(num);
    if (!r) return m;
    n++;
    return pre + r;
  });
  out = out.replace(/(\bfont\s*:[^;{}]*?\/)(\d+(?:\.\d+)?)px/g, (m, pre, num) => {
    const r = conv(num);
    if (!r) return m;
    n++;
    return pre + r;
  });
  // font shorthand: [style] [weight] size[/line-height] family. The size is the first px length.
  out = out.replace(/(\bfont\s*:\s*)((?:(?:normal|italic|oblique|small-caps|bold|bolder|lighter|\d{3})\s+)*)(\d+(?:\.\d+)?)px(?=[\s/])/g, (m, pre, mid, num) => {
    const r = conv(num);
    if (!r) return m;
    n++;
    return pre + mid + r;
  });
  if (n) {
    total += n;
    console.log(`${path.relative(process.cwd(), file)}: ${n}`);
    if (!check) fs.writeFileSync(file, out);
  }
}
console.log(check ? `${total} px font sizes left` : `${total} px font sizes now in rem`);
if (check && total) process.exit(1);
