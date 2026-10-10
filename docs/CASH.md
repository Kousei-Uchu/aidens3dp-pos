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

## Coming next
Cash sales adding to the ledger from the Cash screen (you enter what the customer hands over, the screen shows which notes and coins to give back), the weighted "best change" choice, Check Change, the daily float report, and the locked-off tender machine hook.
