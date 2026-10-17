// Location: src/lib/assistantScrub.ts
// The scrubber (patch 0151, moved here in patch 0161 so the data gate can use it without a circular import).
// It masks what looks like an email address, phone number, card number or key in any text going to the model.
// Pure logic, no React Native imports, so it runs in the node tests.
import { redactSecrets } from './assistantClient';

export type MaskKind = 'email' | 'phone' | 'card' | 'key';
export type Scrubbed = { text: string; masked: Partial<Record<MaskKind, number>> };
export const MASK_WORD: Record<MaskKind, [string, string]> = { email: ['email address', 'email addresses'], phone: ['phone number', 'phone numbers'], card: ['card number', 'card numbers'], key: ['key or token', 'keys or tokens'] };

/** The Luhn check, used so a long number is only masked as a card when it can be one. */
export function luhnOk(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0; let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) { let d = digits.charCodeAt(i) - 48; if (dbl) { d *= 2; if (d > 9) d -= 9; } sum += d; dbl = !dbl; }
  return sum % 10 === 0;
}

const CARD_RUN = /(?<![\d])\d(?:[ -]?\d){12,18}(?![\d])/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const AU_PHONE = /(?<![\w])(?:\+61|0)[2-478](?:[ -]?\d){8}(?![\d])/g;
const INTL_PHONE = /(?<![\w])\+\d{1,3}(?:[ -]?\d){7,12}(?![\d])/g;
const LONG_TOKEN = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])/g;

/** What the scrubber may leave alone. Card numbers and keys are never left alone. Emails and phone numbers are, only when the data gate says that category may be sent. */
export type ScrubKeep = { email?: boolean; phone?: boolean };

export function scrubText(input: string, keep: ScrubKeep = {}): Scrubbed {
  const masked: Partial<Record<MaskKind, number>> = {};
  const bump = (k: MaskKind) => { masked[k] = (masked[k] ?? 0) + 1; };
  let t = input ?? '';
  const before = t;
  t = redactSecrets(t); if (t !== before) { const n = (before.match(/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi) ?? []).length; for (let i = 0; i < Math.max(1, n); i++) bump('key'); }
  t = t.replace(CARD_RUN, m => { if (luhnOk(m.replace(/[ -]/g, ''))) { bump('card'); return '[card number]'; } return m; });
  if (!keep.email) t = t.replace(EMAIL, () => { bump('email'); return '[email address]'; });
  if (!keep.phone) { t = t.replace(AU_PHONE, () => { bump('phone'); return '[phone number]'; }); t = t.replace(INTL_PHONE, () => { bump('phone'); return '[phone number]'; }); }
  t = t.replace(LONG_TOKEN, m => { if (/[A-Za-z]/.test(m) && /\d/.test(m)) { bump('key'); return '[key]'; } return m; });
  return { text: t, masked };
}

/** "Hidden before sending: 1 email address and 2 phone numbers." Empty when nothing was masked. */
export function maskedNote(masked: Partial<Record<MaskKind, number>>): string {
  const parts = (Object.keys(MASK_WORD) as MaskKind[]).filter(k => (masked[k] ?? 0) > 0).map(k => `${masked[k]} ${MASK_WORD[k][masked[k] === 1 ? 0 : 1]}`);
  if (!parts.length) return '';
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Hidden before sending: ${list}.`;
}
