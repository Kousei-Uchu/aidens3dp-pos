---
id: staff/training
title: Training mode
parent: staff
summary: Learn app tasks through animated explanations, a process walkthrough, a spotlighted real interface and safe practice.
tags: [training, lessons, practice, learning, checkout, scenarios, tutorial]
related: [staff, sales, sales/scanners, pay, fix]
updated: 2026-10-12
---
Open **More → Training** to learn a POS task. Courses can be started in any order.

## Basic

### How a course works
Each course has six parts:
1. **Info** is an animated visual explanation of what the task is for and when you need it. Pictures build up one step at a time, in the same style as Show, and you move on with **Next**.
2. **Show** is an animated demonstration of the whole job, drawn as a simplified copy of the till. The picture zooms in on a control, a pointer taps it, the screen responds, and a note points out what changed. You watch at your own pace: **Next** goes on, **Back** returns, **Replay** plays the current step again. Nothing moves on until you say, and you do not have to do anything yourself.
3. **Guide** opens the real POS interface with practice data. The rest of the screen dims while a bright ring and a short prompt point to the relevant control. Tap the highlighted controls or Next when a step is informational.
4. **Check 1** asks you to complete the task without the arrows, with practice data.
5. **Check 2** repeats the task with a realistic customer-side problem to recover from.
6. **Done** recaps what you can do and marks the course complete.

In the Guide and the Checks, if you wander off the path (a wrong item, a discount you did not need, the wrong screen, a window you did not need) the app says what happened, rings the control that puts it right and points at it. In the Guide the dimming lifts while you are off course, so you can tap whatever puts it right. If you have not finished the course that teaches the fix, the card also lists the steps and names the course. If you have, tap the small **?** on the card (or **Hint**) for the steps. If it cannot be undone with a tap, or you are still stuck, tap **Start this part again**; **Start again** on the bar does the same at any time. Tap **Hint** for a pointer. Each hint appears in a small card at the top of the screen ("Hint 2 of 4") and in the bar at the bottom, and pulses once so you can see it arrived. On the main screen the card fades after a few seconds and the bar keeps the text; inside a window it stays until you tap its **x**. Each hint becomes more specific; after the last hint, the app highlights the answer. If you tap Hint again after that, the card pulses again so you know the tap was heard. Pages in Training slide in as the old one drifts away, and starting or leaving practice fades through the page colour instead of cutting. Training uses a separate practice register state. Your ticks are always saved under you, even while the practice till is signed in as Casey or Morgan. Your live cart and sales are restored when you leave; practice changes are not saved, sent to Shopify, or charged to the reader.

The moving cursor shows how to do each thing: a tap, a double or triple tap, a press and hold, a swipe or a scroll. In the Guide only the ringed spot works. Everything else is dimmed and cannot be tapped, and a swipe step does not let a tap open the line underneath. If you open a window while fixing a mistake, the card talks about that window (for example the minus button) instead of telling you to close it.

### Courses so far
- **How training works**: a five minute tour of the six parts.
- **Sign in, lock and switch staff**: sign in with a PIN or a cashier pass, hand the till to a colleague from the grid, and lock it when you step away. Practice uses two practice people, **Casey** (a cashier, PIN 1234) and **Morgan** (a manager, PIN 2468, with a cashier pass). They exist only inside practice. When a step asks you to scan a pass, a drawn practice pass appears with a **Scan this pass** button, because a camera cannot scan a pass that is not real.

- **Build a cart**: add items by tapping tiles, add more of the same, and take an item out by swiping its line to the left and tapping Remove.
- **Customers and notes**: attach a customer by picking or searching, create one who is not on the list (made on this iPad only in practice), put a note on a line with Done, and take the customer off with the small x.

More courses are added one at a time, most important first.

### Progress
Completion and stage progress are saved on this device for the signed-in staff member, or shared on the device when nobody is signed in. You can revisit completed stages or repeat a course.

## Deep

Info and Show are each a list of steps over a few mock screens or diagrams. Each step can zoom the camera, move a pointer to tap a control, change what is on screen, and settle with a ring and a note. Course scenes, spotlight targets, Guide steps, Checks, recovery injections and hint ladders are declared separately from the shared runner. The Guide and Checks swap in fixture products, customers, cart, drawer and settings while the actual Checkout screens remain mounted. A guard blocks app persistence, CSV writes, Shopify calls and receipt uploads; card payments use a pretend terminal. The original app state is restored on exit.

## Advanced

| Job | Where |
|---|---|
| Course definitions and authoring rules | `src/training/modules/`, `src/training/README.md` |
| Course schema and validation | `src/lib/trainingModule.ts` |
| Course runner | `src/screens/TrainingRun.tsx` |
| Info and Show: what each step looks like, and how it is drawn | `src/lib/trainingDemo.ts`, `src/ui/DemoView.tsx` |
| Real-screen spotlight, dock and layer routing | `src/ui/TrainingHost.tsx`, `src/ui/TrainingOverlay.tsx`, `src/ui/TrainingLayer.tsx`, `src/ui/Spot.tsx` |
| Practice staff, practice pass and the sign-in course | `src/lib/trainingSandbox.ts` (`practiceStaff`), `src/lib/trainingPass.ts`, `src/ui/PracticePass.tsx`, `src/training/modules/sign-in.ts` |
| Practice state and side-effect barriers | `src/state/trainingSession.ts`, `src/lib/trainingSandbox.ts`, `src/lib/trainingGuard.ts` |
| Per-staff progress | `src/lib/trainingProgress.ts`, `src/state/trainingSession.ts` |
| Page changes (new page slides in while the old one drifts away) and the dip to the page colour when practice starts or ends | `src/ui/RouteTransition.tsx`, `src/ui/Veil.tsx`, `src/lib/motion.ts` |

A course can ask for practice staff (`practiceStaff` on the course). The practice till then replaces the staff list with Casey and Morgan (built in `practiceStaff()`, with PINs hashed the same way as real ones), requires sign-in and starts signed in as Casey. A Check goal can start signed in as either, or on the Sign in screen (`staff` injection), and can cancel Morgan's pass (`pass` injection). The Scan pass window draws the practice pass while training is on (`src/ui/PracticePass.tsx`, `src/lib/trainingPass.ts`). Courses without `practiceStaff` keep the real staff list, and a `staff` injection can never lock the real till.

The starter course, **How training works**, is an engine demonstration. **Sign in, lock and switch staff** and **Build a cart** are the first task courses. More task-specific courses and device validation remain to be done. Keep each course's targets checked against the current UI spots; tests validate referenced spots and fixture IDs.
