// Location: src/lib/stepUp.ts
// Companion mode locking (docs/COMPANION_PLAN.md). Two rules, both only for a device in Companion mode (a Register behaves as it always has):
//  1. The app locks again by itself when nobody has touched it for a while, or after it has been away in the background.
//  2. Anything that changes something that matters asks for the signed-in person's PIN again when the last PIN entry is too old (a "step-up").
// Pure rules, no React and no store, so they run in the node tests. The screen that asks is src/ui/StepUpHost.tsx.

/** What a step-up is for. Each has the sentence the PIN prompt shows. */
export type StepUpAction = 'payment' | 'refund' | 'shopify' | 'drawer' | 'admin' | 'mode';
export const STEP_UP_INFO: Record<StepUpAction, { title: string; why: string }> = {
  payment: { title: 'Take a payment', why: 'Enter your PIN to take a payment.' },
  refund: { title: 'Refund or return', why: 'Enter your PIN to refund or return an order.' },
  shopify: { title: 'Change the shop', why: 'Enter your PIN to change items, stock, customers or orders in Shopify.' },
  drawer: { title: 'Change the cash drawer', why: 'Enter your PIN to change the cash drawer.' },
  admin: { title: 'Settings and staff', why: 'Enter your PIN to change settings, staff or backups.' },
  mode: { title: 'What this device is for', why: 'Enter your PIN to change which features this device has.' },
};
/** Opening one of these pages asks first. Anything not listed opens freely. */
export const STEP_UP_ROUTES: Record<string, StepUpAction> = { pay: 'payment', createItem: 'shopify', editItem: 'shopify', drawer: 'drawer', settings: 'admin', staff: 'admin', deviceMode: 'mode' };
export const stepUpForRoute = (route: string): StepUpAction | undefined => STEP_UP_ROUTES[route];

/** Minutes. 0 means "every time" for the step-up window and "never" for auto-lock. */
export const STEP_UP_CHOICES: readonly number[] = [0, 1, 5, 15];
export const AUTO_LOCK_CHOICES: readonly number[] = [1, 2, 5, 10, 0];
export const DEFAULT_STEP_UP_MINUTES = 5;
export const DEFAULT_AUTO_LOCK_MINUTES = 2;
/** Anything read from storage is untrusted: only one of the offered choices counts, the rest fall back. */
export const readMinutes = (raw: unknown, choices: readonly number[], fallback: number): number => (typeof raw === 'number' && choices.includes(raw) ? raw : fallback);

export type StepUpInput = { companion: boolean; staffCount: number; lastPinAt?: number; now: number; minutes: number };
/**
 * Does this action need the PIN typed again? No on a Register, none when nobody has a PIN (a prompt could never be answered),
 * always when the window is 0, otherwise only when the last PIN entry (signing in counts) is older than the window.
 */
export function stepUpNeeded(i: StepUpInput): boolean {
  if (!i.companion || i.staffCount === 0) return false;
  if (i.minutes <= 0) return true;
  return i.lastPinAt === undefined || i.now - i.lastPinAt > i.minutes * 60_000;
}

export type LockDueInput = { companion: boolean; staffCount: number; unlocked: boolean; paymentActive: boolean; quietMs: number; minutes: number };
/** Should the app lock itself now? Never mid card payment (the same rule as the Lock row), never when there is nobody to sign back in. */
export function lockDue(i: LockDueInput): boolean {
  if (!i.companion || i.staffCount === 0 || !i.unlocked || i.paymentActive || i.minutes <= 0) return false;
  return i.quietMs >= i.minutes * 60_000;
}

/** Five wrong PINs at the prompt lock the app. */
export const MAX_STEP_UP_TRIES = 5;
export const tooManyTries = (wrong: number): boolean => wrong >= MAX_STEP_UP_TRIES;
