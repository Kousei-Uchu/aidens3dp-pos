---
id: staff/modes
title: Display modes
parent: staff
summary: Set Standard, Simple, Minimal or Custom mode for each staff member without changing what their role is allowed to do.
tags: [display mode, Standard, Simple, Minimal, Custom, text size, tabs, More menu, guided checkout]
related: [staff, staff/guided-checkout]
updated: 2026-10-11
---
Each staff member has a display mode, set from their row in **More ▸ Staff**. It changes how the POS is arranged for them, not their role permissions.

## Basic

### Choose a mode
- **Standard** shows the full app in its usual layout.
- **Simple** keeps the same features, with larger text and plain-English explanations in the More menu.
- **Minimal** uses the largest text, fewer tabs and More entries, and asks one checkout question at a time.
- **Custom** lets you choose text size, tabs, More entries, explanations and guided checkout separately.

Tap the staff member's row in Staff, select a mode under **Display mode**, then close the sheet. Each person's choice follows their staff record to the other registers.

### Custom choices
In **Custom**, choose **Normal**, **Large** or **Extra large** text; turn plain-English lines under More entries on or off; choose which tabs and More entries to show; and turn **Guided steps** on or off.

See [[staff/guided-checkout]] for what happens in that flow.

## Deep

### Tabs and More entries
- **All** tabs shows Checkout, Inventory, Transactions, Notifications and More.
- **No alerts** removes only the Notifications tab.
- **Basic** shows Checkout, Transactions and More.
- **All** More entries means everything the person's role allows. **Everyday** adds Items and Customers to the essential entries. **Essentials** keeps Orders, Saved carts, Gift cards, Cash drawer, Support & diagnostics, Help and Lock register, subject to role access.

Cashiers do not get manager-only entries such as Reports, Staff and Settings when staff sign-in is required. A display mode cannot grant them those entries. Checkout and More stay available so the person can do their job and get back to other parts of the app.

### The sole-admin safeguard
If the only Manager or Owner selects a mode that hides Staff or Settings, the POS shows those entries anyway. This prevents the only administrator from losing the controls needed to change the mode back.

Changing to **Custom** starts from the mode the person was using, so its text size and menu choices carry over until you change them.

## Advanced

### Mode resolution
```mermaid
flowchart TD
  A[Read the staff member display mode] --> B[Resolve text tabs More and guided choices]
  B --> C[Limit More entries by staff role]
  C --> D{Only manager or owner}
  D -->|yes| E[Keep Staff and Settings visible]
  D -->|no| F[Show the resolved menus]
```

| Job | Where |
|---|---|
| Mode data, presets and resolution | `src/lib/uiMode.ts` |
| Edit a staff member's mode | `src/screens/Staff.tsx` |
| Apply text sizing and tab profile | `src/ui/uiProfile.tsx` |
| Role and mode filtering in More | `visibleMoreRows` in `src/lib/uiMode.ts`, `src/screens/More.tsx` |
| Read a staff member's current profile | `src/ui/uiProfile.tsx` |

The modes are display preferences, not security roles. The role check is applied separately after a mode chooses which More entries to show.
