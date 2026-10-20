# Stop POS sales emailing you like online orders (A6)

## What the app already does
`orderCreate` is sent with `sendReceipt: false` and `sendFulfillmentReceipt: false`, fulfilment uses
`notifyCustomer: false`, and refunds use `notify: false` (see `src/lib/shopify/orderModel.ts` and `orders.ts`).
So **customers never get an email** for a POS sale.

## Why you still get an email
The email you receive is Shopify's **staff "New order" notification**. It fires for every order from every channel.
Those flags only control *customer* emails, and Shopify gives apps no switch for staff notifications, so nothing in the
app code can turn it off. It has to be changed in the Shopify admin (one-time, about two minutes).

## Fix (recommended): tag POS emails in the subject, then filter them in Gmail
1. Shopify admin, Settings, Notifications, Staff notifications, "New order".
2. Edit the **Subject** line so POS orders are marked. Every POS order carries the tag `pos`:
   `{% if tags contains 'pos' %}[POS] {% endif %}[{{ shop.name }}] Order {{ name }} placed by {{ customer.name }}`
   (keep whatever your current subject says after the marker, only add the `{% if %}` part at the start).
3. Save, ring up one test sale, and check the email subject starts with `[POS]`.
4. Gmail, Settings, Filters, create a filter: Subject contains `[POS]`, then "Skip the Inbox" and "Mark as read"
   (or apply a label like `POS orders`). Online orders keep arriving as normal.

If the subject does not change, the `tags` variable is not exposed in that template on your plan. Tell me and I will
switch the marker to a custom order attribute (every POS order has `pos_register`, `pos_staff` and `pos_sale_uuid`).

## Alternatives
- Remove your address from the Staff notifications list entirely, and use the Shopify mobile app's push alerts for online
  orders. Simple, but push alerts fire for POS sales too.
- Keep the emails but stop reading them: the Gmail filter above is the cheapest version of this.
