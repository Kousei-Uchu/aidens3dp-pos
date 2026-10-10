// Location: src/lib/payUi.ts
// Which card-payment states may draw OUR OWN sheet (a native Modal).
// While the terminal is working, Zeller's SDK shows its own popup as a full-window overlay at the app root.
// Any native Modal of ours would sit on top of that popup and hide it, so during the "waiting" phase we draw
// nothing modal: only a slim strip inside the Pay page (see Pay.tsx). Results (declined, unknown, reader
// problems) appear after Zeller's popup has gone, so those still use our sheet.
export type CardPhase = 'idle' | 'waiting' | 'declined' | 'unknown' | 'notready';

export const showsOwnSheet = (phase: CardPhase): boolean => phase !== 'idle' && phase !== 'waiting';
export const showsWaitingStrip = (phase: CardPhase): boolean => phase === 'waiting';
/** Payment buttons stay disabled while the terminal is working, so a second charge cannot start. */
export const lockPayButtons = (phase: CardPhase): boolean => phase === 'waiting';
