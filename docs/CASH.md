# Cash drawer: notes and coins

## What it tracks
The drawer screen (More ▸ Cash drawer) keeps a ledger of which notes and coins are in the drawer, and a history of what went in and out, when, and who was signed in. Money is Australian: $100, $50, $20, $10, $5, $2, $1, 50c, 20c, 10c, 5c.

## Entering money
Tap the note or coin. Each tap adds one (use ×5 or ×10 for several). Switch to **Remove** to take some off. **Undo** reverses the last tap and tells you what it took off and the new total. **Start over** clears the entry.

## Screens
- **Open drawer:** starts from what the ledger already holds, so you only add or remove. The total is the float.
- **Paid in / Paid out:** tap what went in or came out, add a reason.
- **Count & close:** count everything from zero. Shows over or short against the expected amount, and the notes and coins appear in the Z-report. What you counted becomes the ledger.
- **Correct contents:** fix the ledger by hand if it drifted.

## Change finder
`src/lib/changeFinder.ts` finds every way to make an amount from the notes and coins available (never using more than exist). Exact matches only if any exist; otherwise everything within ±$5.00 by default. `findCombinationsLimited` stops at a node cap and reports it, so a very full drawer cannot freeze the app.

## Smart change (Settings ▸ Payments)
Off by default. When on, the change step still gives exact change, but chooses the notes and coins that leave the drawer best stocked for the next few sales (not just the fewest pieces). It learns from the drawer ledger (what change you really give, newest sales weigh most) and uses your item prices until there is enough history. The change screen shows the pick with a short reason, and **Show another way** steps through the next best options. Check change uses it too, for the change it suggests and for the "may not be worth it" warning. Code: `src/lib/changeScore.ts` (`buildProfile`, `planChangeSmart`, `SCORE_WEIGHTS`), `src/state/cashProfile.ts`.

## Daily float report
Cash drawer ▸ Daily float report. Shows the day's cash takings, which notes and coins to take out (bank) to match them, and the float that leaves for tomorrow, chosen so the drawer can still make your usual change. Also suggests a top-up, and which $50/$100 notes are better banked. **I took this out: record it** writes the banking into the ledger. Code: `src/lib/floatReport.ts`.

## Tender machine (not built yet)
`src/lib/tenderMachine.ts` is one empty function and a `TENDER_MACHINE_READY = false` flag, the place to plug in the Raspberry Pi machine later. Settings ▸ Payments shows its switch greyed out and Off ("Under Construction"). Until then everything is entered, shown and confirmed by hand, as above. The top of the file lists the steps to build it.
