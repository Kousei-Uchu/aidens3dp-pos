---
id: start/setup
title: Setting a device up
parent: start
summary: The first-run checklist for a new device: choose a register or a companion, then work through a few steps.
tags: [setup, first run, new device, new ipad, companion, register, checklist, getting started]
related: [device-mode, settings/shopify, staff, settings/backup]
updated: 2026-10-20
---
A device that has never been set up opens **Set up this device** once, on the first launch. It asks how the device will be used, then shows a short checklist of what that choice needs. Each step opens the screen that does the work.

## Basic

### Choose how the device will be used
- **A register** is a till: everything is on, exactly as the app has always been.
- **A companion** is a phone or tablet beside the till. It keeps browsing, the assistant, notifications and Settings, and has the register features you switch on. See [[device-mode]].
- Tap a choice to select it. Tick appears against the one you picked. Changing it later asks for the owner PIN.

### Work through the checklist
- **Connect Shopify.** Tap the row, fill in the shop domain and the app's credentials, and pick a location. See [[settings/shopify]].
- **Create the owner PIN.** Tap the row, add the owner to the staff list and give them a PIN, then turn **Require sign-in** on. See [[staff]].
- **Name this register** (a register). Tap the row and give this till a name you would recognise, such as "Counter".
- **Choose its features** (a companion). Tap the row and switch on the register features this device needs.
- Each row shows **Done**, **Next** or **Not yet**, and the line above the list counts them.
- Tap **Finish setup** when you are done. The checklist closes and the app opens on the tabs.

### Steps you can leave for later
- A step that is not done stays on the list. Nothing is blocked: a shop can look around first, then finish.
- To come back to the list, open **More ▸ Device mode** and tap **Open the setup checklist**.
- Steps you have not done are listed there too, with the same **Done** and **Not yet** marks.

## Deep

### Why setup does not lock anybody out
The checklist is a list of jobs, not a gate. Each step records what is true of the device, so the list always says what is done and what is not, and **Finish setup** works at any point. A device that has never been set up sees the checklist once; after that it is open only from **Device mode**.

### Devices that were already in use
An app that was already installed when this was added was marked as set up, as a register, the first time it opened. Nobody who had a working till was sent through setup.

### What is stored, and where it goes
- The mode and the feature switches belong to this device. They are not shared to the other registers, and a [[settings/backup]] file does not carry them: a restored device keeps its own.
- The mode is not trusted from another register either. An older app version never sends one, and a device always reads its own.

## Advanced

### How the checklist is put together
The steps are data, in `src/lib/setupFlow.ts`: each one names the profiles it belongs to (`register`, `companion`), the sentence shown under it, and a `done` test that reads the device's own settings. The screen is `src/screens/Setup.tsx`, which maps each step to the screen that does the job and shows the row in the right state.

| Job | Where |
|---|---|
| The steps and their done tests | `src/lib/setupFlow.ts` |
| The screen, and the route for each step | `src/screens/Setup.tsx` |
| The mode and the feature switches | `src/lib/appMode.ts` |
| Opening the checklist once, and the upgrade case | `Shell` in `App.tsx`, and `hydrate` in `src/state/store.ts` |

### If the checklist does not appear
- **A device that has already been used.** `hydrate` marks any install that has settings but no `setupDone` as set up, so it is not sent through the checklist. Open it from **More ▸ Device mode** instead.
- **School or training.** Practice runs do not open the checklist.
- **A step never ticks.** The done tests read the settings, not the row: a PIN that is set but not required does not tick **Create the owner PIN**, and a register still called "Register 1" does not tick **Name this register**.

### What is not here yet
The step-up PIN that should guard changing the mode gets added with the app-wide lock (patch 0177). Until then the mode can be changed by anyone signed in.
