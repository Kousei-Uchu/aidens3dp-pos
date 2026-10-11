---
id: staff/training
title: Training mode
parent: staff
summary: Learn app tasks in short modules with visual explanations, a process walkthrough, safe practice and recovery questions.
tags: [training, lessons, practice, learning, checkout, scenarios]
related: [staff, sales, sales/scanners, pay, fix]
updated: 2026-10-11
---
Open **More → Training mode** to practise common POS tasks. Choose any module from the list; modules are independent, so you can learn them in any order.

## Basic

### A training module
Each module uses the same five parts:
1. **Info** explains what the task is for and what to look out for.
2. **Process** shows the task as a short sequence.
3. **Guide** rehearses the important actions.
4. **Check** asks what you would do in a normal situation and a recovery situation.
5. **Done** celebrates completion when both answers are correct.

Hints get more specific each time. If the hints are not enough, the module reveals the answer. Training practice does not add items to your live cart or take payment.

### Progress
Completion marks are saved on this register for the signed-in staff member. If nobody is signed in, progress is saved for the register. Module content is kept separate from the screen layout so a lesson can be updated as the app changes.

## Deep

Training modules are described as data: lesson slides, process steps, guide prompts, answer choices, hints and the linked Help page. The training screen renders those definitions in one shared five-stage flow. This keeps content revisions separate from app screen layout; it does not automatically guarantee that every guide prompt changes when a related POS flow changes, so review the linked Help page when updating a module.

## Advanced

| Job | Where |
|---|---|
| Module content and answer rules | `src/lib/training.ts` |
| Training list and module player | `src/screens/Training.tsx` |
| Route and More menu entry | `App.tsx`, `src/screens/More.tsx` |
| Per-learner completion storage | `trainingProgress` in `src/state/store.ts` |

Training is an offline lesson and practice preview. The first module is a simulated rehearsal for finding and adding an item; it does not inspect or control live UI elements. Future modules can link to current Help pages and add additional realistic workflows without changing the training player.
