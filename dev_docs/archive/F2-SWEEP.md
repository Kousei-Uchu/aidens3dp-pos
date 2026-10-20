# F2 Sweep Report

**Date:** 2025-10-18  
**Status:** Completed

## Overview

Sweep of the app for inconsistencies and missed parts. Changes are minimal and low-risk per rules.

## Findings

Each finding is classified as:
- **fixed** - Low-risk change applied, keeps tests green and typecheck unchanged
- **needs-decision** - Larger change that needs review; NOT modified

### Search scope

- `src/screens/*` (excluding Assistant*.tsx, lib/assistant*.ts, lib/tcpFetch*.ts as instructed)
- `src/lib/*` (excluding assistant*, tcpFetch* as instructed)  
- `src/state/*`, `src/ui/*`, `src/types/*`
- Navgraph validated with `npm run graph:check` (72 screens, 173 edges after fixes)
- Tests: 1248 passing, 4 failing (known training failures - baseline unchanged)
- Typecheck: 3 known errors in tests/trainingstocklookup.test.ts (baseline unchanged)

## Fixed

### FIX-001: Add missing navgraph edges for Check change grid action
**Severity:** fixed  
**File:** `src/app.navgraph`, `src/lib/appNavgraph.generated.ts` (regenerated)  
**Description:** Added edges so the "Check change" tile (`grid.action:check_change`) is reachable from Checkout and Cart, matching how other grid actions (price_check, stock_check, warning_list) are wired. Regenerated navgraph via `npm run graph:build`; `npm run graph:check` passes (72 screens, 173 edges).

## Needs Decision

### ND-001: No obvious dead exports found
**Severity:** needs-decision  
**File:** `src/lib/*`  
**Description:** Quick scan of exported symbols in src/lib (excluding assistant/tcpFetch) did not reveal obvious unreferenced exports when compared against usages in the codebase (excluding same-file self-references). Full exhaustive dead-code elimination could be large; recommend decision on whether to do a deeper audit with a tool or leave as-is. Not touched per "verify with grep before touching anything" and low-risk preference.

### ND-002: No clear "screens that lead nowhere" beyond normal app structure
**Severity:** needs-decision  
**File:** navgraph/screens  
**Description:** Graph shows all 72 screens and 173 edges, reachable structure from tabs. No obvious orphaned screens except standard overlays (overlay_lock/overlay_screensaver) which are entry points. Some sheets have inbound edges and close back - appears consistent. No removed screen references found in active code paths (excluding ignored directories).

### ND-003: Settings usage appears consistent; no obvious "settings that do nothing"
**Severity:** needs-decision  
**File:** `src/state/store.ts`, settings screens  
**Description:** Settings model is comprehensive with shared sync/versioning; most toggles are read by consumers (themes, cashRounding, smartChange, etc.). Without deeper behavioral audit it's hard to guarantee every field is actively used. No trivially unused stored preference identified that is clearly safe to remove. Recommend leaving settings schema intact unless a specific unused field is pinpointed.

### ND-004: No obvious duplicate flows requiring removal
**Severity:** needs-decision  
**File:** various  
**Description:** App has consistent patterns (Checkout vs GuidedCheckout, different payment entry paths) but these appear intentional. No clear duplicate "two ways to do one thing" that is obviously redundant and safe to collapse without product decision. None modified.

### ND-005: Error handling provides feedback/dismiss paths
**Severity:** needs-decision  
**File:** error flows  
**Description:** Errors use `alertMsg`/`confirm` with optional help links (via `helpForError`) and sheets have dismiss/close buttons. Did not spot obvious "dead ends after error" with no way back in typical alert flows - alerts provide OK/Cancel/Help actions. Trivial missing back paths not found in examined screens. No changes made.

### ND-006: Training code untouched
**Severity:** needs-decision  
**File:** `src/training/*`, training*.ts  
**Description:** Per instructions, training code not touched except reporting context. Baseline: 1248 pass / 4 known training failures unchanged; typecheck 3 known errors in tests/trainingstocklookup.test.ts unchanged. No modifications to training or assistant/tcpFetch paths.

## Summary

**Fixed:** 1 (navgraph edge addition for Check change grid action)  
**Needs Decision:** 6  
**Changes in working tree:** minimal edits to `src/app.navgraph` only; regenerated `src/lib/appNavgraph.generated.ts`. All tests and typecheck baselines unchanged. Graph validation passes.
