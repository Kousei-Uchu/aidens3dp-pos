# Quick Menu grid: nested categories and tile settings

## Using it

1. Open Quick Menu and tap the pencil to edit the grid.
2. Tap any tile to open its settings: label, colour, and for categories and display groups what they contain.
3. In a category's settings, **Add sub-category** picks another Shopify collection to nest inside it. **Add display group** nests a group. Both work to any depth. **Open to edit its tiles** takes you inside so you can add, remove and reorder tiles there with the usual controls.
4. A display group can also **act like a collection**: pick a collection in its settings and it shows that collection's items after its own tiles.

While you are not editing, a category shows its sub-category tiles first, then the items of its own collection.

## One item, one place

If an item is in a sub-category and also in the parent category, it only shows in the sub-category, however many levels down. The parents never show it. Example: Rose is inside Extreme Dragons, which is inside Dragons. An item in all three collections shows in Rose only. An item in Dragons and Extreme Dragons shows in Extreme Dragons only.

Items you pin yourself as tiles are never hidden by this rule. A pinned item is shown once, not twice, if its collection would also list it.

## Moving around

The top of an opened category shows the full path, for example `Home > Dragons > Extreme Dragons > Rose`. Tap any earlier name to jump straight to that level. The back arrow goes up one level only. Switching page or tab returns to the top.

If a layout change from another register removes the level you are standing in, the screen steps back to the nearest level that still exists.

## Choosing a variation (sub-page of the grid)

Tapping a product that has more than one variation opens a sub-page inside the grid: one tile per variation with its photo, name, price and stock. The path shows where you are, for example `Home > Dragons > Highland cow`. The back arrow returns to the grid level you came from, and tapping an earlier name jumps there. Tapping a variation adds it and goes back. The quantity chips above stay, so choose ×3 first to add three. The same page replaces the old popup on the All products tab. Leaving the spot (switching tab, page, level or edit mode) closes it. The Bluetooth scanner keeps adding items while it is open.

## Lock POS, Price check and Stock check tiles

Add them from Edit grid > Add tile > Actions (a brand-new layout includes them).

- **Lock POS** locks the register to the sign-in screen. The cart stays as it is. Needs at least one staff member; it will not lock during a card payment.
- **Price check** opens a sheet. Scan an item (Bluetooth scanner, or the camera button) or search, and it shows the price, any "was" price, stock, and the automatic discounts and bundle deals the item can be part of. The cart is not touched.
- **Stock check** works the same way and shows the scanned variation's stock plus the other variations of the same product.

## Collection pictures

Category tiles and display groups that act like a collection show the collection's picture from Shopify. The Add tile list of categories and the sub-category picker show it too. Refresh the catalogue from Shopify if a picture was added recently.

## Saved layout

The layout is the same `grid.json` as before. Nested tiles are stored inside their category as `subs`, and a group's collection as `collectionId`. Old layouts load unchanged, and a register on an older version of the app ignores what it does not understand.

## Where the code is

- `src/lib/gridNav.ts`: walking and editing a path of tiles, the one-item-one-place rule, and the breadcrumb. Pure and tested in `tests/gridnav.test.ts`.
- `src/screens/TileSettings.tsx`: the settings sheet.
- `src/screens/Checkout.tsx` and `src/screens/Tiles.tsx`: navigation, breadcrumb, tile drawing and `VariantPicker`.
- `src/screens/Lookup.tsx`: the Price check and Stock check sheet.
- `src/lib/lookup.ts`, `src/lib/posLock.ts`: the pure rules, tested in `tests/lookup.test.ts`.
