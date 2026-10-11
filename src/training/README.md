# Writing a training module

A module is one TypeScript file in `src/training/modules/`, added to the list in `src/training/index.ts`. The checker (`validateModule`, run by `npm test`) refuses a module that breaks the rules below, so a mistake shows up before anyone sees it.

## The six parts

1. **Info** (`info`): an animated explanation in the same format and style as Show (see "Writing a Show or an Info"), with at least 3 steps. Say what the job is, when you need it, and roughly how it works inside, with pictures that build up as it goes: cards, chips, icons and panels appearing, highlighting and settling. Info explains; it does not walk through the real screens (that is Show).
2. **Show** (`show`): an animated demonstration the person watches at their own pace. See "Writing a Show" below. It is drawn with simplified copies of the real screens (a mock), never the live UI, and it never advances by itself.
3. **Guide** (`guide`): steps on the real till. A step has a `target` (a spot), a sentence, and `until`: `next` (a Next button, for pure information), `press` (the person taps the spot), `visible` (a spot appears) or `state` (a test on the app state). Give a `recover` for steps whose target may be on another screen or tab.
4. **Check 1** (`check1`): goals, no arrows, everything goes right.
5. **Check 2** (`check2`): goals where customer side problems happen on purpose (`inject`). Every goal with an injection must name `taughtBy`: the id of the Info beat, Show beat or Guide step that told the person how to handle it. No admin problems.
6. **Done**: made from `recap`, a few short adult lines on what the person can now do.

## Writing a Show or an Info

Both stages are a `Demo`. Show demonstrates the job on mock screens; Info explains it with diagrams and cards built from the same parts. A `Demo` is: a fixed canvas, one or more **screens** made of **nodes**, and a list of **steps**. Think of a short product walkthrough: the camera moves in on a control, a pointer taps it, the screen responds, the camera settles on the result, and a note points at it. The person watches and presses Next when ready. Nothing moves on by itself, and they never have to do anything in it.

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
- **Text must fit**: labels are checked against their box (a single line must fit its width, a wrapping `text` node its height) and `npm test` names the node that is too long. Shorten the label or make the box bigger. The note is placed beside the ringed area inside what the camera can see, and the camera eases out if it has to, so a note is never cut off; keep notes short (about 20 characters a line, two lines at most).
- **Length**: at least 3 steps. Aim for 5 to 8, one idea each. Do not teach a second process in the same Show.
- **Teach the failures here**: the Show is where the person is told how to handle what will go wrong in Check 2 (a declined card, no change). Give those steps an `id` and name it in the goal's `taughtBy`.
- **Not the real screens**: the Show is a picture. Real screens, real data and real tapping start at Guide.

`npm test` checks every Show: ids, screens, nodes that fit the canvas, taps on things that are not on screen, icons that do not exist, zoom limits. The pure maths (what the picture looks like after step N, where the camera goes) is in `src/lib/trainingDemo.ts`; the drawing and animation are in `src/ui/DemoView.tsx`.

## Spots

A spot is a button, tile or row with an id. Add `spot={SPOT.something}` to `Btn`, `Chip`, `Row` or `IconBtn`, or wrap a view in `<Spot id=...>`. Static ids live in `src/lib/trainingSpots.ts`. Grid tiles and cart lines get ids from the item (`grid.item:<id>`, `cart.line:<variantId>`). `tests/trainingspots.test.ts` reads the source, so a module cannot name a spot that is not there.

## Goals and hints

A goal has a `title`, an `until` (never `next`), a `ladder` of at least two hints from vague to specific, and a `reveal` spot. Each press of Hint goes one rung up. After the last hint the answer is ringed on screen. If the reveal spot may be off screen (a phone), give a `via` spot to point at first. Write hints as pointers, not instructions: the first should only say where to look.

## Going off course (Guide and Checks)

A person in a Check is free to tap anything the course allows, so the app watches for mistakes and guides them back. The Guide does the same, one step at a time, with the same three rules. When a goal (or Guide step) starts, the app remembers the practice till as it began. From then on it compares. Each goal or step says what may change:

- `allow` (required, may be empty): any of `add`, `remove`, `qty`, `discount`, `adjust`, `customer`, `note`, `tender`, `sale`. Changing anything not listed is off course. Removing something the person added themselves is never a mistake.
- `at` (optional): `{ tabs, routes, sheets }`, where the work happens. Another tab or page is off course, and `sheets: false` means any open window is. Left out, it is the course's own tabs and pages with windows allowed.
- `watch` (optional): mistakes specific to this goal, `{ id, when(snap), say, target?, via?, how?, taughtIn? }`. `how` is the plain steps to put it right and `taughtIn` the module that teaches them (left out, this module). These are checked before the general ones, so use them for a wrong choice that looks like progress (for example taking out the wrong item).

For a Guide step the three rules are optional. `allow` is worked out when left out: a step that waits for a tap on a grid tile allows `add`, one that waits for a tap on a cart line allows `remove`, and any other step allows nothing. A step that waits on the till changing (`until: state`) must say `allow` itself, and the checker refuses it if it does not. While a Guide step is off course the screen stays dimmed with only the fix left open (so nothing else can be opened by accident); the dimming lifts only when there is nothing on screen to point at. Skip is hidden.

**Windows.** A Guide step does not allow windows (sheets) unless it says `at: { sheets: true }` or waits for one to open (`until: visible`). A step that points at a control inside a window (`line.minus`, `line.remove`, `sheet.close`) must say `sheets: true`, and the checker refuses it if it does not. When a cart mistake is being fixed, an open window is never reported as a second mistake: the card keeps to one message and says it for what is open (the minus button in the line window, or "close this window first" when the window cannot hold the fix). See `fixCandidates` in `src/lib/trainingCourse.ts`.

**Gestures.** The cursor shows how to do something: `gesture` on a Guide step, on a Check goal (used when the answer is revealed) and on a Show or Info step (with `tap`). It is one of `tap` (the default), `double`, `triple`, `hold`, `swipe-left`, `swipe-right`, `swipe-up`, `swipe-down`, `scroll-up`, `scroll-down`. A Guide step that points at something and waits on the till changing must say its gesture. Inside the ringed box only that gesture works: a swipe or scroll step blocks taps there (`gateAllowsTap` in `src/lib/trainingGate.ts`), so the swipe-to-remove step cannot be answered by opening the line underneath.

Each deviation is explained in one plain sentence, with the control to tap ringed and pointed at. It appears after about a second, so a normal path is never flagged. If it can only be fixed by starting over (a sale went through, a payment was started), or the person is still stuck after 12 seconds, **Start this part again** is offered. Each deviation also carries the steps that put it right and the module that teaches them, from the table in `src/lib/trainingRemedies.ts`. The card shows the steps at once when the person has not finished that module, and keeps them behind a small "?" button when they have (Hint opens them too while the card is showing), so nobody is stuck on a fix they have forgotten. **If you build a module, use the ids that table names** (`cart`, `discounts`, `price-adjust`, `customer`, and so on), so "taught in" points at it. A **Start again** button is always on the bar in a Check. It puts the practice till back exactly as the goal began, so nobody can get stuck. The rules are in `src/lib/trainingCourse.ts`.

## Colours

The spotlight (the ring, the dim, the glow, the PRACTICE badge and the Show note border) takes its colours from the current theme: `useSpotlight()` in `src/ui/spotlight.ts`, worked out by `spotlightPalette` in `src/lib/trainingPalette.ts`. Use it, never a fixed colour. The ring is the theme's accent when it stands out from the dim, a chosen accent that is too dark is lightened, and an almost black accent (the light theme) uses the theme's card surface.

## Injections

- `cart`: start with these lines in the cart (practice item ids, see `src/lib/trainingSandbox.ts`)
- `decline`: the practice terminal declines the card this many times (code 51), then approves
- `ledger`: replace the drawer contents (for example no small change)

## Practice data

Guide and Check run on fake data (ids start with `train-`). Nothing is written to storage, Shopify, the history files or the card reader. The real state is held in memory and put back on exit. Settings, Staff and Diagnostics are not available unless a module lists the route.

## Rules for the words

Plain, adult, short. No em dashes, no emoji, no ASCII art. Say what to do, not how it feels.
