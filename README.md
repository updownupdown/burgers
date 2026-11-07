# Bun Voyage

**A cozy burger-grilling and stacking game for your phone, served from a food truck on a road trip.**

▶ **Play it at [updownupdown.github.io/burgers](https://updownupdown.github.io/burgers/)** — made for phones held upright; add it to your home screen to play like an app.

Grill patties, stack orders and keep the line moving. Your truck travels through three stops, each with its own scenery and menu: Pinecrest in the mountains, Saltwater Bay on the beach (grilled pineapple), and Red Mesa in the desert (jalapeños and smash burgers). Finish a shift to drive on and pick a truck upgrade. Progress is saved in your browser.

## Built with

TypeScript, Vite and three.js. Everything you see is generated in code (toon shading and ink outlines) and every sound is synthesised, so there are no image or audio files at all. The game has its own small UI kit, unit tests for the scoring and order rules, and scripted bot playtests. Every push to `main` deploys through GitHub Actions, and an open game reloads itself when a new build goes live.

## Running locally

```sh
npm install
npm run dev      # local server; open the LAN address on your phone
npm test         # scoring and order rules
npm run build    # type-check and build to dist/
```

More detail:

- Design doc: [docs/DESIGN.md](docs/DESIGN.md)
- Scripted playtests: [tools/playtest](tools/playtest)
- UI kit ("Dusk"): tokens, components and icons in [src/ui](src/ui); browse every component at `/ui.html`
