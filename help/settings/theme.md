---
id: settings/theme
title: Theme, tiles and accent
parent: settings
summary: Choose the Aiden’s 3D Printing brand, Light, Dark or System appearance, adjust tile size, add glass-style surfaces, and spotlight scanned or tapped items.
tags: [theme, brand, light, dark, system, tile size, accent colour, appearance, item spotlight, glass]
related: [settings, sales/grid, staff/modes, staff/screensaver]
updated: 2026-10-11
---
Open **More ▸ Settings ▸ Theme** to change this register's appearance, Checkout tile size, accent colour and optional item spotlight.

## Basic

### Choose an appearance
Select **Aiden’s brand**, **Light**, **Dark** or **System**. The brand theme uses the shop's plum background, peach text and peach primary buttons. **System** follows the iPad's appearance setting.

Turn on **Glass surfaces** for translucent blurred cards and buttons. This is a cross-platform React Native glass-style treatment, not Apple's exact iOS 26 Liquid Glass material.

### Change tile size and accent
Choose **Small**, **Medium** or **Large** under **Tile size**. Tap an accent swatch to change the app's highlight colour; **Default** uses the selected theme's accent.

### Spotlight added items
In **Item spotlight**, independently turn on **Show item name** and **Show item image**. A short, large confirmation appears after an item is added by scan or tap; tap it to dismiss early. Both switches are off by default.

The register's theme, tile size and accent update immediately. A staff member's personal display preferences, set in **More ▸ Staff**, override these defaults only while that person is signed in.

## Deep

### Appearance does not change the grid
Theme changes colours and the general appearance. Tile size changes how large Checkout tiles appear, not which items or categories are on the grid. To edit the grid itself, see [[sales/grid]]. An item spotlight is only a visual confirmation and does not change the cart, scan result or item quantity.

Register defaults are local to this iPad. Staff-specific appearance, accent and tile-size overrides are saved with the shared staff record and follow that person to other registers.

## Advanced

### Theme settings
| Setting | Values | Source |
|---|---|---|
| Theme | `brand`, `light`, `dark`, `system` | `src/state/store.ts`, `src/screens/Settings.tsx`, `src/ui/theme.tsx` |
| Tile size | `S`, `M`, `L` | `src/state/store.ts`, `src/screens/Settings.tsx` |
| Accent | Default, brand peach, plum, blue, green, red, purple or orange | `src/screens/Settings.tsx`, `src/ui/theme.tsx` |
| Item spotlight | `itemSpotlight.name`, `itemSpotlight.image` | `src/state/store.ts`, `src/screens/Checkout.tsx` |
| Glass surfaces | `glassSurfaces` | `src/state/store.ts`, `src/ui/kit.tsx` |
| Per-staff overrides | `StaffMember.preferences` | `src/lib/types.ts`, `src/screens/Staff.tsx`, `src/ui/theme.tsx`, `src/screens/Tiles.tsx` |

The item spotlight and register appearance are local settings. Personal staff appearance and tile size are stored on the shared staff record; they do not alter role permissions.
