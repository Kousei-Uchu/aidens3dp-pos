# Writing help pages

These notes are for whoever writes or edits the pages in this folder. Staff never see this file (the build skips `README.md` and any file starting with `_`).

## Add or change a page
1. Create or edit a `.md` file under `help/`. A folder's own page is `index.md` inside it (`help/sales/index.md` has the id `sales`). Any other page is `help/<folder>/<name>.md` with the id `<folder>/<name>`.
2. Run `npm run help:build`. It checks every page and rewrites `help/help.json`. If something is wrong it prints the file and the problem and writes nothing.
3. Commit the `.md` file **and** `help/help.json` together. `npm test` fails if `help.json` is out of date.

## The header
```text
---
id: sales/cart-and-prices        (must match the file path)
title: The cart and how prices are worked out
parent: sales                    (every page except `start` needs one; it must exist)
summary: One line for lists and search results.
tags: [cart, discount]           (words people might search for)
related: [sales]                 (pages to list under "Related", optional)
updated: 2026-10-11              (optional, YYYY-MM-DD)
---
```
Anything written between the header and the first `## Basic` is the **lead**. It is shown at every depth, so keep it to a sentence or two.

## The three depths
Use exactly `## Basic`, `## Deep`, `## Advanced`, in that order. A reader who picks a depth also sees the ones above it, so never repeat yourself.
- **Basic**: what a staff member needs to do the job. Plain words, short sentences, the names on the buttons exactly as they are on screen. No code, no jargon. If a message can appear, say what it means and what to do.
- **Deep**: why it behaves the way it does. Still plain English, but you may explain the rules, the order things happen in, and the odd cases. Worked examples go here.
- **Advanced**: how it is built. Name the files and functions, add a flowchart, say how to trace a fault, and list the tests. Every claim here should be something you checked in the code.

`## Basic` is required. Deep and Advanced can be left out for a simple page, but say so in the plan (`docs/PROGRESS.md`) rather than leaving them out by accident.

Inside a section use `###` for headings. `##` is reserved for the three depth headings, and the checker rejects any other `##`.

## Links
- `[[sales/cart-and-prices]]` links to a page using its title. `[[sales/cart-and-prices|the cart page]]` uses your words.
- The checker refuses a link to a page that does not exist. Links inside code fences and `inline code` are not links, so you can show the syntax.
- Do not write a contents list by hand. The Help screen builds one from each page's `parent`.

## Flowcharts
Put a Mermaid flowchart in a fenced block marked `mermaid`, in **Advanced** sections. To keep the in-app drawing simple, stay inside this subset:
- `flowchart TD` (top to bottom) or `flowchart LR` (left to right)
- Boxes `A[text]`, decisions `A{text}`, rounded `A(text)`
- Arrows `A --> B` and `A -->|label| B`
- No `subgraph`, no `style` or `classDef`, no `click`.

Anything the in-app drawing cannot read is shown as plain text, and the website draws the full Mermaid. Every block must start with a diagram type (`flowchart`, `graph`, `sequenceDiagram`, ...); the checker enforces that.

## Style
- Australian spelling (colour, organise). Dollar amounts as `$12.50`.
- Use the real button and screen names, with ▸ for a path: Settings ▸ Payments ▸ Smart change.
- Write what the app does now, not what is planned. If a change is coming, add a short "Known to change" note at the end of Advanced, and update the page when it ships.
- Check each Advanced claim against the code before writing it. If you cannot check it, leave it out.
