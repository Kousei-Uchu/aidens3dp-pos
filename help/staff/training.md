---
id: staff/training
title: Training mode
parent: staff
summary: Learn app tasks through animated explanations, a process walkthrough, a spotlighted real interface and safe practice.
tags: [training, lessons, practice, learning, checkout, scenarios, tutorial]
related: [staff, sales, sales/scanners, pay, fix]
updated: 2026-10-11
---
Open **More → Training** to learn a POS task. Courses can be started in any order.

## Basic

### How a course works
Each course has six parts:
1. **Info** is an animated visual explanation of what the task is for and when you need it.
2. **Show** animates the process as a simple diagram, not a screenshot of the app.
3. **Guide** opens the real POS interface with practice data. The rest of the screen dims while a bright ring and a short prompt point to the relevant control. Tap the highlighted controls or Next when a step is informational.
4. **Check 1** asks you to complete the task without the arrows, with practice data.
5. **Check 2** repeats the task with a realistic customer-side problem to recover from.
6. **Done** recaps what you can do and marks the course complete.

During Checks, tap **Hint** for a pointer. Each hint becomes more specific; after the last hint, the app highlights the answer. Training uses a separate practice register state. Your live cart and sales are restored when you leave; practice changes are not saved, sent to Shopify, or charged to the reader.

### Progress
Completion and stage progress are saved on this device for the signed-in staff member, or shared on the device when nobody is signed in. You can revisit completed stages or repeat a course.

## Deep

Course scenes, spotlight targets, Guide steps, Checks, recovery injections and hint ladders are declared separately from the shared runner. The Guide and Checks swap in fixture products, customers, cart, drawer and settings while the actual Checkout screens remain mounted. A guard blocks app persistence, CSV writes, Shopify calls and receipt uploads; card payments use a pretend terminal. The original app state is restored on exit.

## Advanced

| Job | Where |
|---|---|
| Course definitions and authoring rules | `src/training/modules/`, `src/training/README.md` |
| Course schema and validation | `src/lib/trainingModule.ts` |
| Scene and course runner | `src/screens/TrainingRun.tsx`, `src/ui/SceneView.tsx` |
| Real-screen spotlight, dock and layer routing | `src/ui/TrainingHost.tsx`, `src/ui/TrainingOverlay.tsx`, `src/ui/TrainingLayer.tsx`, `src/ui/Spot.tsx` |
| Practice state and side-effect barriers | `src/state/trainingSession.ts`, `src/lib/trainingSandbox.ts`, `src/lib/trainingGuard.ts` |
| Per-staff progress | `src/lib/trainingProgress.ts`, `src/state/trainingSession.ts` |

The starter course, **How training works**, is an engine demonstration, not a complete course catalogue. Additional task-specific courses and device validation remain to be done. Keep each course's targets checked against the current UI spots; tests validate referenced spots and fixture IDs.
