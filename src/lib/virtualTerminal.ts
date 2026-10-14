// Location: src/lib/virtualTerminal.ts
// The virtual Zeller Terminal 2 (B6, F8): what its screen shows and how it moves from one screen to the next. Pure: no timers, no React.
// Used by the practice terminal (trainingTerminal.ts), the playground page and, later, the Show demos and Demo mode.
// The shape follows what is publicly known of the Terminal 2: one 6.5 inch full colour touchscreen with light and dark modes, tap or insert
// (no swipe, no magstripe), PIN keyed on the screen, a branded sleep screen, and no printer (receipts are a QR code, email or SMS).
// UI and wording updated from the provided Zeller Terminal 2 dark-mode Connected UI references.
import type { ZellerEvent } from './zeller';

export type VtScreen = 'sleep' | 'amount' | 'pin' | 'processing' | 'approved' | 'declined' | 'removeCard' | 'cancelled' | 'receipt' | 'unavailable';
export const VT_SCREENS: readonly VtScreen[] = ['sleep', 'amount', 'pin', 'processing', 'approved', 'declined', 'removeCard', 'cancelled', 'receipt', 'unavailable'];
export const isVtScreen = (s: string): s is VtScreen => (VT_SCREENS as readonly string[]).includes(s);

export type VtMedia = 'TAP' | 'INSERT';
export type VtState = {
  screen: VtScreen; amountCents: number; media?: VtMedia;
  pin: number;                                  // digits keyed so far (the screen shows dots, never the digits)
  ok?: boolean;                                 // how the last payment ended, kept so the screens after it know
  failText?: string; failCode?: string; dark: boolean;
};

/** Australian contactless limit: above this the customer is asked for a PIN even when they tap. */
export const CONTACTLESS_LIMIT_CENTS = 10_000;
export const PIN_MIN = 4; export const PIN_MAX = 6;
export const needsPin = (media: VtMedia, amountCents: number): boolean => media === 'INSERT' || amountCents > CONTACTLESS_LIMIT_CENTS;
export const vtInitial = (dark = true): VtState => ({ screen: 'sleep', amountCents: 0, pin: 0, dark });

export type VtAction =
  | { t: 'request'; amountCents: number }                  // the till asks the terminal for a payment: wakes it
  | { t: 'present'; media: VtMedia }                       // the customer taps or inserts a card
  | { t: 'key'; key: string }                              // a PIN key: '0'..'9', 'del' or 'ok'
  | { t: 'cancel' }                                        // the Cancel button on the terminal
  | { t: 'result'; approved: boolean; text?: string; code?: string }
  | { t: 'next' }                                          // a message screen has been on long enough
  | { t: 'removed' }                                       // the customer took the card out
  | { t: 'offline' }
  | { t: 'reset' }
  | { t: 'dark'; dark: boolean };

/** The one function that decides what happens. Anything that does not make sense on the current screen changes nothing. */
export function vtReduce(s: VtState, a: VtAction): VtState {
  switch (a.t) {
    case 'request': return { ...vtInitial(s.dark), screen: 'amount', amountCents: Math.max(0, Math.round(a.amountCents)) };
    case 'present':
      if (s.screen !== 'amount') return s;
      return { ...s, media: a.media, pin: 0, screen: needsPin(a.media, s.amountCents) ? 'pin' : 'processing' };
    case 'key': {
      if (s.screen !== 'pin') return s;
      if (a.key === 'del') return { ...s, pin: Math.max(0, s.pin - 1) };
      if (a.key === 'ok') return s.pin >= PIN_MIN ? { ...s, screen: 'processing' } : s;
      if (/^[0-9]$/.test(a.key)) return s.pin < PIN_MAX ? { ...s, pin: s.pin + 1 } : s;
      return s;
    }
    case 'cancel': return s.screen === 'amount' || s.screen === 'pin' ? { ...s, screen: 'cancelled', ok: false } : s;
    case 'result':
      if (s.screen !== 'processing') return s;
      return a.approved ? { ...s, screen: 'approved', ok: true, failText: undefined, failCode: undefined } : { ...s, screen: 'declined', ok: false, failText: a.text, failCode: a.code };
    case 'next':
      if (s.screen === 'approved' || s.screen === 'declined') return s.media === 'INSERT' ? { ...s, screen: 'removeCard' } : s.ok ? { ...s, screen: 'receipt' } : vtInitial(s.dark);
      if (s.screen === 'cancelled' || s.screen === 'receipt' || s.screen === 'unavailable') return { ...vtInitial(s.dark) };
      return s;
    case 'removed': return s.screen !== 'removeCard' ? s : s.ok ? { ...s, screen: 'receipt' } : vtInitial(s.dark);
    case 'offline': return { ...s, screen: 'unavailable', ok: false };
    case 'reset': return vtInitial(s.dark);
    case 'dark': return { ...s, dark: a.dark };
  }
}
/** A declined, cancelled or finished payment ends at the sleep screen with the amount cleared. */
export const isIdle = (s: VtState): boolean => s.screen === 'sleep';

/** How long a message screen stays when nobody is in charge of moving on (the automatic mode). Zero means it waits for somebody. */
export const DWELL_MS: Readonly<Record<VtScreen, number>> = { sleep: 0, amount: 0, pin: 0, processing: 0, approved: 1800, declined: 2600, removeCard: 1200, cancelled: 1500, receipt: 3500, unavailable: 3000 };
/** What an unattended terminal does next, or null if it waits. The removeCard screen is the only one that needs a different action. */
export const autoAction = (s: VtState): VtAction | null => (DWELL_MS[s.screen] === 0 ? null : s.screen === 'removeCard' ? { t: 'removed' } : { t: 'next' });

/** The event the real terminal would send when it reaches this screen, so the till reacts to the virtual one exactly as it does to the real one. */
export function eventFor(s: VtState): ZellerEvent | null {
  switch (s.screen) {
    case 'amount': return { type: 'AWAITING_PAYMENT_METHOD' };
    case 'pin': return { type: 'AWAITING_PIN_ENTRY' };
    case 'processing': return { type: 'PROCESSING' };
    case 'approved': return { type: 'DISPLAYING_PAYMENT_MESSAGE', message: 'Approved' };
    case 'declined': return { type: 'DISPLAYING_PAYMENT_MESSAGE', message: s.failText || 'Declined' };
    default: return null;
  }
}

/** The words on each screen. Updated from the provided Zeller Terminal 2 dark-mode Connected UI references. `{amount}` is filled in by `screenText`. */
export const COPY: Readonly<Record<VtScreen, { title: string; line?: string; hint?: string }>> = {
  sleep: { title: '' },
  amount: { title: 'Tap Now', line: '{amount}', hint: '' },
  pin: { title: 'Enter PIN', line: '{amount}', hint: 'Tap OK when you have finished' },
  processing: { title: 'Processing', line: 'Please wait', hint: 'Do not remove the card' },
  approved: { title: '{amount} Approved', line: '' },
  declined: { title: '{amount} Declined', line: 'Insufficient funds (51)', hint: 'There are not enough funds on the card to make this transaction. Refer the cardholder to their bank or seek another form of payment.' },
  removeCard: { title: 'Remove card' },
  cancelled: { title: 'Cancelled', line: 'Payment was not taken' },
  receipt: { title: 'Receipt', line: 'Scan the QR code, or choose Email or SMS', hint: 'No paper receipt on this terminal' },
  unavailable: { title: 'Not available', line: 'The terminal cannot take payments right now', hint: 'Check its Wi-Fi or SIM connection' },
};
export const money = (cents: number): string => `$${(Math.max(0, cents) / 100).toFixed(2)}`;
export function screenText(s: VtState): { title: string; line: string; hint: string } {
  const c = COPY[s.screen];
  const fill = (t?: string) => (t ?? '').replace('{amount}', money(s.amountCents)).replace('{reason}', s.failText || 'Card declined');
  return { title: fill(c.title), line: fill(c.line), hint: fill(c.hint) };
}

/** The terminal's screen is this many times as tall as it is wide, and the whole device (with its edge) a little more. */
export const FACE_ASPECT = 2.05;
export const BODY_ASPECT = 2.03;

/** The face colours. Our virtual terminal is dark mode only (the `dark` flag is kept for the demo files, but no longer changes the look). The idle screen takes its background from the business's own settings instead. */
export const FACE = {
  light: { bg: '#FFFFFF', text: '#111111', sub: '#6B7280', key: '#F1F1F4', accent: '#111111', onAccent: '#FFFFFF', good: '#15803D', bad: '#DC2626' },
  dark: { bg: '#0B0B0C', text: '#F4F4F5', sub: '#9CA3AF', key: '#222226', accent: '#F4F4F5', onAccent: '#111111', good: '#10B981', bad: '#EF5350' },
} as const;
export const faceColors = (_dark?: boolean) => FACE.dark;

/** The keys on the PIN screen, in rows, as the person sees them. */
export const PIN_ROWS: readonly (readonly string[])[] = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['del', '0', 'ok']];
/** Which screens have something the person can tap on the terminal itself. */
export const TERMINAL_TAPS: Readonly<Partial<Record<VtScreen, readonly string[]>>> = { amount: ['cancel'], pin: ['cancel', ...PIN_ROWS.flat()] };

/** A still picture of any screen, for the gallery and for Show demos: the state the terminal would be in on that screen, with typical numbers. */
export function previewState(screen: VtScreen, dark = true, amountCents = 4500): VtState {
  const base: VtState = { ...vtInitial(dark), screen, amountCents };
  switch (screen) {
    case 'pin': return { ...base, media: 'INSERT', pin: 3 };
    case 'processing': return { ...base, media: 'TAP' };
    case 'approved': return { ...base, media: 'TAP', ok: true };
    case 'declined': return { ...base, media: 'TAP', ok: false, failText: 'Insufficient funds', failCode: '51' };
    case 'removeCard': return { ...base, media: 'INSERT', ok: true };
    case 'cancelled': return { ...base, ok: false };
    default: return base;
  }
}

/** How wide the practice terminal is drawn: a fifth of a wide window, two fifths of a narrow one, within sensible limits. */
export const practiceWidth = (winW: number): number => Math.round(Math.max(120, Math.min(190, winW >= 700 ? winW * 0.2 : winW * 0.4)));
