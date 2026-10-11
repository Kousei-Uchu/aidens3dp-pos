# Patch 0063: Training foundations adapted from the older 0059 patch

This patch replaces the first Training Mode implementation (0061), whose lesson/quiz rehearsal did not meet the requested hands-on animated tutorial format. The source was `patches/0059-training-foundations.patch`, written against an older checkout. Its training concepts were reconciled with the current app routes, store, UI components, and display-mode controls rather than applied as a wholesale old-tree replacement.

## Included

- Animated declarative Info and Show scenes, plus a small "How training works" course that exercises the runner.
- Real POS screens during Guide and Check. A dim layer, focus ring, speech bubble, tappable spotlight, and persistent dock guide each step.
- Separate fixture catalogue/cart/drawer data and a fake terminal. On exit, the real app state is restored. Store persistence, local history, Shopify, receipt uploads, sync polling, and the physical terminal are guarded during practice.
- Progressive hint ladders, answer highlighting, per-staff course progress, and a celebratory completion screen.
- A course authoring guide and tests for the module state machine, practice-state isolation, spotlight geometry, and spot references.

## Assumptions and remaining work

- Safety assumption: training must not modify or submit any real sale. It uses isolated in-memory fixtures and restores the saved app state on exit.
- The included course demonstrates the engine; it is not yet a complete operational course for every app process.
- Device verification is still needed for spotlight alignment across phone/tablet, orientation changes and native sheets, plus full confirmation that the safety barriers behave as expected in the built app.
- The Docs Worker custom domain is independent of this patch and remains pending access to the Cloudflare account that owns `aidens3dp.com`.
