---
id: pay/split-and-part
title: Split and part payments
parent: pay
needs: [selling]
summary: Paying one bill in pieces: splitting equally or by an amount, part payments in cash or by gift card, and how the next payment amount is worked out.
tags: [split, part payment, partial, equal, share, remaining, next payment, cancel split, mix, several payments]
related: [pay, pay/cash, pay/card, pay/gift-card]
updated: 2026-10-12
---
One sale can be paid with as many payments as you like, in any mix of card, cash and gift card. The sale finishes by itself when nothing remains.

## Basic

### Splitting
On the **Payment** screen tap **Split amount** (**Split the payment** in Simple and Minimal modes). The **Split amount** sheet opens with **First payment** and a keypad.
- **Split equally 2, 3 or 4:** the bill is shared into that many equal payments. Cents that do not divide evenly go to the first payments.
- **Key in an amount and tap Continue:** that is the first payment. It must be less than what remains, otherwise you see *Amount must be less than the remaining total*. **Continue** stays greyed out until the amount is above $0.00.

After you choose, the screen shows **Next payment: $…** and, after a dot, the payments that come after it (**then $…, $…**). Now tap **Card**, **Cash** or **Gift card** and that payment aims for the next payment amount. Tap **Cancel split** to go back to paying the lot.

Example: $100.00 split equally 3 ways is $33.34, then $33.33, then $33.33.

### Each payment counts as one share
With **Split equally**, every payment you take counts as one share, whatever it was and whatever its size. After each one the rest is shared between the people left. Example: $90.00 split 3 ways.
1. The first person pays $30.00 by card. $60.00 remains for 2 people.
2. The second hands over only $20.00 in cash and you take it as a part payment. That counts as their share, so $40.00 remains for 1 person.
3. The last payment is the whole $40.00.

A card that is declined or cancelled takes nothing, so it does not use up a share.

### When the cash does not cover a part of a split
If the customer hands over less than the current payment, the cash screen says how short it is and offers, instead of leaving you to split again:
- **Two payments left:** **Add $… to payment 2** (it shows the old and new amount), or **Go back and change the split**.
- **More than two payments left:** **Add $… to payment 3** (one button for each later payment), or **Spread $… over the other payments** (each later payment rises by the same amount), or **Go back and change the split**.

The cash they did hand over is taken as this payment, and the shortfall moves to the payment you chose. **Spread** only shows when every later payment would go up by a whole number of dollars (for example $30.00 over 3 payments is $10.00 each). If it would not divide into whole dollars the button is left out; choose a payment to add it to instead. **Ask for more** is always an option: just tap more notes and coins.

### Part payments without splitting
You do not have to split first. A payment can simply be less than the bill:
- **Cash:** if the customer hands over less than is due and the bill is not split, tap **Take $… as part payment**. See [[pay/cash]].
- **Cash and card:** if the drawer cannot make the change, the cash screen can offer **Cash $… + the rest another way**.
- **Gift card:** a card with less balance than the bill pays what it has. See [[pay/gift-card]].

In every case the **Payment** screen then says **Remaining**, with *of $…* under it, and the payments so far are listed. Pay the rest any way you like.

### While part of the sale is paid
The cart is locked, so you cannot change items, clear it or save it. **Back** asks **Cancel this sale?**. **Refund & cancel** refunds card payments through the terminal and credits gift-card payments back to the same cards. For cash, the app asks you to collect any exact change previously given and return the exact denominations originally received; it does not optimise this exchange. If a cancellation step fails, the sale stays locked, records electronic returns already completed and offers a safe retry. Do not take another payment for that sale. See [[pay]].

### On the receipt
The receipt lists every payment with its amount, and the sale is sent to Shopify with one payment per entry.

## Deep

### How the next payment amount is chosen
The next payment aims for the first of these that applies, never more than what remains:
1. The amount you keyed in on the split sheet.
2. An equal share, when **Split equally** is active and more than one share is left.
3. Everything that remains.

A keyed amount only applies to the **next** payment. Once it is paid, the screen goes back to aiming for everything that remains, unless you split again. Example: $100.00 with $30.00 keyed. After the $30.00 is paid, $70.00 remains and the next payment aims for $70.00, not $30.00.

### Equal shares and cents
The shares are worked out from what **remains**, so they are re-worked after every payment. Spare cents go to the earliest shares, which is why the first payer can be one cent more. The shares always add up exactly to what remains.

### Rounding in a split
Cash rounding only applies to the payment that clears the whole of what remains. Earlier shares are always exact, and so are card payments. See [[pay/cash]].

### Each payment is its own record
Every payment keeps its own method, amount, and for cards its own fee. The Shopify order gets one payment per entry, named **Zeller**, **Cash** or **Gift card**.

### Cancelling
**Refund & cancel** refunds each card payment through the terminal and credits each gift-card tender back to its original Shopify card. A unique transaction note and per-tender progress prevent a retry from crediting the same card twice. After electronic returns finish, the cashier collects any change previously given and returns the original cash tender using the exact saved denominations (or enters a manual denomination count for older tenders). If any step fails, payment methods are disabled and the cancellation can be retried.

## Advanced

### Working out the next payment
```mermaid
flowchart TD
  A[Pay.tsx: plan is the list of payments still to take] --> B{more than one part}
  B -->|yes| C[target is the first part]
  B -->|no| D[target is what remains]
  C --> E[cap at remaining]
  D --> E
  E --> F[card cash or gift card aims for this amount]
  F --> G{cash short on this part}
  G -->|yes| H[shortChoices: add to a later part, spread, or change the split]
  G -->|no| I[addTender uses up the first part]
  H --> I
  I --> J[planAfter shares what is left over the later parts]
```

### Where the code is
| Job | Where |
|---|---|
| The next payment amount (`target`) and the `plan` state | `Pay` in `src/screens/Pay.tsx` |
| The split plan and the shortfall choices | `equalPlan`, `firstPlan`, `planTarget`, `planAfter`, `shortChoices`, `applyShortChoice` in `src/lib/splitPlan.ts` |
| The shortfall buttons | `CashSheet` in `src/screens/CashSheet.tsx` |
| Adding a payment | `addTender` in `src/screens/Pay.tsx` |
| Sharing cents | `allocate` in `src/lib/money.ts` (largest remainder) |
| What has been paid | `paidTotal` in `src/lib/saleBuilder.ts` |
| Cancelling a part-paid sale | `abandon` in `src/screens/Pay.tsx` |
| The keypad on the split sheet | `Keypad` in `src/ui/kit.tsx` |

`plan` is a list of cents, one per payment still to take. **Split equally n** makes it from `allocate`; a keyed first amount makes `[amount, rest]`. `target` is the smaller of what remains and the first part, or what remains when the plan has one part or none. `addTender` uses up the first part on any payment of any size, then either takes the plan the cash screen chose (see `shortChoices`) or shares what is left over the later parts with `planAfter`. The plan lives only in the `Pay` screen's state, so it is not saved. The payments themselves are saved on the cart as `cart.tenders`.

`Keypad` greys out **Continue** for $0.00, and the split sheet refuses an amount at or above what remains, so a split can never be zero or the whole bill.

### Reading the code for a fault
- **Next payment shows the wrong amount.** A payment was added since you split (it uses up the first part), or the later parts were re-worked from a smaller remainder or moved by a shortfall choice.
- **Cancel split is missing.** It only shows while `plan` has more than one part. With one share left the screen is simply aiming for what remains.
- **The split is gone after reopening the app.** Expected: it is screen state. The payments already taken are still on the cart.
- **Tests.** The sharing maths is covered in `tests/lib.test.ts` (`allocate`). The plan rules are in `tests/splitplan.test.ts`. Cash and sale building are in `tests/cashsale.test.ts` and `tests/sale.test.ts`.
