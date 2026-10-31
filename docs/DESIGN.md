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
- Map art (2026-10-31, `src/screens/map.ts`, `map.css`): drawn like a paper map rather than a cartoon. Soft terrain washes (sage for the highlands, sand for the coast, ochre for the desert) blend into open country instead of meeting at borders; relief is hachured (short pencil strokes off each ridge, darker on the south-east side) with small peak marks, forest is tiny tree symbols, the coast gets a beach band, dune stipple and marsh marks, the desert sand stipple, cliff-edged mesas and dashed dry washes. Towns have building blocks around them, roads are thin cased lines (highways wider with a centre line), the shallows are offset rings in the sea, and locked regions fade under a paper veil with a light survey hatch. James's brief: subtle markings, less cartoonish, terrain type without quite drawing contour lines.
- The road trip has a day counter. Each shift is one day. Driving (built 2026-10-30, `src/game/travel.ts`): one road can be driven overnight for a little gas money ($4 minimum, $0.40 per map unit, so $7–10 for most roads and about $21 between regions) without a day passing, but only once per night; a second drive that night, or any trip of two roads or more, takes a whole day and costs gas by distance. The truck starts with $120. Three passed shifts in a town open its roads (`shiftsIn` in the save), including a capital's road into the next region.
- The home screen (`src/screens/home.ts`) is the map itself, full screen, with pan and zoom: day, budget, popularity and the lifetime rating (average stars over every served order, with the count) stay in view; tapping a town opens a sheet with its crowd, a two-week event calendar, shifts worked there and the drive there.

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

## 10. After build #25: what changed in the truck

- **Counters:** Drinks, Grill, Fryer and Supplies. Move between them only by tapping or swiping the bottom bar, or by holding a carried item over a tab. The counters themselves don't swipe, so side swipes there are free for future actions.
- **Orders:** till receipts clipped to a steel rail under each customer. Patty doneness is a coloured pill (Rare, Med, Well) on the receipt and under each patty on the grill, with a bar for progress through that level.
- **Counted toppings:** pickles (3), onions (2), tomato (2) and jalapeños (4) go on one piece at a time and spread around the burger. Extra adds about two thirds more at $0.50; other extras and adds are $1. Short is marked down as skimpy; one or two over reads as generous and lifts the score a little; more is a mess.
- **Fries:** three cook zones (under 0–0.5, done 0.5–0.95, over 0.95–1.3, burnt past that). Happiness depends on the zone and the spot in it, peaking at the middle of the done zone, which the meter marks with a line. Baskets stay up until tapped down; pips show scoops. Salt is optional; plain fries without it lose 15%.
- **Poutine:** a meal with no burger (12% of orders once the shift is going): a large carton of fries, then cheese curds, then gravy, all from the fryer counter. $8.
- **Free sides:** a side the customer didn't order, made well, softens a bad review; the worse the meal, the more it helps.
- **Drinks:** labels sit in a row on the machine; the pour falls from a spout into the back of the cup so it can be seen.
- **Service bell:** a 3D bell beside the plates; ring twice to serve.

## 11. The line, the bell and fame

James's note after build #31: the pace was hectic even on Chill, because three customers always stood at the window and the only way to cope was to serve them. The fix is to make the player the one who decides how many orders are open.

- **The line.** People arrive over the shift and join a line outside (small figures off to the left of the window, receding into the back). The bell at the window's edge shows how many are waiting. Nobody stands at the window until called, except that an empty window calls the first in line up on its own after a beat, so a quiet truck never waits on the bell.
- **The bell.** Ring it twice (two taps within 1.4 s) to call the next person up. More people at the window means more orders in flight and more money, if the player can keep up. Difficulty caps the window: **Chill 2, Balanced 3, Stressful 3** (`WINDOW` in `src/game/line.ts`).
- **Two patiences.** Waiting in line has its own meter (45 s base, scaled by difficulty and crowd). It drains at 0.3x at the front, 0.65x second in line, 1x further back, so people about to order almost never give up and the back of the line drifts off first. An order's patience starts only when they order, as before. Someone who gives up in line never ordered, so they don't rate or review; they do cost a little fame.
- **Fame.** The old `popularity` number (10–100) is now how well known the truck is, and it drives traffic harder: about half the town's trade for a truck nobody knows, the usual trade around 65, 1.3x when famous. Strangers won't join a long line: behind one person about 40% join at fame 10, 17% behind two; a famous truck's line is part of the draw (`joinChance`). Fame grows by word of mouth (+1 per three 2★+ orders, up to +6 a shift), from the press as before, and from posts; it falls when people walk out or give up in line, and fades a point a day.
- **Social media.** On the town sheet above Open: *Word of mouth* (free), *A post* ($12, +20 fame for the day, +2 for good), *Campaign* ($30, +45 today, +5 for good). Charged from the tin when the window opens; it stays on until changed, and shows the expected customer count for each level so it's a traffic dial as much as a purchase.
- **Passing.** Half the people who *ordered* must be served with a 1★ average (never fewer than 40% of the expected crowd), so a short line can't fail a shift by itself.
- **Summary** now lists walk-outs after ordering, people who gave up in line and people who walked past, plus the day's social media spend.

Open: the Day Ledger / pre-open redesign (separate thread) should take over the social media control when it lands; it's one small block in `src/screens/home.ts` (`adsHtml`).

## 12. The Kitchen Bench study: window line truck

James's picks from the Kitchen Bench study (`/mnt/project-files/kitchen-study/`), built on the study's machines (`src/render/machines/`, one game unit = 15 cm).

- **Window line.** Every counter faces the serving window, so the player stands with their back to the street side wall. **Grill** is the prep unit and lamp shelf: a stepped 3 x 3 cold prep unit on the left with the sauce caddy in front of it, the griddle (warm zone behind a rail on its right) and a warm shelf over the griddle's back edge (reworked in §14). **Fryer** is a front pass: freezer bin, two wells on a hang rail, the topping station, carton stacks and pack pads along the front. **Drinks** is the ice and drink tower (cup tubes S/M/L, ice lever) beside the low fountain, lids and straws in front. **Supplies** is the wire rack behind the player, holding only what restocks something: one bay per cup and carton size.
- **Camera: half stops.** One zoom for every counter (about 1.35 m across). The fryer line is wider than the screen, so it has two stops: tap its tab again, swipe along the bar, or carry something to the screen's edge and rest there. Pips on its tab show which end you're at. Supplies is reached by turning round on the spot. `STOPS` in `src/scenes/counter.ts`.
- **Low pass tray.** The tray band is the window ledge: plates on a steel pass shelf seen nearly side on, with sides beside each burger.
- **Drag to sauce.** One gesture: press a bottle in the caddy and the plates with a burger started light up. Dragging up toward a plate eases a close-up out of that plate (the tray scene through a second camera, src/scenes/saucezoom.ts) while the rest of the truck dims; about 80% of the way to the close-up's middle it locks on and the burger fills a square over the tray band. From then on moving the finger squeezes a line, landing 34 px above the fingertip so the finger never hides it. A fill bar down the right shows coverage with a Perfect band, and a chip at the top gives the live score ("A bit more", "Perfect", "Too much", or "Not on this order"). Letting go puts the bottle back and the view eases out. A plain tap on a bottle shows how to use it. Sauce goes on tray burgers only. **Scoring:** coverage of the middle of the bun (out to 85% of its radius) under the line: 25 to 50% is perfect, under 12% stingy, over 66% drowning.
- **Warm shelf** (removed after build #36, see §15). No bulbs or orange glow; each plate gets a slim vertical bar that drains as the food dries out (green while it keeps, amber once it starts drying after `HOLD_GRACE`, red near `HOLD_RUIN`).
- **Sized sleeves.** A sleeve carries a size and only opens on the stack of that size.
- **Not built:** the study's fryer dump pan (it would add a step between basket and carton); the smash press on the griddle is decor, smashing is still press and hold.

The social media control moved to the Prep screen's *Who's coming* box in §13.

## 13. The day cycle: one map, two lights

From the Day Cycle Study (this thread). A day is now two halves on one map, and every screen the player sees in a day is listed here in order.

1. **Morning map.** Daylight. Dock: *Prep & Open* (primary), plus Menu, Reviews, Supplies. Tapping a town shows the trip: *Drive now* when it fits the range, *Drive · a whole day* otherwise.
2. **Prep.** The pre-open base (`src/screens/day.ts`). Expand boxes, not tabs: *Who's coming* (crowd, expected customers, social media level), *Menu*, *Prices*, *Ingredients* (business mode), *Running costs*, *Ledger* (a receipt projecting the day's net as a range). Collapsed lines always show the choice and its effect, so the collapsed screen already answers "what will today make?". *Keep it simple* hides everything but the essentials and is remembered (`simplePlan`). The bottom bar shows the projected net and *Open*. Nothing about reviews lives here.
3. **Shift.** Unchanged.
4. **Closing.** Dusk header with the town, stars and a verdict line; three KPIs; expand boxes for *Takings* (a receipt with the projection and whether it was beaten), *Today's reviews* and *Press*. The free kitchen-upgrade pick lives here when a shift earns one. One button: *Evening map*. It's saved as `last` so Results reopens it from the evening dock.
5. **Evening map.** Night palette; only roads within tonight's range glow and towns at their end light up. Dock: *Sleep −$5* (the running cost after solar), Results, Reviews, Supplies. Hops within range happen now and add up (`driven`); a town beyond the range is tomorrow's drive.
6. **Night card.** Charges the running cost, applies solar, turns the day. Tap to wake on the morning map.

**Money.** Running cost **$10 a night** (generator and propane), waived when the tin can't cover it. Supply yard at Summit City and Harbor City sells parts for cash: roof solar panel $60 (saves $5), full solar roof $60 (saves $8 in all), engine tune-up $150 (range 175 mi), long-haul kit $250 (range 250 mi). Base range 100 mi covers any town road; highways need the tune-up. Kitchen upgrades stay the free pick after a good shift.

**Reviews** have their own screen off both docks: reputation and popularity up top, then every review and press clipping with filters (All, Critics, 3★, 1★, this town).

Code: `src/game/day.ts` (time of day, gear, sleep, projection), `src/game/travel.ts` (range legs), `src/screens/day.ts` + `day.css` (the screens), `src/screens/map.ts` (night and lit roads).

## 14. After build #36: settings, the town sheet and the back button

James's playtest of build #36 (2026-10-31), the map and settings part.

- **Two bugs.** Closing any screen over the map (Supplies, Reviews) left the map as open sea: the redrawn SVG had no size until `fitMap` gave it one. Back on Prep did nothing: it tried to close a summary overlay, but Prep lives in the title layer with the map unmounted beneath it.
- **The phone's back button** (`src/screens/nav.ts`). Every screen over another registers itself with the function that closes it: modal cards, Prep, the screens over the map, the town sheet. Back closes the top one. The history stays one sentinel entry deep, so the order of opens and closes can't lose an entry. In a shift a guard sits at the bottom: Back pauses and opens the menu instead of leaving the game.
- **Help and Settings** are two labelled buttons on the map; the old Menu button and its tabs are gone. The pause menu (in a shift) has Resume / Restart / Quit, then *Today: Menu* and *Bun Voyage: Settings, How to Play*. Settings is its own card: *The game* (Pacing, Complexity), *Phone* (sound, vibration, graphics), *App*.
- **Pacing and Complexity.** Difficulty is now called Pacing (Chill, Balanced, Stressful). Business mode is now Complexity (`src/game/complexity.ts`): *Simple* cooks and serves (no menu, prices or ingredients; the truck earns a little less), *Balanced* runs the business with the Prep screen kept to its collapsed lines, *Complex* opens the ledger. It changes at any time; only two save flags move (`biz`, `simplePlan`), so reputation, reviews, upgrades and the plan are kept when a player steps down and back up. Prep's "Keep it simple" / "Show more detail" is the same dial.
- **Town sheet.** No region line or drag bar; the crowd is a tag beside the name, with Big city and You're here tags; the blurb and the crowd's blurb are one paragraph; a 44 px close button. A locked town shows a box, not a button: what opens the road and the shift pips for it.
- **Menu** (from the dock or the pause menu) lists this town's burgers, then *Down the road*: every other town's burgers, greyed with the unlock rule when the road is closed. The first-time "Tap a town" tip and the "x of 12 towns" line are gone.

## 15. After build #36: the grill counter and the trays

James's build #36 notes on the grill and the top trays, as built (`src/scenes/counter.ts` grill block, `src/render/machines/griddle.ts`, `src/scenes/tray.ts`).

- **A wider griddle in three identical zones.** About 82 cm across (a third wider than before), split into three zones by shallow grooves. Each zone has a chunky push button on the front ledge labelled OFF, WARM or HOT; a tap cycles off, warm, hot, off. A light strip along the front edge under each zone shows its setting (blue off, orange warm, red hot) and the plate carries a faint tint to match. Every shift starts **hot, hot, off**. Hot cooks at full rate everywhere in the zone (no hotter middle any more), warm at 7% (melts cheese slowly: park finished food there), off not at all. `zones`, `cycleZone`, `ZONE_RATE`.
- **Ingredients by use.** The grillables (bun, patty, bacon, egg or pineapple) sit in a row of pans behind the griddle; everything else, cheese included since it only sometimes goes on the grill, is in a 2 x 3 cold rail down the left. The sauce caddy stands in the front left corner; sauce is drag to sauce (§12) onto the tray burgers.
- **Removed:** the smash press decor (smashing is still press and hold on a fresh patty), the utensil crock, and the warm-shelf assembly table with its three hold plates.
- **Trays, not plates.** Each customer has a kraft serving tray lined with paper on the pass. A paper plate sits on it only when that customer ordered a burger; drinks-only and fries-only trays stay bare and their sides move to the middle. Burgers are built straight on the trays. Fries sit front right, the cup back right.
- **Tray camera.** Pitched to 44° (was 24°), so trays read as trays and plates as round, while a burger's layers are still seen from the side. A tall burger shrinks a little, all at once, so its top stays clear of the receipt hanging over that tray (never below 55% of full size), and every layer stays in view.
- **Staleness moved to the trays.** Cooked pieces (grillables) waiting on a tray count `held` seconds: fine for 40 s (`HOLD_GRACE`), then they go cold over the next minute (`HOLD_RUIN` 100 s, up to 45% off that layer, "been sitting a while"). A slim bar along the tray's front lip drains green, amber, red. The warm zone is where to hold food without that cost.
- **Fixing a burger.** Drag down off a tray to lift its top layer: drop it in the trash slot, back on the grill, or on another tray; dropped anywhere else it goes back on top. A quick swipe down still bins the top layer.
- **Drinks-only and fries-only customers.** Once a shift is 15% through, 6% of orders are just a drink (most often), just fries, or both (`sidesOrder` in `src/game/menu.ts`), named after what's in them ("Road Cola", "Fries", "Fries & a drink") and priced as the sides. The receipt lists the sides as its build; scoring treats them as the whole order (equal shares), and a burger nobody asked for costs 20% and draws "didn't order a burger".

