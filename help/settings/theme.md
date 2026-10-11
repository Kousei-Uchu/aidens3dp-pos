---
id: settings/theme
title: Theme, tiles and accent
parent: settings
summary: Choose Light, Dark or System appearance, adjust tile size and pick an accent colour for this iPad.
tags: [theme, light, dark, system, tile size, accent colour, appearance]
related: [settings, sales/grid]
updated: 2026-10-11
---
Open **More ▸ Settings ▸ Theme** to change the app's appearance, Checkout tile size and accent colour on this iPad.

## Basic

### Choose an appearance
Select **Light**, **Dark** or **System**. **System** follows the iPad's appearance setting.

### Change tile size and accent
Choose **Small**, **Medium** or **Large** under **Tile size**. Tap an accent swatch to change the app's highlight colour; **Default** restores the standard dark accent.

The theme, tile size and accent update immediately and are stored on this register.

## Deep

### Appearance does not change the grid
Theme changes colours and the general appearance. Tile size changes how large Checkout tiles appear, not which items or categories are on the grid. To edit the grid itself, see [[sales/grid]].

These choices are local to this iPad. They do not change another register's theme.

## Advanced

### Theme settings
| Setting | Values | Source |
|---|---|---|
| Theme | `light`, `dark`, `system` | `src/state/store.ts`, `src/screens/Settings.tsx` |
| Tile size | `S`, `M`, `L` | `src/state/store.ts`, `src/screens/Settings.tsx` |
| Accent | Default, blue, green, red, purple or orange | `src/screens/Settings.tsx`, `src/ui/theme.tsx` |

The appearance and tile-size settings are saved with local app settings. They are not included in the shared staff or bundle settings.
