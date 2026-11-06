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
- `TOWN=elkpass node tools/playtest/bot.cjs` plays a given town (default pinecrest) with the tutorial skipped.
- `PORT=4175 node tools/playtest/pages-shots.cjs [tag]` screenshots each counter mid-shift (`out/page-<tag>-<n>.png`).
- `PORT=4175 [ONLY=serve,aside,warm,oven,fryer,busy,...] node tools/playtest/review78-kitchen.cjs` screenshots the kitchen and mechanics fixes after the build #78 review (DESIGN §33).
- `PORT=4175 node tools/playtest/kitchen-shots.cjs [tag]` screenshots the kitchen with the longest receipts and a burger on every plate (`out/kitchen-<tag>-*.png`). `PORT` points any script at another preview port.
- `PORT=4175 node tools/playtest/nav-shots.cjs [tag]` screenshots the doneness meters on the grill and fryer and the counter buttons on each counter and mid-move (`out/nav-<tag>-*.png`).
- `node tools/playtest/tutorial-bot.cjs` starts a fresh trip with tutorial mode on and plays the whole first day doing only what the coach's thumb shows (welcome card, map, Prep, three guided orders with the bell, tickets and a drink, closing, evening, sleep). Screenshots `out/tut-NN-*.png`; `NOSHOT=1` skips them, `OUT=dir/` moves them.
- `SCENE=town|sides|smash node tools/playtest/tutorial-scenes.cjs` checks later lessons from a prepared save: a new town and the Garage; toast, an egg and fries; smash, melt and cold-rail extras.
- `PORT=4175 node tools/playtest/tacos-warm.cjs` plays Red Rock's comal as a phone (touch, human pace, real-time clock): a Rodeo Platter built in the taco rack on the warm end and dragged up to the tray, Pastor Tacos with salsa at the tray, Street Tacos and a Quesadilla, each expected at five stars without a "been sitting" note (`ONLY=1234` picks sections). Screenshots to `tools/playtest/shots-tacos/` (not committed).
- `PORT=4175 [TAG=x] node tools/playtest/scenery-shots.cjs` screenshots the view out of the window in each area, with and without customers (`out/scenery-<tag>-<area>[-empty].png`).
- `PORT=4175 [TAG=x] [SKIP=1] node tools/playtest/sundown-shots.cjs` ends a shift and screenshots the sundown, the pull-back onto the evening map, the results sheet, Results and back, the night and the morning (`out/sundown-<tag>-*.png`); `SKIP=1` taps during the sundown instead.
- `PORT=4175 node tools/playtest/review78-bugs-menus.cjs [part]` checks the review #78 bugs and menus fixes (§33): food built ahead on a free tray, the tutorial switch, the evening hop's Results, the range after a quit, Prep's two-recipe note, Closing after walk-outs, the pause card's Today's menu in four regions, Help from pause, dev mode, 320px map. Prints PASS/FAIL; screenshots to `out/`.
- `PORT=4175 TAG=after OUT=dir/ node tools/playtest/models82-shots.cjs` builds two paninis by touch at Harbor City and takes zoomed close-ups of the pesto spread, tomato slices and rocket on the tray, in a press bay and in the bins (`<OUT><TAG>-*.png`), after the build #82 playtest notes.
- `PORT=4175 node tools/playtest/bench-sauce.cjs` drags aioli onto bread in a Harbor City press bay (with the trays empty, then with bread on a tray) and draws it on in the close-up, then checks Saltwater Bay has the board once Harbor City has been worked (DESIGN §40). Prints PASS/FAIL; screenshots `out/bench-*.png`.
- `PORT=4193 [ONLY=trays,pies,oven,grille,press,window,gold,fryer] [OUT=dir/] node tools/playtest/graphics45-shots.cjs` screenshots the graphics polish (DESIGN §45): walnut boards with burnt food and the cola cup, pies uncut / cut / ticket folded, the hearth, the grille, pressed chicken and veggie through their cooks, the window per area with every hat and its mover, golden hour into the sundown, the packing pads. Prints draw calls per frame.
