// Location: src/lib/focusGuard.ts
// Tracks whether a person is typing in a normal text field, so background "focus grabbers" (the Bluetooth
// scanner capture input) never steal the keyboard from them. Pure module: no React / RN imports, unit-tested.
let focused = 0;
let lastBlur = 0;
/** After a field loses focus we keep treating the user as "still typing" briefly (they may be tapping the next field). */
export const TYPING_GRACE_MS = 2500;

export const fieldFocused = (): void => { focused += 1; };
export const fieldBlurred = (now = Date.now()): void => { focused = Math.max(0, focused - 1); lastBlur = now; };
export const isUserTyping = (now = Date.now()): boolean => focused > 0 || now - lastBlur < TYPING_GRACE_MS;
/** Test helper. */
export const resetFocusGuard = (): void => { focused = 0; lastBlur = 0; };
