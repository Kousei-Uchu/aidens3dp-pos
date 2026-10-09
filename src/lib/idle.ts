// Location: src/lib/idle.ts
// Last time anyone touched, typed on or scanned into the app. Read by the screensaver; written by touch handlers.
let last = Date.now();
export const noteActivity = (): void => { last = Date.now(); };
export const idleMs = (now = Date.now()): number => Math.max(0, now - last);
