# Scripted playtests

Headless-browser bots that play the real game through synthetic touch gestures.
The game exposes `window.__bv` for this: `manual(true)` freezes the render loop,
`step(seconds)` advances game time, `project()` maps world points to screen
coordinates.

```sh
npm run build && npx vite preview --port 4173 &
node tools/playtest/bot.cjs        # plays a full shift, logs each order, screenshots to tools/playtest/out/
```

Needs Playwright with Chromium available (`require('playwright')`).
- `STOP=1 node tools/playtest/bot.cjs` plays a given road-trip stop (0-2) with the tutorial skipped.
- `PORT=4175 node tools/playtest/kitchen-shots.cjs [tag]` screenshots the kitchen with the longest receipts and a burger on every plate (`out/kitchen-<tag>-*.png`). `PORT` points any script at another preview port.
