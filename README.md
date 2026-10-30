# Bun Voyage

A touch-first, portrait burger grilling and stacking game. Your food truck is on a road
trip through three stops: Pinecrest (mountains), Saltwater Bay (beach, grilled pineapple)
and Red Mesa (desert, jalapeños and smash burgers). Pass a shift to drive on and pick a
truck upgrade; progress is saved in the browser.

Play it at https://updownupdown.github.io/burgers/ (deployed from `main` by GitHub Actions).
The build number shows on the title screen and in the pause menu, and the game reloads
itself when a newer build is deployed.

## Develop

```sh
npm install
npm run dev      # local server, open on your phone via the LAN address
npm test         # scoring and order rules
npm run build    # type-check and build to dist/
```

- Design doc: [docs/DESIGN.md](docs/DESIGN.md)
- Scripted playtests: [tools/playtest](tools/playtest)
- Art style spike: [spikes/render-test.html](spikes/render-test.html)

Everything visual is generated in code with three.js (toon shading and ink outlines);
there are no image or audio assets.
