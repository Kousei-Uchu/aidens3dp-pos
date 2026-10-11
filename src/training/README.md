# Writing a training module

A module is one TypeScript file in `src/training/modules/`, added to the list in `src/training/index.ts`. The checker (`validateModule`, run by `npm test`) refuses a module that breaks the rules below, so a mistake shows up before anyone sees it.

## The six parts

1. **Info** (`info`): a scene with at least 3 beats. Each beat is one sentence plus what moves, appears or pulses while it is read. Say what the job is, when you need it, and roughly how it works inside.
2. **Show** (`show`): the same format, but the beats show the flow as a simple picture: a token travelling between stages. Never draw the real screens here.
3. **Guide** (`guide`): steps on the real till. A step has a `target` (a spot), a sentence, and `until`: `next` (a Next button, for pure information), `press` (the person taps the spot), `visible` (a spot appears) or `state` (a test on the app state). Give a `recover` for steps whose target may be on another screen or tab.
4. **Check 1** (`check1`): goals, no arrows, everything goes right.
5. **Check 2** (`check2`): goals where customer side problems happen on purpose (`inject`). Every goal with an injection must name `taughtBy`: the id of the Info beat, Show beat or Guide step that told the person how to handle it. No admin problems.
6. **Done**: made from `recap`, a few short adult lines on what the person can now do.

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
