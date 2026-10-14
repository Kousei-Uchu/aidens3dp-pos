// Location: src/lib/sheetGate.ts
// iOS can leave an invisible window over the whole screen when one window dismisses at the same moment another opens (0097 found it after a pass scan; the
// line window does the same when a Discount or price window closes and it comes back). Nothing can be pressed after that, not even Exit.
// So a window waits until the last one has had time to finish closing before it opens. A window that opens with nothing closing before it opens at once. Pure.
export const SHEET_GAP_MS = 450;
let lastHide = Number.NEGATIVE_INFINITY;
/** A window has begun to close. */
export const noteSheetHide = (now: number = Date.now()): void => { lastHide = now; };
/** How long a window that wants to open now should wait, in ms (0 when nothing closed recently). */
export const sheetOpenDelay = (now: number = Date.now()): number => Math.max(0, lastHide + SHEET_GAP_MS - now);
export const resetSheetGate = (): void => { lastHide = Number.NEGATIVE_INFINITY; };
