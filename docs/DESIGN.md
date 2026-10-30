# Burger game: design doc (draft 1)

Status: **confirmed by James on 2026-10-30.** Theme: Bun Voyage (food truck road
trip). Art: toon-shaded 3D generated in code (pixelation possible later). Stack:
TypeScript + Vite + three.js, GitHub Pages, Capacitor for Android later. The burger
is assembled on the tray. Prototype scope is section 7.

The game is a touch-first, portrait, single-player cooking game about grilling
and stacking burgers (and later other grilled sandwiches). It runs in the
browser first and is wrapped as an Android app later. Galaxy Burger was the
genre reference; this game shares the genre, not the name, theme, characters,
art or UI.

---

## 1. Name and theme candidates

Each theme comes with one mechanic that only it gives us, so the choice changes
the game a little and not just the paint.

| # | Name | Theme | Signature twist |
|---|------|-------|-----------------|
| A | **Bun Voyage** | A food truck on a cross-country road trip. Each level is a stop in a new town with its own locals and tastes. | Towns unlock regional sandwiches (panini, Cubano, melts, smash burgers), which is a natural home for the menu editor. The truck is a narrow galley, which matches a portrait screen and swiping between counters. |
| B | **Patty Wagon** | Same food truck idea, more cartoon Americana. | Same as A. Kept as a name alternative. |
| C | **Grill After Dark** | A roadside diner that only opens at night; regulars are cryptids and ghosts (a moth-person who orders "extra lamp", a shy forest giant who wants tiny sliders). | Lights flicker, the radio drifts, and some customers are only visible in the dark. Spooky-cute, very silly. |
| D | **Sir Loin's** | A medieval tavern. Knights, wizards and one hungry dragon. | The grill is heated by a sleepy dragon under the counter: poke it to raise the heat, but poke too often and it sneezes fire. A heat mechanic with personality. |
| E | **Flipside Diner** | A diner where gravity flips now and then. | Some orders arrive upside down, and every so often the whole kitchen flips and the stacks must be rebuilt in reverse. |
| F | **Bunderground** | A burger kiosk in a subway station. | Customers arrive in waves when trains pull in; the train timetable is the level clock. |

**Recommendation: A, Bun Voyage (food truck road trip).** It fits the portrait
galley layout, gives a clean progression (the map of stops), and makes "add a
panini" a story beat rather than a menu toggle. C and D are the strongest
sillier options and could become later "night shift" or "event" levels instead
of competing with A.

Before we commit, I'll check the name against Play Store and itch.io listings;
food puns get reused a lot.

---

## 2. Mechanics survey

What each family of cooking games does, and whether it fits a one-thumb portrait
phone game.

### Burger and grill games

| Mechanic | Seen in | Fit |
|---|---|---|
| Order tickets listing exact layers and doneness per item | Galaxy Burger, Papa's Burgeria | **Core.** Tickets live in the top strip. |
| Patty doneness stages (raw, rare, medium, well, burnt) with a per-side timer | Papa's Burgeria, Galaxy Burger | **Core.** Each side cooks separately, so flipping matters. |
| Toasted vs. plain buns | Galaxy Burger | **Core**, cheap to add (buns go face down on the grill). |
| Griddle items besides patties: bacon, eggs, onions, melted cheese | Galaxy Burger | **Core** for bacon and egg, cheese melt in v2. |
| Stack order must match the ticket | Most burger games | **Core.** Scored per layer. |
| Fryer baskets with timers | Galaxy Burger, Cook Serve Delicious | **Core** (fries), more items later. |
| Drink machines and cup sizes | Galaxy Burger, Papa's | **Core** (one machine), fill-to-line in v2. |
| Recipe book of named menu items and combos | Galaxy Burger | **Core.** Customers order named items; the book shows the build. |
| Per-station scoring and tips | Papa's series | **Core.** Gives satisfying end-of-order feedback. |

### Wider cooking-game mechanics

| Mechanic | Seen in | Fit |
|---|---|---|
| Customer patience meters | Diner Dash, almost all | **Core.** |
| Holding stations / pre-prep (cook ahead, food cools over time) | Cook Serve Delicious | **v2.** Heat lamp on the tray slows cooling. |
| Chores: dishes, trash, scrape the grill | Cook Serve Delicious | **v2**, as short swipe chores. |
| Restocking bins by chopping | Cooking Mama, Overcooked | **v2**, a swipe-to-slice prep counter. |
| Vague orders you have to interpret ("something red and crunchy") | Good Pizza, Great Pizza | **v2**, for special customers only. |
| Customer quirks and regulars with preferences | Papa's, Good Pizza | **v2.** Regulars remember how you treated them. |
| Rush hours and waves | Cook Serve Delicious, PlateUp | **Core**, gently. |
| Between-day upgrades, unlocking dishes, roguelite picks | PlateUp, Papa's | **v2.** Pick one of three upgrades after each stop. |
| Fire and burning, extinguishers | Overcooked | **v2**, as grease flare-ups you tap to douse. |
| Gesture minigames (chop, stir, peel, knead) | Cooking Mama | Use **sparingly**: only where the gesture is the real action. |
| Physical stacking with wobble | Hyper-casual stack games | **Core, our hook.** See below. |
| Co-op, versus | Overcooked, Galaxy Burger | **Out of scope** (needs a backend). |

### Novel touch mechanics for this game

These are what should make it feel made for a phone rather than ported to one.

- **Flick to flip.** Drag the spatula under a patty, flick up. A gentle flick
  flips it neatly; a hard one sends it spinning, and it might land on the
  wrong patty, the floor, or (rarely) a customer. Combo bonus for clean flips.
- **Smash.** Press and hold a fresh patty with the press to make a smash
  burger. Longer press gives more crust, and too long makes it paper-thin.
- **Draw your sauce.** Ketchup and mustard are drawn with your finger. Tickets
  can ask for a zigzag, a spiral or a smiley; we score coverage and shape. A
  silly favourite: customers who ask you to write their name.
- **Toss to stack.** Flick an ingredient up from its bin and it arcs onto the
  active plate on the tray. Layers land slightly off-centre depending on the
  flick, and the stack wobbles with real (cheap) physics. A straight stack
  scores a presentation bonus, and a tall leaning one can topple.
- **The squish.** Finish a burger with a pinch to press the top bun down. A
  gentle squish is perfect; too hard and sauce squirts out.
- **Ding ding.** Tap the bell twice when an order is ready. One ding gets a
  confused look; three gets an annoyed one.
- **Turn the knob.** Twist gesture on the grill dial sets heat. The centre of
  the grill is hotter than the edges, so where you place things matters.
- **Crosshatch marks.** On the chargrill (v2), a two-finger rotate turns a
  patty 45 degrees halfway through a side to get diamond grill marks.
- **Shake the basket.** Wiggle the fryer basket after lifting it to drain oil
  for a crispness bonus. Tapping the salt shaker salts fries.
- **Hold to pour.** Hold the drink tap, release at the line. Overfilling
  makes a puddle you have to wipe.
- **Scrape.** Swipe the scraper across the grill between rushes. A dirty grill
  slowly lowers flavour score and can flare up.
- **Shoo.** A raccoon (or a seagull, or a goblin, depending on theme) tries to
  steal from the bins; swipe at it.
- **Haptics** on every flip, ding, squish and burn on Android.

Some of these are fiddly by nature. The rule for the prototype: every core
action must also work with a plain tap or short drag, and the fancy gesture
gives a bonus. That keeps the game playable one-handed on a bus.

### Keeping the grill central as the menu grows

Everything new should go through the grill, so new dishes reuse the
mechanics players already know:

- **Panini / pressed sandwiches**: the grill gets a press lid; pinch down to
  close it. Doneness shows as grill-mark darkness.
- **Melts and grilled cheese**: flip the whole sandwich, cheese melt timer.
- **Smash burgers**: the smash mechanic above.
- **Breakfast stop**: pancakes and eggs reuse flipping.
- **Quesadillas, bao, flatbreads** later, as regional specials.
- **Menu editor**: between stops the player builds signature items from
  unlocked ingredients, names them and sets a price; customers' reactions feed
  back into which items sell.

---

## 3. Core loop

1. A shift (one stop on the map) lasts a few minutes. Customers walk up to
   the truck window and order from the current menu.
2. Each order becomes a ticket and a plate on the tray.
3. The player cooks on the grill, fries, pours drinks and stacks the burger
   on its plate, swiping between counters as needed.
4. Ring the bell to serve. The ticket is scored: correct layers, doneness,
   stack straightness, sauce, speed, and freshness (v2).
5. End of shift: earnings, tips, star rating. Unlock the next stop and pick
   an upgrade or a new ingredient.

---

## 4. Portrait layout

Designed for a 390 x 844 logical screen (most modern phones), scaling to fit.
The busiest actions sit lowest, where the thumb is.

```
┌──────────────────────────────┐
│  ☰    Stop 3: Pinecrest   ★★ │  HUD (time left, money, pause)
├──────────────────────────────┤
│ ( ° ᴗ °)  ( >_<)   (¬_¬ )    │  CUSTOMERS at the truck window,
│ [#12 ▓▓▓░] [#13 ▓▓░░] [#14…] │  with tickets and patience bars.
│                              │  Tap a ticket to expand it.
├──────────────────────────────┤
│  ╭───╮  ╭───╮  ╭───╮         │  TRAY: one plate per open order.
│  │ 🍔│  │   │  │   │   🔔    │  Tap a plate to make it active.
│  ╰───╯  ╰───╯  ╰───╯         │  Bell on the right.
├──────────────────────────────┤
│                              │  COUNTER (swipe ← →)
│  [bun][let][tom][onn][chz]   │   Grill counter (home):
│  [pat][bcn][egg]  🥫 🟡      │   ingredient bins and sauces,
│                              │
│  ┌────────────────────────┐  │   then the grill at the bottom,
│  │  ◍     ◍      ◍        │  │   in thumb reach.
│  │     ◍      ▭▭          │  │
│  └────────────────────────┘  │
│        ◉ heat dial           │
├──────────────────────────────┤
│   Drinks  •  GRILL  •  Fryer │  Counter tabs + page dots
└──────────────────────────────┘
```

Counters, left to right: **Drinks**, **Grill** (home), **Fryer**, and later
**Prep** (chopping/restocking) and **Press** (panini). Swiping moves only the
counter band; customers and the tray stay put, so the player never loses sight
of orders or of what's on each plate.

**How things reach the tray.** Ingredients are tossed (or dragged) upward from
the bins onto the active plate, so the burger is stacked right on the tray.
Cooked grill items are dragged up from the grill. Fries and drinks are dragged
up from their counters into the plate's side slots. Everything moves upward,
which is a comfortable thumb motion.

Open question for James: you described the tray as where ready ingredients
are gathered. I've read that as "the burger is assembled on the tray". The
alternative is a separate assembly board on the grill counter, with only
finished items going to the tray. Assembling on the tray keeps one fewer
step and keeps the stack visible from every counter, so it's my recommendation.

---

## 5. Customers and look (for Bun Voyage)

- Customers are chunky, rounded characters built from simple shapes, each
  town having its own cast (lumberjacks and a moose in the mountain stop,
  surfers and a crab at the beach, a marching band that orders twelve
  identical burgers). Faces are simple and very expressive: eyes, brows, mouth.
- Warm, saturated food colours against a muted truck interior, so the food
  always pops.
- UI is chunky and hand-made: tickets look like paper slips, tabs look like
  stickers on the counter edge. None of Galaxy Burger's UI shapes, palette or
  layout are reused.

---

## 6. Art style and tech stack

### What I can realistically make

- **Pixel art at Galaxy Burger's level: no.** That game's art is hand-painted
  by artists, at a fairly high resolution with careful shading. I can write
  pixel sprites as code (palette plus pixel grid), and they'd look clean and
  charming but noticeably simpler. Getting consistent, polished pixel art
  would need an artist or a lot of manual touch-up from you.
- **Low-poly 3D: yes, and it suits this game unusually well.** Burger layers
  are discs, domes and wavy sheets, which can be generated in code with
  real quality: a bun is a squashed dome with sesame seeds scattered on it, a
  patty is a lumpy cylinder whose colour moves from pink to brown to black as
  it cooks, cheese is a sheet that droops over the edges as it melts, lettuce
  is a ruffled disc. Customers are built from rounded primitives. No external
  art pipeline is needed, and everything can animate (squash on landing,
  wobble, sizzle).
- **Best of both: pixelated 3D.** Render the same 3D scene at a low resolution
  and scale it up with crisp pixels, plus toon shading and outlines. That
  gives a pixel-art look for free, which can be a switch rather than a
  rewrite.

A small render test compares the three looks on a phone:
[Bun Voyage render test](https://claude.ai/artifact/UuQuQV7PHbyHqFoBqixSnV)
(private to James for now). Its source is `spikes/render-test.html`. It is all
procedural, a few hundred lines, so it shows what the generated-art approach
can do: flick up to flip the patty on the grill, tap to wobble the stack.

### Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript | Safer refactors as the game grows. |
| Build | Vite | Fast dev server, simple static build for GitHub Pages. |
| Rendering | three.js | Mature WebGL, small, runs well on mid-range Android. Same family as Aloft, if that's what Aloft uses. |
| Physics | None at first, custom springs | Stack wobble and landing are easier to tune by hand than with a physics engine. Add a small engine only if toppling needs it. |
| UI (HUD, tickets, menus) | HTML/CSS over the canvas | Crisp text at any size, easy accessibility, fast to iterate. |
| Input | Pointer Events with a small gesture layer | Tap, drag, flick, hold, pinch, rotate from one code path for touch and mouse. |
| Audio | Web Audio, with generated sound effects | Sizzle, ding, squirt, splat. Real recordings can replace them later. |
| Save data | localStorage | No backend needed. |
| Deploy | GitHub Actions → GitHub Pages | You'll enable Pages from Actions; the workflow comes with the prototype. |
| Android | Capacitor wrapping the same build | Native haptics, full-screen, portrait lock, Play Store packaging, works offline. A Trusted Web Activity is a lighter alternative if we only need a store listing. |

Alternatives considered:

- **Phaser** (2D engine): the right pick if we went with hand-drawn sprites,
  but weaker for the generated 3D look.
- **Godot web export**: great editor, but the web build is large and slow to
  start on phones, and the GitHub Pages hosting needs extra headers.
- **Babylon.js / PlayCanvas**: capable, but heavier than we need.

---

## 7. Proposed prototype scope (please confirm)

The prototype should prove the feel: grill, flip, toss-to-stack, sauce, bell.

**In the prototype**

- One shift at one stop, 3 minutes, 4 to 8 customers, gentle waves.
- Grill counter: buns (toast), patties (two-sided doneness), bacon, egg,
  cheese; lettuce, tomato, onion, pickles from bins.
- Gestures: tap/drag everywhere, flick-to-flip, toss-to-stack with wobble,
  draw-your-sauce (ketchup and mustard), double-ding bell.
- Fryer counter: fries with a basket timer.
- Drinks counter: one machine, three flavours, tap to fill.
- Swipe between Drinks, Grill and Fryer with the tray and customers fixed.
- Order tickets with layers and doneness, patience meters, per-order score.
- End-of-shift summary.
- Placeholder generated sounds and Android haptics.
- Deployed to GitHub Pages.

**Next, after the prototype feels right**

- Road trip map, multiple stops, upgrades between shifts.
- Smash, squish, heat dial, hot/cool grill zones, grill scraping.
- Holding/cooling, heat lamp, chores, raccoon.
- Panini press and the menu editor.
- Quirky regulars and vague orders.
- Android build via Capacitor.

**Not planned:** co-op, versus, online leaderboards (all need a backend).

### Questions for James

1. Theme and name: go with **Bun Voyage** (food truck road trip), or another?
2. Art: low-poly 3D, pixelated 3D, or decide after trying the render test?
3. Tray: assemble the burger on the tray (recommended) or on a separate board?
4. Does the prototype scope above look right?
5. Does Aloft use three.js? If so I'll reuse the same conventions.

## 8. After build #7: what changed and why

James's build #7 playtest asked for a deeper kitchen and an optional business layer. All of it ships behind the existing controls; business mode is off unless switched on from the title screen.

- **Tickets:** orders are known recipes plus up to two modifiers (no / extra / add). Familiar recipes show a compact ticket (name, doneness, modifiers, progress pips); tap the active ticket to see every layer.
- **Grill counter:** a full-width trash slot along the front edge; three assembly spots under a heat lamp to the right of the grill (food stays hot, then dries out after about 25 seconds); a **Warm** switch that turns the right end of the grill down to almost nothing.
- **Melted cheese:** some recipes want the cheese melted. Drop a slice on a patty while it's on the grill (or on a patty under the heat lamp, more slowly). The cheesed patty can't be flipped and comes off as one piece.
- **Sides:** drinks are S/M/L and fries S/L. Take an empty cup or carton from its stack first. Stacks start with 3; a wrapped sleeve from the supplies cabinet refills one (two taps to tear it open). A fryer basket holds one large or two small portions. Overflowing keeps pouring onto the drip tray: the soda costs money and the puddle must be scrubbed before that nozzle takes another cup.
- **Business mode:** before each shift pick ingredient quality (Budget / Standard / Premium), prices (Low / Fair / High) and today's menu. Rating = execution score + 8 points per step of taste (quality) and value (price), so premium food at high prices rates like standard at fair prices but earns more per burger. Traffic scales with prices, menu size and reputation. Ingredients, cups, cartons and soda cost money as they're used, so waste shows in profit. Reviews and reputation persist across shifts.
- **PWA:** installable, works offline after the first load; the service worker never caches `version.json`, so the update check still works.

## 9. Next: the road map (cities, events, crowds, press)

James's idea (2026-10-30): replace the fixed list of stops with a simple overworld map of cities to unlock and visit, in the spirit of old console world maps but drawn in our own toon style. Cities differ by crowd, some host events worth driving to, and food critics can put the truck in the paper or on TV. This is the meta-progression and the story.

### The map

- A top-down map of one region at a time: towns are nodes joined by roads, and the truck is a token that drives along them. Tap a town to see its card (crowd, specialty, any event coming up), tap Drive to go there.
- Each town plays one shift. Passing a shift (the current pass rule) opens the roads out of it, so the map fills in as you go. Some towns sit on side roads you can skip; a few are gated ("needs 2.5 ★ reputation", "needs a fryer upgrade").
- Regions follow the current stops: **Mountains** (Pinecrest), **Coast** (Saltwater Bay), **Desert** (Red Mesa), each with 3–5 towns. Reaching a region's big city finishes it and opens the next region's road.
- Each town keeps a postcard: best stars, best profit, and a one-line note from the locals. That's the story, told in small pieces rather than cut-scenes.
- The road trip has a day counter. Each shift is one day and driving to a neighbouring town is free, so the counter only matters for events.

### Crowds

Every town has a crowd profile, so where you park the truck is a choice:

| Profile | Customers | Spends | Cares about | Example |
| --- | --- | --- | --- | --- |
| Commuters | many | little | speed (short patience) | highway rest stop |
| Families | average | average | sides and drinks, forgiving | lakeside campground |
| Foodies | few | a lot | ingredient quality, picky | wine-country village |
| Party crowd | lots, in waves | little | big orders, not fussy | beach festival |

In numbers, a profile sets base traffic, how much prices put people off, how much ingredient quality counts in the rating, patience, tip size, and critic chance. The same knobs already exist in business mode (`trafficMult`, `ratingBonus` in `src/game/business.ts`), so crowds plug into them. In the normal mode, crowds still change traffic, patience and tips.

### Events

- Some towns host an event on certain days, shown on the map ahead of time ("Chili Cook-off in Red Mesa, day 9"). Turning up on the day gives a longer, busier shift with that event's crowd and sometimes a themed recipe.
- An event can be missed. Missing one just means waiting for the next, with no penalty.
- First set: surf contest (party crowd, cheap and huge), farmers' market (foodies, critic likely), rodeo (big appetites, double patties), county fair (families, lots of sides).

### Critics and popularity

- **Reputation** (already built) is the average review in stars. **Popularity** is new: how many people have heard of the truck.
- Now and then a critic orders. They look slightly different and their ticket is marked. Their verdict counts like several normal reviews.
- A great critic review runs as a newspaper clipping, magazine article or local TV spot on the summary screen. Each raises popularity for the next few towns. A bad one does the opposite, more gently.
- Popularity brings more customers. Reputation and popularity together raise what people will pay: the "fair" price becomes higher as the truck gets famous, so a well-known truck can charge High prices without the value penalty. That turns James's line, "more popularity and higher reviews mean people are willing to pay more", into one number: willingness to pay.

### Build order

1. **Map and unlocks.** Map screen, towns as data, roads open on a pass, postcards. Existing stops become the first town of each region. Works in both modes.
2. **Crowd profiles.** One profile per town, wired into traffic, patience, tips and the business-mode rating.
3. **Events.** Day counter, events calendar on the map, event shifts.
4. **Critics, press, popularity.** Critic customers, clippings and TV spots, popularity, willingness to pay.
5. More towns and regional recipes as content, then the panini press and menu editor from section 2.

### Open questions for James

1. Should the map show the whole country with locked regions greyed out, or reveal one region at a time?
2. Should events be on fixed days (so you plan a route), or pop up a day or two ahead (so you react)? Fixed days suit a map you can plan on; I'd start there.
