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
- **Drinks:** labels sit in a row on the machine (now the push buttons themselves, §16); the pour falls from a spout into the back of the cup so it can be seen.
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

- **Window line.** Every counter faces the serving window, so the player stands with their back to the street side wall. **Grill** is the prep unit and lamp shelf: a stepped 3 x 3 cold prep unit on the left with the sauce caddy in front of it, the griddle (warm zone behind a rail on its right) and a warm shelf over the griddle's back edge (reworked in §15). **Fryer** is a front pass: freezer bin, two wells on a hang rail, the topping station, carton stacks and pack pads along the front. **Drinks** is the ice and drink tower (cup tubes S/M/L, ice lever) beside the low fountain, lids and straws in front. **Supplies** is the wire rack behind the player, holding only what restocks something: one bay per cup and carton size. Drinks, Fryer and Supplies were reworked after build #36, see §16.
- **Camera: half stops** (replaced after build #36 by one stop per counter, see §16). One zoom for every counter (about 1.35 m across). The fryer line is wider than the screen, so it has two stops: tap its tab again, swipe along the bar, or carry something to the screen's edge and rest there. Pips on its tab show which end you're at. Supplies is reached by turning round on the spot. `STOPS` in `src/scenes/counter.ts`.
- **Low pass tray.** The tray band is the window ledge: plates on a steel pass shelf seen nearly side on, with sides beside each burger.
- **Drag to sauce.** One gesture: press a bottle in the caddy and the plates with a burger started light up. Dragging up toward a plate eases a close-up out of that plate (the tray scene through a second camera, src/scenes/saucezoom.ts) while the rest of the truck dims; about 80% of the way to the close-up's middle it locks on and the burger fills a square over the tray band. From then on moving the finger squeezes a line, landing 34 px above the fingertip so the finger never hides it. The shared level bar (the one the drink pour and the salt shaker use) runs down the left of the close-up, showing coverage with a Perfect line, and a chip at the top gives the live score ("A bit more", "Perfect", "Too much", or "Not on this order"). Letting go puts the bottle back and the view eases out. A plain tap on a bottle shows how to use it. Sauce goes on tray burgers only. **Scoring:** coverage of the middle of the bun (out to 85% of its radius) under the line: 25 to 50% is perfect, under 12% stingy, over 66% drowning.
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

## 16. After build #36: drinks, fryer, supplies and the line

*Supplies, straws, the stack counts and the drinks and fryer sizes changed again after build #52: see §18.*

James's build #36 notes on the other three counters and on the truck as a whole, as built (`src/scenes/counter.ts`, `src/render/machines/{drinks,fryer,supplies}.ts`, `src/main.ts`).

- **One stop per counter, no turning round.** The truck is drawn wider than it could be so all four counters face the window: Drinks, Grill, Fryer, Supplies, left to right, one camera stop each (`STOPS`, `PAGE_CX`). The fryer's second stop, its edge carry and the tab pips are gone, and so is the turn to the back wall.
- **Stainless everywhere.** The counter top is brushed stainless (`counterTop` in `src/render/wear.ts`).
- **One trash slot.** A single chute runs along the front edge of the whole line, at the same depth on every counter; each counter's stretch lights up when a drop would bin something (`buildTrash`, `TRASH`).
- **Drinks.** The ice bin and the fountain share the back wall at the same size; the middle of the counter is open. Cups stand in nested stacks in the front row (S, M, L), beside a lid stack for each cup size and the straws. An empty cup can be put down **anywhere** on the open counter or straight under a nozzle, and any cup, full or not, can be picked up and moved (`cups`, `placeCup`). A cup under a nozzle pours from the drink's **push button** on top of the fountain: a cap with the short name (Fizz, Pink, Cola, Water, Tea) that presses in while it pours. The first pour gives an empty cup its flavour; a cup with another drink in it won't take a second one. Lids must match the cup size. Soda is paid for as it pours, so moving cups is free.
- **Level bar.** While pouring, a big bar fades in down the left of the counter with the cup's level, the full band shaded and a **Perfect** line at 90% (`DRINK_FILL`); it fades out on release. Scoring is unchanged: from 78% is a full cup.
- **Spills** can spread to twice the old size, and the hint no longer mentions what they cost (the cost still shows in the day's takings).
- **Fryer on one screen.** A bigger potato freezer at the back left; the fryer beside it **drops into the counter** (only its deck, wells and a low back panel show); the toppings stand in a column down the right, gravy, curds and salt from the back; carton stacks and the two pads along the front. The 3D panel meters are gone: each loaded basket's UI meter sits in its window on the fryer's back panel, so there's one meter, not two.
- **Beeps.** A basket in the oil beeps from perfect on (faster once it's overdone) until it's lifted (`events.beep`, `sfx.beep`).
- **Proportional fries.** One scoop is 17 fries everywhere: in hand, in the basket (a mound from the middle out, so a small scoop looks small), and in the boats (S one scoop, M two, L three). `FRIES_PER_SCOOP`, `makeBasketFries`.
- **Shake to salt.** Hold the shaker over fries in a carton (on a pad or on a tray) and shake: each change of direction is one shake, `SALT.shake` (0.1). The level bar shows the salt with the Perfect line at 0.6 and the good band 0.35 to 0.9. `Fries.salt` is now that level: none costs 15% as before, a little under costs 7% ("could use more salt"), over 0.9 costs 20% ("too salty"); it tops out at 1.2.
- **Supplies.** A shelf of shallow steel bins on the counter: cup sleeves down the left, paper-boat sleeves down the right, small at the back to large at the front. Each bin has a die-cut **sticker** on its sloped front rail with a cup or fry-boat drawing, the word and a big size badge (`stickerTex`). The wire rack and the rag are gone.


## 17. After build #41: the Dusk UI look

James picked option C, "Dusk", from the round-3 UI study (five full looks, fonts, logos and menu structure; study in the project Library). It replaces Bistro everywhere, through the same token and class names in `src/ui/` (`tokens.css`, `components.css`).

- **Palette.** Slate-blue ground (`#2a3340`) behind the map and the Closing hero, cream paper cards (`#f6f2ea`) on top. Ink is a cool near-black, the accent is coral (`#d8573a`), stars and the logo's second word are butter (`#d9a93f`), good news is pine green. Dark surfaces use the `.bv-night` tokens; `.bv-light` forces cream inside them (dock, town sheet).
- **Type.** Young Serif for names and titles (heavier than Instrument Serif, which James found too thin), Hanken Grotesk for everything else, DM Mono for money, time and build numbers. Tracked small caps for eyebrows.
- **Logo.** "Bun" over "Voyage" in Young Serif, Voyage in butter with a dashed coral route under it. Text only, so it scales and needs no asset.
- **Home.** One dark dashboard card groups the morning/evening Day tile (coral), budget, popularity and rating, with Menu, Reviews and Supplies as a button row under them. Help and Settings are icon buttons by the logo. The dock and the town sheet are cream.
- **Pause sheet.** Resume; Restart shift and Quit to map side by side; a "This shift" group with Today's menu, Pacing and Complexity; then doors to Settings and How to play. Settings is split into Play, Device and App.

## 18. After build #52: a simpler kitchen

Build #52 replaced Supplies with a fourth counter, a Cold bar (soft serve and shakes). James asked for it to go, and for a batch of simplifications across the other counters.

- **Three counters.** Drinks, Grill, Fryer. The Cold bar (its machines, desserts, orders and scoring) is gone, and Supplies is not coming back: **stacks never run out**, so there is nothing to restock and no sleeves (`Stack` has no count; `STACK_SHOWN` is only how many are drawn). The leftover-stock save field is gone too.
- **Stack labels** show only the size (S, M, L): no counts on cups, lids or fry boats, and the lid stacks are not labelled "Lid".
- **No straws.** A drink is cup, ice (unless "No ice"), pour, lid. Straws are gone from the counter, the cup model, scoring, receipts, the how-to and the Drinks tab drawing.
- **Drinks counter.** The ice bin is half as wide (`makeIceWell(0.5)`), and the fountain is drawn 1.22 times its model (`FOUNTAIN_SCALE`) so the push buttons are bigger. Cup stacks run along the front left and the lid stacks along the front right, spread over the room the straws left.
- **Fryer counter.** The potato freezer is half as wide (`FREEZER.w` 1.6), and the fryer and its baskets are drawn 1.3 times (`FRYER_SCALE`) in the freed room.
- **Eggs.** The egg flat holds six big eggs at the same exaggerated scale as the fried egg. Tap one (or drag it out) to pick it up; it stays in hand, hovering over the grill. Tap it on a clear spot of the grill: a **quick, crisp tap** (under 220 ms, no slide: `EGG_CLEAN_TAP`) cracks it open in one, a slower one only cracks it and a second tap opens it. The fried egg lands where it was tapped and the two **half shells stay in hand until they're dropped in the trash** slot. While an egg or shells are in hand, presses on the grill counter move them (`eggHand` in `src/main.ts`, models in `src/render/egg.ts`). An egg tapped back on its flat is refunded.
- **Patties.** Cooked on one side only: both faces brown together (`COOK_SPEED.patty` 0.255, medium from about 21 s to 33 s on a hot zone) and patties no longer flip. Orders never ask for a doneness: every patty goes out **medium**. Rare or well done score 0.8 for that layer (`PATTY_OFF`, "patty a bit rare / well done") and tick the receipt; raw and burnt still fail and show red. The grill tag is one pill with a tick at Medium; receipts lost their doneness pills (the smash mark stays).


## 19. Menus, the header and the night

James asked (after build #53) for less clutter around the shift. What changed:

- **Header.** No town name. The clock shows the time of day inside the shift's window (11:00am to 3:00pm by default, `src/game/shift.ts`: `ShiftWindow`, `clockAt`, `shiftProgress`, `clockLabel`) over a thin bar for how far through the shift it is; the bar turns coral and the clock says *Closing* once the window has shut and the last orders go out. Money stays to its right. The bell button says **Next** (then *Again* when armed) and rings a synthesized desk bell (`Sfx.bell`: striker tick, five inharmonic partials, a doubled fundamental that shimmers) instead of the old sine ding.
- **Pause menu.** A "this shift" panel: the clock, the window's ends, Pacing (read-only: it is set before the shift), served / waiting / left hungry / average stars, about how many people are expected and the takings, a star tally and the two latest written reviews. Under it, *Today's menu* in brief: only today's burgers, each as a small stack with its build between the buns, toasted / melted / smashed tags and when a late dish joins; a link opens the full menu. Settings and How to play are icon buttons in the header. No build number, no Complexity. **Restart shift | Quit to map**, then **Resume** last, sit in a footer pinned to the bottom; tapping Restart or Quit swaps the footer for the question with *Cancel* (×) and the action (with its icon) in the same box, so nothing moves.
- **Map dashboard.** One row: the Day tile, then Popularity and Rating side by side as one button that opens **Popularity & reviews** (both numbers explained, then the reviews and filters), then Menu (Results in the evening). Budget and Supplies are gone from it; Sleep and Drive no longer show a price.
- **The night.** Sleep no longer opens a card to tap through. The map dims to night where it is, a moon, *Night in <town>*, the day counter rolls over (Day 4 → 5), today's popularity and rating changes count up, then dawn washes the map back to morning and the overlay fades (about 3.8 s; a tap skips it). `playNight` in `src/screens/home.ts`.
- **Dev mode** (bottom of Settings, from the map). Turning it on shows **Simulate progress: Off · 0% · 50% · 100%**, which swaps in a made-up trip (towns worked breadth-first along the roads, matching day, popularity, ratings, reviews and upgrades; `src/game/devmode.ts`). The real save is kept in `bv-save-real` and comes back with Off or when dev mode is turned off. A dashed *Sim 50%* badge by the logo says when a simulated trip is in play.

## 20. After build #54: grill, tickets and the kitchen

James's build #53 gameplay notes, as built.

- **Tickets.** Counts sit right after the name ("Pickles x3", "2/3" while short). Leave-offs read "NO Lettuce", add-ons "ADD Bacon" / "ADD Tomato x2"; a counted topping asked for extra keeps one line with its full count and an "ADD n" chip. A folded stub is the patience bar, the short name and its exceptions (`exceptions()` in `src/ui.ts`). Eggs carry a Sunny or Flip chip.
- **One doneness meter** for patties, eggs, bacon, buns, pineapple and fries (`cookMeter`, `COOK_SCALE`, `cookLevel`): three regions in the ingredient's colours (not done, done, over; the end is burnt), a dark line at perfect, a caret over the reading and a pale veil over what's still ahead. No words.
- **Grill zones.** Left is a ridged grille: patties searing there gain grill marks (`Piece.marks`, `MARK_RATE`), each marked patty adds `GRILL_MARK_BONUS` (two at most, "grill marks" perk). An egg cracked on the grille is a mess to rub off (`counter.messes`). Middle is flat (eggs only here). Right starts on WARM, which no longer cooks at all; nothing goes stale on the grill.
- **Flips.** Tap or flick up to flip patties, bacon and eggs (not buns). Faces cook at full heat down and 35% up; patty doneness is the average, and a face past `CHAR_FACE` is "charred on one side". Eggs: sunny side up unless the recipe says `egg: "over"` (Ranch Breakfast); the wrong style scores 0.75.
- **Timings.** Patty medium ~21-33 s, bacon crisp from 18 s, egg set from 18 s (overdone 44 s), bun toast ~10 s, cheese melts in ~3.3 s on hot (a third of the old pace).
- **Stacks.** Drop a bun on a bun or a patty on a patty on the grill to stack them (up to 6); only the bottom cooks, the meter shows the top with a ×N count.
- **Toast.** Only 7 recipes come toasted; 5% of other orders after the first fifth of a shift ask for it (`TOAST_CHANCE`, modifier type "toast").
- **Scale.** Counter food is 1.15× life (`COUNTER_FOOD`, was 1.5×); the cold rail fits heaps evenly so pans match the piece in hand; the griddle is 87 cm and holds about six patties a zone.
- **Fryer.** No knobs; gravy in a heated well at the back right, curds in a cooled tray in front of the potato freezer, salt below the gravy.
- **Carrying.** Held things hover at the point under the finger at hover height, so they don't jump on release. Over the trays a cup or carton previews at its landing spot and size; dashed outlines mark where ordered sides go. A leaving customer takes the plate.
- **Tray study.** `?tray=kraft|diner|sheet|board|basket` (or the bv-tray setting); default kraft until James picks.

## 21. A simpler economy: savings, town bonuses and the Garage

James asked (2026-11-01) to strip the money layer back, then picked option C from the study: money is kept as **savings**, spent on bonuses and on looks for the truck.

**Gone:** gas money, Supplies and range upgrades (range is a flat 175 mi a night, 130 since §24), the Complexity slider, social media / ads, ingredient-quality and price toggles, running costs and solar, the ledger and the business-mode plan.

**Who comes.** Customers = town trade × crowd traffic × popularity × rating × menu length (0.8 with two recipes to 1.1 from six) × the shift window's share of the lunch curve × the Sandwich board (1.15) ÷ pacing. Popularity and rating are only earned by cooking (`src/game/day.ts` `expectedCustomers`).

**Prep & Open** (`prepHtml`, before every shift after the tutorial). *Expect today* in two columns: the number of customers and the town's crowd type (Families, Foodies...) on the left; popularity, rating and critic odds stacked on the right. Then the **shift window**: the day's lunch curve as bars over a two-thumb slider, between 9am and 5pm, at least four hours (`MIN_SHIFT`; default 11 to 3; quiet hours either side; `src/game/shift.ts`). The times show once, beside the Shift heading. The **menu** one burger a row: tap the row to show or hide it (at least two), the chevron to open its recipe (toasted, smashed, melted, then the layers bottom to top). **Pacing**. And **one bonus** to bring, from the ones owned, with a line about this town's bonus. All of it is frozen when the window opens. The Open button, like every main action (`.bv-btn.lg`), is set larger.

*Build after #60 (James):*
- **Menu all day.** Every burger on the menu can be ordered from opening time. Recipes marked `from` and tall ones (over six layers) are rarer early and more common as the shift goes on (`recipeWeight` in `src/game/menu.ts`), so no "Later in the day" labels anywhere.
- **Four-hour shifts.** The default window is 11 to 3. A town's `shiftLength` is now the play time of those four hours (an hour plays a quarter of it), so the default shift plays as long as before, and old saves under four hours are stretched to four.
- **Food menu icon.** The food menu (map dashboard, pause menu, Prep, How to play) uses `food-menu`, a menu card with a burger at its head, so it isn't confused with the three-line app menu.
- **Looks in the kitchen.** The customers' window wears the truck's look: the paint and belt line under the sill, the awning's hem across the top (scallops, pointed stripes or velvet fringe), and string lights or marquee bulbs along it (`CustomersView.setLook`).

**Takings** are a shift's score: what orders paid, plus tips for speed, less anything given away unordered (at its menu price) and spilled soda. They go into **savings** (`save.bank`); old saves keep their gas money as savings.

**Bonuses, one per town** (`src/game/bonus.ts`). A **great shift** (an average of 2.4★, 85% of the people who ordered served, at least six served) in a town unlocks that town's bonus; it then appears for sale in the Garage (and on Closing, with *Buy now* if savings cover it). Bought bonuses are kept; one is brought per shift. They run along the road from forgiving to fine-tuning, and get dearer:

| Town | Bonus | Effect | Price |
|---|---|---|---|
| Pinecrest | Comfy bench | Patience ×1.3, in line and at the window | $40 |
| Elk Pass | Smart fountain | Drinks stop pouring by themselves | $70 |
| Cedar Falls | Steady hands | Tossed toppings land neatly | $90 |
| Summit City | Heat lamp | Tray food stays fresh twice as long | $140 |
| Saltwater Bay | Apology cookies | Walk-outs cost no popularity | $180 |
| Gull Point | Turbo fryer | Fries 35% faster | $220 |
| Driftwood | Sandwich board | 15% more customers | $260 |
| Harbor City | Guest book | Twice the good word of mouth | $320 |
| Red Mesa | Searing plate | Grill cooks 25% faster (`counter.grillBoost`) | $380 |
| Cactus Junction | Shiny tip jar | Tips ×1.3 | $440 |
| Dust Bowl Flats | Press pass | A critic is sure to come | $500 |
| Sun Valley | Meal deal sign | Burger + fries + drink orders tip ×1.5 | $600 |

*(Superseded by the 14-town list in §24.)*

Open towns whose bonus is still to unlock carry a small gold diamond on the map, and each town's sheet shows its bonus and how far along it is. In the Garage, bonuses of towns not yet reached show as "?".

**The Garage** (`src/screens/garage.ts`, the savings button by Settings on the map; a dot when an unlocked bonus is affordable). The truck stands on a little stage (a moon button shows it at night). Tabs: **Bonuses** by region, and **Looks** by slot. Tapping a look tries it on; the bar under the truck buys or wears it.

**Looks** (`src/game/looks.ts`, drawn by `src/screens/truckart.ts`). Seven slots, one worn in each, all purchases kept. They change nothing in the kitchen. Some are modest; the *Grand* ones are priced as long goals; three souvenirs are sold only after a shift in their town.

- Paint: Coral (free), Sage $150, Butter $150, Dusk blue $250, Diner two-tone $600, Woodie $1,200, Polished aluminium $4,000, Gold leaf $40,000 (glints).
- Awning: Mustard (free), Candy stripes $120, Teal scallops $200, Velvet and fringe $6,000.
- Roof: bare (free), Herb garden $300, Canoe $450 (Cedar Falls), Surfboards $450 (Driftwood), Windmill $900 (Dust Bowl Flats, turns), Neon sign $1,500 (glows after dark), Giant burger $2,500 (on a short, thick post; it doesn't turn), Rooftop hot tub $25,000 (cedar barrel with steel hoops on a slatted deck, ladder up the back, steam, lit from inside at night).
- Lights: none (free), String lights $250 (wire clipped along the awning hem, bulbs hanging at the dips), Marquee bulbs $900 (chase at night), Searchlights $12,000 (sweep the night sky, across the road map too).
- Wheels: Steel (free), Whitewalls $200, Chrome spokes $500, Gold spinners $8,000 (keep spinning). Both fill most of the wheel.
- Inflatable (one at a time, pegged down just behind the front wheel): none (free), Inflatable fries $900 (sways), Inflatable chef $1,500 (sways, waves a spatula), Waving tube man $2,200 (flails wildly on a little blower).
- Tag-along: nobody (free), Teardrop trailer $3,000 (matching paint), Hot-air balloon $30,000 (tethered, bobbing), Airship $75,000 (floats above the truck from town to town).

**Where looks show.** The road map's truck (the same art, drawn small with thicker lines; it lights up on the evening map), the night card when the truck sleeps (parked under the stars with the window lit, bulbs and neon on, beams sweeping, then dawn), and the Garage. The catalogue page is `looks.html` beside the game. In the kitchen, the customers' window shows the paint under the sill, the awning's hem and its lights.

*Build after #58 (James):* the shop dog was retired (owners get $350 back) for the Inflatable slot; the giant burger stopped turning; the neon sign shrank; the hot tub was redrawn; the string lights now hang from the awning; chrome and gold rims got bigger.

## 22. Kitchen polish after build #57

- **Trays** are bare wooden boards (no paper mat, no plates). A dashed ring marks where the burger goes when the order has one, beside the dashed fries and cup outlines; each mark hides once that item is on. The tray being worked on has a rounded blue outline.
- **Grill marks** show only on a face that has spent 4 s down on the grille (`MARKED` 0.3), and that is also when they count for the bonus.
- **Patty doneness** is more generous: medium runs 0.38-0.74 (was 0.43-0.67), burnt from 0.97.
- **Doneness meter**: bigger (56 x 12 px), the done band always green with pale gaps between bands, a faint perfect tick, a bigger caret, and a green glow while the food is in the done band. A fuller indicator study is under way separately.
- **Grill zones**: each zone has a round power button and two lamps (off: both dark; warm: first orange; hot: both red) in place of the OFF/WARM/HOT caps.
- **Bell**: one ring calls the next person. Rings within 1.5 s of the last one only ring, so a quick double ring still calls one.
- **Counters**: the sauce caddy sits centred in the space left of the grill; the cold rails have no open lids behind them; the potato freezer has no lid, and it and the curd tray are deep wells with flanges, food well below the rim. The trash chute stops just short of the outer edges of the drinks and fryer views, bookending the three counters, and a sideways swipe along it with empty hands changes counter.

## 23. The doneness meter and counter buttons (study picks)

From the meter and tabs study (project files `meter-tabs-study/`, four rounds). James picked **M14** and **T17**.

- **Doneness meter (M14)**, `cookMeter` in `src/ui.ts`, `.cmeter` in `style.css`: an 80 x 12 px pill in a thin black rim. The bar is dark grey (#2c2f33), the done range hatched in the same grey, and the fill runs edge to edge in one flat colour for the food and its zone (patty pink / brown / dark brown; egg white / yolk / amber; and so on), flashing red and black once burnt. Thin 50% black lines mark the two zone edges on top. No perfect line, no caret, no words. Stack counts sit at the meter's top right.
- **Meters always sit below the food**, fries included: each basket's meter is on the fryer deck just in front of its well.
- **No tab bar.** The counter band runs to the bottom of the screen. Only the next counter each way is a button (Drinks to Fryer is two taps): round paper buttons with the station drawing at the screen edges, level with the trash chute (`placeNav` in `main.ts`, `.cbtn`). The lamp is the inner ring: pale when quiet, amber when that counter wants you, blinking coral when something there is about to spoil.
- **Buttons follow their counters** (`counter.viewPage`, the camera position as a fractional counter index): a counter d screens away sits at the middle, faded, at d = 0, at the edge at d = ±1, and just off screen at d = ±2. So the button you press glides to the middle and fades as you arrive, the counter you left grows back out of the middle on the other side, and one two counters away slides in from off screen. Holding something over a button for a moment still switches counter.
- **Trash chute**: deeper (z 3.05-3.75), unlit so it stays dark, with two rows of black rubber flaps meeting in the middle, a pale steel lip with a darker edge, and rounded end caps that bookend the line. Swiping along it with empty hands still changes counter.

### 19b. Card headers, grouped sections and the floating map bar (after build #62)

- **Card headers** (`modalHead` in `src/screens/modal.ts`): a darker bar with the card's icon and title on the left and × on the right, no line above the title. Settings and How to Play opened from the pause menu keep a back chevron and a small "Menu" line over the title, with no ×.
- **Grouped sections.** Settings and Prep & Open scroll on a deeper beige with each section in a pale rounded card. Graphics reads Low · Standard · High.
- **Scroll shadows.** A fixed header shows a shadow only while the page is scrolled down from the top; a fixed footer only while there's more below (`scrollShadows`).
- **Prep & Open** is a card over the map (the summary layer, `prepOpen`), titled "Town: Day N", with the same padding as the menus; a tap on the dimmed map closes it. Order: expected customers (big number beside "expected customers" and the crowd), Pacing, Shift, Menu (a *Show ingredients* switch, the burger drawn on the right), Bonus (one a row; the last pick stays selected).
- **Map.** The dark top bar floats, and under it a cream plate holds Popularity, Rating and Menu (Results in the evening) as three separate buttons. The day moved to the dock: "Day 7 · Morning in". The map zooms out to 0.6 of the whole island and pans further past the edges. Drive here has no caption under it.

## 24. Four regions, four kitchens (study pick)

From the regional study (project files `region-study/`, artifact "Bun Voyage Regions"). James picked the **Opus** proposal on 2026-11-01, with Orchard Isle flatbreads as the fourth area (no ice cream).

**Idea.** Every area keeps Drinks and Fryer; only the middle counter changes, and each area teaches one new verb. The town you park in sets the counter, so going back to the Pines brings the grill back.

### The map

- One main island plus **Orchard Isle**, reached by a causeway from Sun Valley. Map space grows to 120 by 170 units (one unit is about two miles).
- Spacing follows the land: the Pines is a Y (a valley road plus a spur up to Elk Pass), the coast a string of towns 17 to 27 apart, Red Rock a long triangle with 64 empty miles between Red Mesa and Cactus Junction, the isle a short chain.
- **Area names sit on the land** in spaced small caps over each wash. Water bodies get their own names in italics: Westering Sea, Morning Sea, Saltwater Bay, Lantern Sound, Mirror Lake, the Shallows.
- 14 towns: Pines 4, Coast 4, Red Rock 3, Orchard Isle 3. **Dust Bowl Flats is dropped** (its rodeo moves to Cactus Junction). New towns: Applecross, Larkvale, Port Amber.
- **Gated highways**, drawn dashed with a barrier and a note until open: Coast Highway (Summit City to Saltwater Bay) after Summit City; Desert Highway (Harbor City to Red Mesa) after Harbor City; the causeway (Sun Valley to Applecross) after Sun Valley. Two late links only shorten the way back: the **Old Pass road** (Elk Pass to Cactus Junction) clears once you reach Cactus Junction, and the **ferry** (Port Amber to Harbor City) runs once you reach Port Amber.

### Kitchens and menus

| Area | Middle counter | New verb | Menu | Fryer | Local drinks |
|---|---|---|---|---|---|
| The Pines | Grill (as today) | (base: drag, tap, flick, hold, squeeze) | Trailhead Classic $9, Sunrise Summit $11, Campfire Melt $11, Summit Smash $12, Lumberjack Stack $15 | Fries, poutine | Pine Fizz, Pink Lemonade |
| Sunny Coast | Panini press: 2 clamshell bays (3 at Harbor City), bread bin (ciabatta, sourdough), chicken and veggie patty drawer, tuna well, cutting board, pesto and aioli | Pull the handle down to close the lid (tap to lift); slice at Harbor City | Caprese $10, Avocado Toast $9, Tuna Melt $11, Chicken Pesto $13, Veggie Club $12 | Fries, sweet potato fries, corn in a steam well (Driftwood) | Pink Lemonade, Cucumber Cooler |
| Red Rock | Comal: one long plate, hot left, warm right; pork and beans steam wells, corn and flour tortillas, tortilla press (Sun Valley), taco rack, red/green salsa and crema | Fold a tortilla by dragging its edge across | Street Tacos $10, Quesadilla $9, Pastor Tacos $12, Bean Tostada $10, Breakfast Taco $11 | Chips and salsa, nachos (chips, queso, jalapeños), churros (Sun Valley) | Hibiscus Cooler, Lime Agua |
| Orchard Isle | Hearth oven: wood-fired dome, peel to build on, dough, sauce pot, honey and oil; 2 pies (3 at Port Amber) | Tap a pie in the oven to turn its pale side to the fire | Harvest Red $10, Mushroom $11, Fig & Ham $13, Pear & Blue $12, Calzone $14 (fold) | Fries, zucchini fritti, apple fritters (Larkvale) | Sparkling Cider, Bramble Soda |

Road Cola, Water and Iced Tea are on the fountain everywhere; the other two buttons change by area. The Pines keeps five burgers, one signature step each (plain, egg, melt, smash, double); the other fifteen burger recipes are cut (Plain Jane lives on as a Classic with NOs). Prep & Open lists only the area's dishes unlocked so far; the player shows or hides them as today (at least two). Each area scales the same way: the first town has two dishes, middle towns add a dish or two, a pan and a fryer option, and the capital adds the last dish and one machine upgrade. A new verb never arrives in the same town as a new machine.

### Bonuses (14)

Pinecrest Comfy bench $40, Elk Pass Smart fountain $70, Cedar Falls Steady hands $90, Summit City Heat lamp $140, Saltwater Bay Apology cookies $180, Gull Point **Kitchen timer** (new: a soft tick when anything reaches done) $210, Driftwood Turbo fryer $240, Harbor City Guest book $290, Red Mesa Sandwich board $340, Cactus Junction **Hot plate** (was Searing plate; any middle counter 25% faster) $400, Sun Valley Shiny tip jar $460, Applecross Press pass $520, Larkvale **Ticket rail** (new: the next customer's ticket shows early) $580, Port Amber Meal deal sign (any main + side + drink) $650.

### Events

Farmers' market (Cedar Falls), County fair (Summit City), Surf contest (Driftwood, special becomes a panini), Harbor festival (Harbor City), Chili cook-off (Red Mesa), Rodeo (Cactus Junction, a taco platter), and a new Harvest fair at Larkvale.

### Build order

1. **Map and data:** the new island and isle, 14 towns, gated highways, names on land, the Pines trimmed to five burgers, 14 bonuses, save migration (savings, bonuses and looks kept; Dust Bowl Flats progress folds into Cactus Junction). Until their counters land, the Coast, Red Rock and the isle keep a short burger menu on the grill.
2. **Sunny Coast:** panini press, breads, fillings, sweet potato fries, steam well, local drinks.
3. **Red Rock:** comal, tortillas, fold, chips and nachos, churros.
4. **Orchard Isle:** hearth oven, turn, flatbreads, calzone, fritti and fritters.

### Phase 1 as built

- **Towns and roads** (`src/game/stops.ts`). Unlock roads: Pinecrest to Elk Pass and Cedar Falls; Cedar Falls to Summit City; then one chain Summit, Saltwater Bay, Gull Point, Driftwood, Harbor City, Red Mesa, Cactus Junction, Sun Valley, Applecross, Larkvale, Port Amber (the last town of the trip). Elk Pass is the Y's spur: it opens nothing, so Summit City opens from Cedar Falls only. The Old Pass road and the ferry are `LINKS`: drivable once both ends are open, never needed to unlock anything.
- **Range** is 130 mi a night (was 175), at two miles a unit: the Old Pass road (about 120 mi) still fits in one night and nothing longer does, so the slow way round stays two nights or more.
- **Map** (`src/screens/map.ts`): positions, coastlines and roads traced from the study sketch. Gated highways are dashed with a barrier, and their note ("Opens after Summit City") shows only once one end is open. The causeway draws as a bridge; the ferry is a dotted crossing with a boat once it runs. Orchard Isle has orchard rows, vineyards and hedged fields, and its own customers' backdrop (vine rows, a barn, apple trees).
- **Placeholder menus** (`// phase 1 placeholder`): Coast Boardwalk Basic, Luau Stack, Low Tide; Red Rock Tumbleweed, Rattlesnake, Ranch Breakfast; Orchard Isle Cheesy Switchback, Sandy Pickle, Sunset Double. Two in each first town, three after. Pines: Pinecrest Classic and Sunrise; Elk Pass adds the Smash; Cedar Falls the Campfire Melt (and poutine, which Pinecrest and Elk Pass don't serve); Summit City all five. A smash order shows a press-and-hold tip if the Smash wasn't met at Elk Pass.
- **Drinks.** Five fountain buttons: the area's two, then Road Cola, Water, Iced Tea. New colours: Cucumber Cooler pale green, Hibiscus Cooler deep red, Lime Agua lime, Sparkling Cider amber, Bramble Soda dark purple.
- **New bonuses.** Kitchen timer: a soft tick when a patty, egg, bun or fryer basket crosses into its done zone. Ticket rail: the first person in line has already ordered, and their ticket hangs faded under the bell ("Next up"); it becomes their real ticket when they step up.
- **Events.** Rodeo moves to Cactus Junction and Surf contest stays at Driftwood, both without specials for now; Harvest fair at Larkvale (families, from day 15 every 7 days, 1.5× busier).
- **Saves.** Dust Bowl Flats folds into Cactus Junction (shifts added, best kept); a truck parked there wakes in Cactus Junction; any town with three passed shifts reopens its roads under the new graph.

### Phase 2 as built (Sunny Coast)

- **Middle counter by town** (`middleOf` in `src/game/stops.ts`; `Stop.press` = bays and board). Coast towns swap the grill for the press (`src/render/machines/press.ts`, `CounterView.setMiddle`); the Pines keep the grill unchanged. The counter button's drawing becomes the press (`setTabArt`). Layout: back rail of breads, proteins and the tuna well (Gull Point on); cold rail on the left (mozzarella, tomato, basil, avocado, rocket; cheddar and pickled red onion from Gull Point), as many rows as it takes; pesto and aioli in their own caddy; two bays (three at Harbor City, with the cutting board front right).
- **Verbs.** Build on the tray, bread first. With bread on top and bottom, a drag down off the tray lifts the **whole sandwich** (elsewhere it still peels the top layer). Drop a bread or a chicken/veggie patty on its own, or a built sandwich, in an open bay. **Drag the handle down** to close; **tap it** to lift. Drag the food out of an open bay to the tray or the board. At Harbor City a **swipe across the board** cuts a closed panini in half. The tuna well: a **tap is one scoop** onto the active tray (dragging works too).
- **Cooking** (`PRESS_*` in `src/game/cooking.ts`). A closed bay cooks both faces of bread and patties at once: ciabatta golden at about 12 s, sourdough 9 s, chicken done at 17 s on its own, veggie 12 s. Inside a sandwich a patty cooks at a quarter pace, so chicken is pressed first. Cheese melts in about 5 s and shows as a drip at the front of the bay; anything else just warms (a warmed avocado is a fault on the open toast). The hidden food reads on a meter in front of each bay (bread if there is any, else the patty), with a Melting/Melted chip. Closed bays smoke, sizzle and light the tab lamp when over-done; the Hot plate bonus speeds the press too.
- **Menu.** Saltwater: Caprese, Avocado Toast (open-faced: only the sourdough is pressed). Gull Point adds Tuna Melt; Driftwood Chicken Pesto and sweet potato fries; Harbor City Veggie Club, the third bay and the board. Modifiers as for burgers (NO/extra/ADD; avocado the common add, and often ADD avocado on a Veggie Club, laid on the patty); open toasts take no pressed adds. No poutine at the coast. Tickets: a Press chip on breads and patties, Cut on the top slice at Harbor City, Melt on cheese, Cold on the toast's avocado, "Sweet fries".
- **Scoring.** Bread: not pressed 0.5, a bit dark 0.85, burnt 0.15. Chicken: pink 0.1, dry 0.8. Veggie: soggy 0.45. Patties weigh as much as a burger patty. Uncut at Harbor City ×0.88. Sweet fries have their own narrower band (`SWEET_ZONE`) and fry 1.3× faster; the wrong kind of fries ×0.6.
- **Sweet potato fries** sit in a tray where the curds are in the Pines (curds and gravy are put away at the coast). A basket and a carton hold one kind at a time.
- **Menus.** Food menu ("Paninis in …"), Prep & Open rows and How to Play (a Press section in coast towns, after the Grill) draw paninis: pressed slabs with press lines, flat fillings.
- **Deferred / changed.** The corn steam well (Driftwood) is not built yet. Avocado Toast's chili salt is left out (no shaker verb for food). The Surf contest still has no panini special.
