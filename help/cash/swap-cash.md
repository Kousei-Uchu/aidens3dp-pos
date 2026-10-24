---
id: cash/swap-cash
title: Swapping your own cash with the drawer
parent: cash
needs: [cashDrawer]
summary: Enter the notes and coins you hold yourself and see which to swap with the drawer so it copes better with the next cash sales.
tags: [cash, drawer, swap, exchange, own cash, pocket, notes, coins, float, ledger]
related: [cash, cash/float-report, cash/open-close, cash/smart-change]
updated: 2026-10-12
---
**Swap my cash** helps when the drawer has too much of one thing (for example a lot of $5 notes) and you have other notes or coins on you. It suggests an even swap: you put some of yours in, you take the same value out. It is a suggestion; do the swap yourself and then record it.

## Basic

### Use it
1. Go to **More ▸ Cash drawer** and tap **Swap my cash**.
2. Tap the notes and coins you have on you, the same way as everywhere else (undo and Add / Remove work as usual).
3. Wait a moment while it says *Working it out*. It shows **Put in the drawer (yours)** and **Take out of the drawer**, both as notes and coins with a count badge, and the same total each way.
4. Swap the cash for real, then tap **I swapped it: record it** and confirm. Do not record it before the notes and coins have really changed hands.

### What you will see
- A line says how many of a typical day's cash sales the drawer could then give exact change for, and how many notes and coins it would hold. A tidier drawer with the same percentage is a good swap.
- **Nothing worth swapping** means the drawer has nothing it can spare that would help, or it already copes well. That is a real answer, not an error.
- Because it is an even swap, the float, the paid in and out figures and the Z-report never change.

## Deep

### How it decides
It plays an imagined day of your cash sales against the drawer, the same way the daily float report does ([[cash/float-report]]), before and after each possible swap. A swap scores better when more of those sales can get exact change, when the drawer holds fewer notes and coins (less to count, less clutter), and when few pieces have to change hands. It takes the best swap, then looks again with what you still hold, and stops when nothing gains enough.

So a $50 from your pocket against a drawer swamped in $5 notes can come out as: put in the $50, take out ten $5s. Notes the drawer never uses as change (for example $50s) are only taken in when the tidying is worth the walk. It never takes out the same kind of note it puts in, and never takes something the drawer does not hold.

### What recording does
**I swapped it: record it** writes one **Contents corrected** entry with the notes and coins that went in and came out. Because the total does not change, Expected in the drawer is unchanged. If you close the sheet without recording, nothing changes.

## Advanced

| Job | Where |
|---|---|
| Sheet, confirmation and ledger entry | `SwapCashSheet` in `src/screens/SwapCash.tsx` |
| Button on the drawer page | `Drawer` in `src/screens/Drawer.tsx` |
| Choosing the swap | `planSwap`, `swapIsValid` in `src/lib/cashSwap.ts` |
| Imagined day and failure rate | `dayScript`, `failRate` in `src/lib/floatPlan.ts` |
| Ways of making an amount from the drawer | `findCombinationsLimited` in `src/lib/changeFinder.ts` |
| Ledger entry | `newEntry`, `applyEntry` in `src/lib/cashLedger.ts` |
| Tests | `tests/cashswap.test.ts` |

| Number | Value | What it does |
|---|---|---|
| `PIECE_HELD` | 0.2 points | cost of each note or coin sitting in the drawer afterwards |
| `HANDLING` | 0.05 points | cost of each note or coin that changes hands |
| `MIN_GAIN` | 0.4 points | a step must improve the score by this much to be taken |

`planSwap` takes up to six steps. Each step tries handing in 1, 2, 4, 5, 10 or all of one kind you hold, finds the exact ways the drawer (without that kind) can make the same value (`findCombinationsLimited`, most of each big note first, capped), keeps the twelve with the fewest pieces, and scores each by failure points plus `PIECE_HELD` per piece held plus `HANDLING` per piece moved. The imagined days are seeded, so the same drawer and the same cash always give the same answer. If it runs out of its two seconds it returns the best swap found so far.
