# Creating a training module: step-by-step checklist

This is the **do-this list** for adding one course. The *why* and the writing rules live in the writer's guide
(`src/training/README.md`) and in `docs/TRAINING_PLAN.md`; this file is the order to do things in, so nothing is
forgotten. Work top to bottom. Every step ends in a check you can run or eyeball.

The one rule that overrides everything: **the course's look, feel and wording are the product.** The graph,
guidance and sandbox are only there to *place* it in the run. A module never changes how a real screen looks.

---

## 0. Pick the course and read before writing

- [ ] Take the next unbuilt id from `docs/TRAINING_PLAN.md` (**State of play → Next**). Use that id exactly.
- [ ] Read the two or three **nearest** built modules first (same tier / same tab). They are the template for
      shape and tone: `src/training/modules/pay-cash.ts` and `scanning.ts` are good structural models.
- [ ] Skim the writer's guide `src/training/README.md` (the six parts, the ladder, the wording rules).
- [ ] Write down, before any code:
  - the **golden path** (the one correct way through the real screens),
  - the **guide steps** in order (each: the spot, the sentence, `until`),
  - the **Check 2 failures** (the mistakes this course teaches you to recover from), and
  - whether any failure needs a **stray** the sandbox must cause (a decline, a wrong figure, an injected order).

> The course must not cover admin screens (Settings, staff, registers). Those are `refund`/`customer` territory,
> not a checkout course.

## 1. Practice data: only if the course needs records

- [ ] Add any items, variants, collections, customers, bundle deals or orders the course assumes to
      `src/lib/trainingSandbox.ts` (and `trainingOrders.ts` for orders). **Prefix every id with `train-`** so it
      can never collide with a real record.
- [ ] Reuse before you add: the welcome course's practice cart is the base; add only what this course needs.
- [ ] If a runtime record must exist **only in this course** (not in the everyday till), give it a `modules` tag
      when it is registered; see the per-instance scope in `docs/ROUTEGRAPH_GUIDANCE.md` (0115). A record with
      `modules: ['<id>', 'real']` shows in both; `modules: ['<id>']` shows in practice only.
- [ ] Check nothing you added leaks into the real app: practice ids carry `train-`, and generated data is tagged.

## 2. Spots: only the ones that don't exist yet

- [ ] Add a new **static** id to `SPOT` in `src/lib/trainingSpots.ts` (or a **dynamic** prefix + helper if the
      control is per record, e.g. `cashDenomSpot`). Comment it the way the neighbours are commented.
- [ ] If it is a control inside a window/sheet, add it to `WINDOW_SPOTS` (or an `isWindowSpot` prefix), or a guide
      step that points at it can't say `at.sheets: true`.
- [ ] Put `spot={...}` / `ref={spotRefFor(...)}` on the **real** control in the UI. The spot is an annotation; it
      must not change layout, colour or behaviour.
- [ ] **Add the spot to the control table `src/lib/appControls.ts`**: static goes in `SPOT_SCREEN`, dynamic goes in
      `PREFIX_SCREEN`, a per-line control goes in `LINE_WINDOW_PREFIXES`. This is how the graph knows where the
      control lives. `tests/appnavgraph.test.ts` fails if a spot declared in `trainingSpots.ts` has no home here,
      so this step is not optional.
- [ ] Run `npm test -- tests/appnavgraph.test.ts` (or the full `npm test`): **every spot must have a home**.

## 3. Write the module file

- [ ] Create `src/training/modules/<id>.ts` with the six parts in order: `info`, `show`, `guide`, `check1`,
      `check2` (and `recap` if the neighbours have it).
  - **Info**: animated explanation, **at least 3 demo steps** (most courses use 5–7). Explains the job; it does
    not walk the real screens.
  - **Show**: a watched demonstration on mock screens, **at least 3 steps**, never self-advancing.
  - **Guide**: steps on the real till. Each step has `target` (a spot), a sentence, and `until`
    (`next` | `press` | `visible` | …), plus `allow`/`at`/`watch` as needed. Give the person room; don't narrate
    every tap.
  - **Check 1**: goals the person hits on their own.
  - **Check 2**: goals that need recovery. **Every Check 2 goal needs `taughtBy`** pointing at a guide step, and
    at least one **`inject`** that causes the mistake. Check 2 never covers admin.
  - **`allow`**: the tabs/routes the course may use. Most checkout courses are `tabs: ['checkout']`; `refund`
    also allows `more`.
- [ ] Follow the wording rules: plain, short, no jargon, no blame, one idea per sentence. Match a built module's
      voice rather than inventing one.
- [ ] Keep ids unique across the module (demo node ids are unique across the whole demo).

## 4. Register it

- [ ] `src/training/index.ts`: import the module and add it to `MODULES` (in plan order).
- [ ] `src/lib/trainingRemedies.ts`: set `PLANNED_TITLES[<id>] = '<Title>'` so a stray mistake can name the course
      that teaches it.

## 5. Graph and navgraph (the routegraph layer)

- [ ] If the course introduces a **new place** (a page, a sheet, an overlay) or a new **screen**, add it to
      `src/app.navgraph` + `src/app.navschema`, with a `modules: [...]` tag when it is run-specific (practice vs
      real). A shared sheet that opens over several homes stays **anonymous** on purpose so it folds into the page
      under it.
- [ ] `npm run graph:build` and **commit the regenerated `src/lib/appNavgraph.generated.ts`**.
- [ ] `npm run graph:check` must pass (it fails on any drift between the graph and the generated mirror).
- [ ] Sanity-check scoping both ways: the course must not be guided into a real-only place, and the real till must
      not be guided into a practice-only one. (This is what the `modules` tag is for.)

## 6. Tests

- [ ] Add `tests/training<id>.test.ts` modelled on the nearest module test: it walks the golden path through the
      pure run/cond helpers, and checks the Check 2 injections produce the taught failure.
- [ ] `npm run typecheck`: clean.
- [ ] `npm test`: all green. This also runs `validateModule` over every module (it refuses a broken one before a
      person ever sees it).
- [ ] `npm run graph:check`: clean.
- [ ] If help text changed: `npm run help:check` (and `npm run help:build` if you edited help source).

## 7. Docs and delivery

- [ ] `docs/TRAINING_PLAN.md`: mark the course **Built** in *State of play* and move **Next** to the following id.
- [ ] `docs/PROGRESS.md`: add the row for this increment.
- [ ] `docs/patches/0NNN-plan.md`: the plan for the increment (what/why), matching the neighbours' format.
- [ ] `patches/0NNN-<slug>.patch`: the patch of the increment.
- [ ] `docs/DEVICE_TESTS.md`: add the on-device test entry for the course.
- [ ] Commit, push the dev branch, and open the PR. (Work on a branch; `main` takes merged PRs.)

---

## Before you call it done: the smoke pass

- [ ] Run the course start to finish in the app on a **device** (Info → Show → Guide → Check 1 → Check 2).
- [ ] Every guide step's ring lands on the **right** control, and the "off course" card leads **back into this
      run**, not into a real-only screen.
- [ ] Every Check 2 failure can actually be caused by the sandbox, and the fix the course shows is the fix that
      works.
- [ ] Nothing about the real screens changed: no new labels, colours, spacing or behaviour; only the spots.
- [ ] Real app (Demo / Help) still reaches its own screens: the practice-only places did not close a door there.

---

## The checker's rules (quick reference)

`validateModule` (run by `npm test`) refuses a module that breaks any of these, so you find mistakes before a
person does:

- the six stages are present and non-empty; Info and Show have at least 3 steps;
- every `target` / `allow` spot is a **known** spot (`isKnownSpot`);
- a step that points inside a window says `at.sheets: true`;
- Check 2 goals carry `taughtBy`, and every `inject` names a real course failure;
- ids are unique where they must be; `allow` names real tabs/routes.

If it refuses, the message names the rule; fix the module, never the checker.
