// Location: src/lib/posLock.ts
// Rules for the grid's "Lock POS" tile. Pure; the store-touching part is lockNow() in staffAuth.ts.

/** Lock screen is up when someone has set up staff and nobody is signed in (a lock needs a PIN or pass to come back from). */
export const isLockScreen = (i: { staffCount: number; unlocked: boolean }): boolean => i.staffCount > 0 && !i.unlocked;

export type LockDecision = { ok: true } | { ok: false; title: string; message: string };
/**
 * Can the register be locked right now?
 * - No staff: there would be no way back in, so refuse and say how to set it up.
 * - A card payment waiting on the reader: locking would hide the till mid-payment (same rule as switching staff).
 * - Already locked: nothing to do.
 * The cart is never cleared by locking, a part-paid cart included.
 */
export function lockDecision(i: { staffCount: number; unlocked: boolean; paymentActive: boolean }): LockDecision {
  if (i.staffCount === 0) return { ok: false, title: 'No staff set up', message: 'Add a staff member with a PIN in More ▸ Staff first, so there is a way to unlock.' };
  if (!i.unlocked) return { ok: false, title: 'Already locked', message: 'The register is already locked.' };
  if (i.paymentActive) return { ok: false, title: 'Payment in progress', message: 'A card payment is waiting on the reader. Finish or cancel it before locking.' };
  return { ok: true };
}
