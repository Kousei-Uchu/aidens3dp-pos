# Display modes (Standard, Simple, Minimal, Custom)

Set per person: More ▸ Staff ▸ their name ▸ **Display mode**. It follows them to any register they sign in on (it is saved with the staff list). Nobody signed in, or no staff set up, means Standard.

| | Text | Tabs | More menu | Explanations |
|---|---|---|---|---|
| Standard | normal | all five | everything their role allows | off |
| Simple | 15% bigger | all five | everything their role allows | on |
| Minimal | 30% bigger | Checkout, Transactions, More | Orders, Saved carts, Gift cards, Cash drawer, Support, Lock register | on |
| Custom | your choice | your choice | your choice | your choice |

Minimal also turns on the **guided checkout** (below). Custom has its own on/off dial for it.

Custom dials: text size (normal, large, extra large), plain-English lines (off, on), tabs (all, no Notifications, Checkout/Transactions/More), More menu (all, everyday, essentials), checkout (normal, guided steps). Choosing Custom starts from whatever mode the person already had.

## Rules
- A mode only narrows or enlarges. A cashier on any mode still never sees Reports, Staff or Settings.
- The only manager or owner always keeps Staff and Settings, so they can always change a mode back.
- Checkout and More are always present. If a tab is hidden while someone is on it (the mode changed, or a notification link points at it), the app goes to Checkout.
- Lock register stays in More whenever locking is set up.

## Code
`src/lib/uiMode.ts` holds every rule and is tested without the app (`tests/uimode.test.ts`). `src/ui/uiProfile.tsx` gives the current person's profile to the screens. Text scaling is applied in `Txt`, `Btn`, `Chip` and `Segmented` (`src/ui/kit.tsx`). Registers on an older app version ignore the mode and show Standard.

## Guided checkout (Minimal, or Custom with Guided steps)
One question per screen, with a step bar and Back / Next in the same place:
1. **Items** - the normal item picker (Quick Menu and All products, scanning, search). No keypad, grid editing or staff chip. Next stays disabled until something is in the cart.
2. **Customer** - optional. Find or add a customer, or "No, carry on".
3. **Discount** - shows the deals already applied automatically; optionally add a cart discount.
4. **Check** - every line with Change and Remove, the total, and bundle deals. A bundle that is not a recommended pair is called out here (this is the guided flow's version of the pre-payment bundle check).
5. **Pay** - the total and "Take payment", which opens the normal Pay screen. Card, cash (with the drawer ledger and change prompts), gift card and split payments all work exactly as in the standard checkout.

After a sale finishes, the flow starts again at step 1. A part-paid sale goes straight to Pay and cannot be walked back into editing. **More options** (top right of every step) keeps the full checkout reachable: custom amount, sell a gift card, check change, save cart, open a saved cart, start again. Code: `src/lib/guidedFlow.ts` (rules, tested) and `src/screens/GuidedCheckout.tsx`.

## Inside the screens (Simple, Minimal, or any mode with explanations on)
- **Pay:** "How is the customer paying?", buttons named for what they do ("Pay by card", "Pay with cash", "Pay with a gift card", "Split the payment"), each with a one-line explanation.
- **Cash sheet:** a line explaining the note and coin pad. **Checkout:** a hint under the quantity chips. **Cart:** "Add a customer (optional)", a friendlier empty message, and a note under Charge.
- **Bigger tap targets:** buttons, rows, chips, segmented controls and icon buttons grow with the text size, in every screen. No button is hidden in Simple.
Wording lives in `src/lib/simpleLabels.ts`. With explanations off it returns today's wording.
