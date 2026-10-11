# Writing a training module

A module is one TypeScript file in `src/training/modules/`, added to the list in `src/training/index.ts`. The checker (`validateModule`, run by `npm test`) refuses a module that breaks the rules below, so a mistake shows up before anyone sees it.

## The six parts

1. **Info** (`info`): a scene with at least 3 beats. Each beat is one sentence plus what moves, appears or pulses while it is read. Say what the job is, when you need it, and roughly how it works inside.
2. **Show** (`show`): an animated demonstration the person watches at their own pace. See "Writing a Show" below. It is drawn with simplified copies of the real screens (a mock), never the live UI, and it never advances by itself.
3. **Guide** (`guide`): steps on the real till. A step has a `target` (a spot), a sentence, and `until`: `next` (a Next button, for pure information), `press` (the person taps the spot), `visible` (a spot appears) or `state` (a test on the app state). Give a `recover` for steps whose target may be on another screen or tab.
4. **Check 1** (`check1`): goals, no arrows, everything goes right.
5. **Check 2** (`check2`): goals where customer side problems happen on purpose (`inject`). Every goal with an injection must name `taughtBy`: the id of the Info beat, Show beat or Guide step that told the person how to handle it. No admin problems.
6. **Done**: made from `recap`, a few short adult lines on what the person can now do.

## Writing a Show

A Show is a `Demo`: a fixed canvas, one or more **screens** made of **nodes**, and a list of **steps**. Think of a short product walkthrough: the camera moves in on a control, a pointer taps it, the screen responds, the camera settles on the result, and a note points at it. The person watches and presses Next when ready. Nothing moves on by itself, and they never have to do anything in it.

- **Canvas**: `canvas: { w, h }` in canvas units (the welcome course uses 640 by 400, a landscape till). Every node is placed with `x`, `y`, `w`, `h` in those units, and must fit inside it.
- **Nodes** (`kind`): `panel`, `bar`, `text`, `button`, `tile`, `row`, `toggle`, `field`, `chip`, `icon`. They draw in list order, so later ones sit on top. Give each an `id`. Ids are unique across every screen of the demo. Use `hidden: true` for things a step will reveal, such as a cart line.
- **Make it look like the real thing**: copy the real label, price and layout. The mock should be recognisable the moment the person reaches Guide.
- **Steps**: each has `say` (one plain sentence, the same rules as everywhere), an optional short `title`, and any of:
  - `tap`: the pointer glides to this node and taps it. The node must be on screen and visible at that moment.
  - `set`: what changes when the tap lands, as `{ nodeId: { hidden, label, sub, value, icon, tone, color, on } }`. Use `on` to flip a toggle, `hidden: false` to reveal a line, `tone: 'accent'` on a tile to ring it.
  - `screen`: switch to another screen of the demo (a cross-fade).
  - `focus`: where the camera settles and the spotlight rings once the step has happened. With no `focus` and no `tap` the camera shows the whole screen.
  - `zoom`: override how far in the camera goes (1 to 2.2). Leave it out and the camera picks a size that fits the target.
  - `note`: a short label with an arrow beside the ringed area, for example `Tap here`.
- **Order inside a step**: the camera goes to the `tap` (or `focus`), the pointer moves and taps, then `screen` and `set` happen, then the camera settles on `focus` and the note appears. Going Back shows the finished picture. Replay plays the step again.
- **Length**: at least 3 steps. Aim for 5 to 8, one idea each. Do not teach a second process in the same Show.
- **Teach the failures here**: the Show is where the person is told how to handle what will go wrong in Check 2 (a declined card, no change). Give those steps an `id` and name it in the goal's `taughtBy`.
- **Not the real screens**: the Show is a picture. Real screens, real data and real tapping start at Guide.

`npm test` checks every Show: ids, screens, nodes that fit the canvas, taps on things that are not on screen, icons that do not exist, zoom limits. The pure maths (what the picture looks like after step N, where the camera goes) is in `src/lib/trainingDemo.ts`; the drawing and animation are in `src/ui/DemoView.tsx`.

## Spots

A spot is a button, tile or row with an id. Add `spot={SPOT.something}` to `Btn`, `Chip`, `Row` or `IconBtn`, or wrap a view in `<Spot id=...>`. Static ids live in `src/lib/trainingSpots.ts`. Grid tiles and cart lines get ids from the item (`grid.item:<id>`, `cart.line:<variantId>`). `tests/trainingspots.test.ts` reads the source, so a module cannot name a spot that is not there.

## Goals and hints

A goal has a `title`, an `until` (never `next`), a `ladder` of at least two hints from vague to specific, and a `reveal` spot. Each press of Hint goes one rung up. After the last hint the answer is ringed on screen. If the reveal spot may be off screen (a phone), give a `via` spot to point at first. Write hints as pointers, not instructions: the first should only say where to look.

## Injections

- `cart`: start with these lines in the cart (practice item ids, see `src/lib/trainingSandbox.ts`)
- `decline`: the practice terminal declines the card this many times (code 51), then approves
- `ledger`: replace the drawer contents (for example no small change)

## Practice data

Guide and Check run on fake data (ids start with `train-`). Nothing is written to storage, Shopify, the history files or the card reader. The real state is held in memory and put back on exit. Settings, Staff and Diagnostics are not available unless a module lists the route.

## Rules for the words

Plain, adult, short. No em dashes, no emoji, no ASCII art. Say what to do, not how it feels.
