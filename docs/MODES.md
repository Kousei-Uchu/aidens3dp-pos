# Display modes (Standard, Simple, Minimal, Custom)

Set per person: More ▸ Staff ▸ their name ▸ **Display mode**. It follows them to any register they sign in on (it is saved with the staff list). Nobody signed in, or no staff set up, means Standard.

| | Text | Tabs | More menu | Explanations |
|---|---|---|---|---|
| Standard | normal | all five | everything their role allows | off |
| Simple | normal | all five | everything their role allows | on |
| Minimal | normal | Checkout, Transactions, More | Orders, Saved carts, Gift cards, Cash drawer, Support, Lock register | on |
| Custom | your choice | your choice | your choice | your choice |

Minimal also turns on the **guided checkout** (below). Custom has its own on/off dial for it.

Custom controls: text size (normal, large, extra large), plain-English lines (off, on), tab and More-menu presets, per-tab visibility, per-entry More visibility, and checkout (normal or guided steps). Guided checkout can optionally include a separate Customer step. Checkout and More tabs cannot be hidden. Choosing Custom starts from whatever mode the person already had.

## Rules
- A mode only narrows or enlarges. A cashier on any mode still never sees Reports, Staff or Settings.
- The only manager or owner always keeps Staff and Settings, so they can always change a mode back.
- Checkout and More are always present. If a tab is hidden while someone is on it (the mode changed, or a notification link points at it), the app goes to Checkout.
- Lock register stays in More whenever locking is set up and the person's Custom preferences allow it.
- Per-entry controls never bypass role permissions. The sole manager or owner still sees Staff and Settings.

## Code
`src/lib/uiMode.ts` holds every rule and is tested without the app (`tests/uimode.test.ts`). `src/ui/uiProfile.tsx` gives the current person's profile to the screens. Text scaling is applied in `Txt`, `Btn`, `Chip` and `Segmented` (`src/ui/kit.tsx`). Registers on an older app version ignore the mode and show Standard.

## Device mode (Register or Companion)
Display modes are about the person. The **device mode** is about the device: a Register has every feature, while a Companion has the till features switched off until someone turns them on in **More ▸ Device mode**. The same page is where the mode itself is changed.

The six switches (the **Companion features** section of that page) are Selling, Card reader, Cash drawer, Till staff tools, Till display and Till training. A Companion starts with all six off; the page lists what each one covers.

Rules:
- It is set **per device**. It is never shared between registers through sync, and a backup never copies it to another device.
- It only ever **narrows** what a person's role and display mode already allow. It never grants anything. A Register keeps every feature whatever is stored, and an unknown stored value reads as a Register, so a bad value can never hollow out a till.
- A Companion keeps Help, Demo mode, Notifications, the AI assistant, Settings for owners and managers, and the sync and Shopify diagnostics open.

Rules live in `src/lib/appMode.ts` and the checklist that sets a device up is `src/lib/setupFlow.ts`; both are tested without the app (`tests/appmode.test.ts`, `tests/setupflow.test.ts`). The plan is `docs/COMPANION_PLAN.md`.

## Guided checkout (Minimal, or Custom with Guided steps)
One question per screen, with a step bar and Back / Next in the same place:
1. **Items** - the normal item picker (Quick Menu and All products, scanning, search). No keypad, grid editing or staff chip. Next stays disabled until something is in the cart.
2. **Discount** - shows the deals already applied automatically; optionally add a cart discount.
3. **Check** - every line with Change and Remove, the total, and bundle deals. A bundle that is not a recommended pair is called out here (this is the guided flow's version of the pre-payment bundle check).
4. **Pay** - the total and "Take payment", which opens the normal Pay screen. Card, cash (with the drawer ledger and change prompts), gift card and split payments all work exactly as in the standard checkout.

Customer selection is not a required step: use **More options** to add or change a customer. Custom mode can turn the separate Customer step back on.

After a sale finishes, the flow starts again at step 1. A part-paid sale goes straight to Pay and cannot be walked back into editing. **More options** (top right of every step) keeps the full checkout reachable: custom amount, sell a gift card, check change, save cart, open a saved cart, start again. Code: `src/lib/guidedFlow.ts` (rules, tested) and `src/screens/GuidedCheckout.tsx`.

## Inside the screens (Simple, Minimal, or any mode with explanations on)
- **Pay:** "How is the customer paying?", buttons named for what they do ("Pay by card", "Pay with cash", "Pay with a gift card", "Split the payment"), each with a one-line explanation.
- **Cash sheet:** a line explaining the note and coin pad. **Checkout:** a hint under the quantity chips. **Cart:** "Add a customer (optional)", a friendlier empty message, and a note under Charge.
- **Bigger tap targets:** buttons, rows, chips, segmented controls and icon buttons grow with the text size, in every screen. No button is hidden in Simple.
Wording lives in `src/lib/simpleLabels.ts`. With explanations off it returns today's wording.
