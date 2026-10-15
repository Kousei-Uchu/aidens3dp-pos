// Location: src/lib/trainingGifts.ts
// Practice gift cards for the gift card payment course (B6): a few made-up cards kept in memory, so checking a balance
// and paying with a gift card work in practice without Shopify. Every id starts with "train-". Nothing here is saved or
// sent: leaving training (or starting a part again) puts the cards back as they were.
import { TRAIN_PREFIX } from './trainingSandbox';
import { normaliseCode } from './giftCode';
import type { GiftCardInfo, GiftCardTxn } from './shopify/giftcards';

const P = TRAIN_PREFIX;
const WHEN = '2026-10-12T02:10:00.000Z';
type PracticeCard = { id: string; code: string; last4: string; balanceCents: number; initialCents: number; enabled: boolean; expiresOn?: string };
/** The cards practice knows. TRAINPRACTICE1 is the one the scanning course scans, so the two courses agree on it. */
const fixtureCards = (): PracticeCard[] => [
  { id: `${P}gc-1`, code: 'TRAINPRACTICE1', last4: '0001', balanceCents: 2500, initialCents: 2500, enabled: true },
  { id: `${P}gc-2`, code: 'GIFT25', last4: '0025', balanceCents: 2500, initialCents: 2500, enabled: true },
  { id: `${P}gc-3`, code: 'GIFT05', last4: '0005', balanceCents: 500, initialCents: 500, enabled: true },
  { id: `${P}gc-4`, code: 'GIFTOFF', last4: '0009', balanceCents: 1000, initialCents: 1000, enabled: false },
];
/** The full-balance card the guide uses, and the three the checks use. */
export const PRACTICE_GIFT_FULL = `${P}gc-2`; export const PRACTICE_GIFT_SMALL = `${P}gc-3`; export const PRACTICE_GIFT_OFF = `${P}gc-4`;

type Held = { cards: PracticeCard[]; txns: Record<string, GiftCardTxn[]>; debits: number };
let cards = fixtureCards(); let txns: Record<string, GiftCardTxn[]> = {}; let debits = 0;
const copyCards = (c: PracticeCard[]): PracticeCard[] => c.map(x => ({ ...x }));
const copyTxns = (t: Record<string, GiftCardTxn[]>): Record<string, GiftCardTxn[]> => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.map(x => ({ ...x }))]));

/** Puts every practice gift card back as new, and forgets what was charged. */
export function resetPracticeGifts(): void { cards = fixtureCards(); txns = {}; debits = 0; }
/** A copy of the practice cards and their history, to be put back with `restorePracticeGifts` (used to start a Check goal again). */
export const capturePracticeGifts = (): Held => ({ cards: copyCards(cards), txns: copyTxns(txns), debits });
export function restorePracticeGifts(h: Held): void { cards = copyCards(h.cards); txns = copyTxns(h.txns); debits = h.debits; }
/** How many gift cards have been charged in practice so far. */
export const getPracticeGiftsCharged = (): number => debits;

/** A practice gift card found by its code, or null. Runs instead of Shopify's lookup while training. */
export function practiceLookupGiftCard(rawCode: string): GiftCardInfo | null {
  const code = normaliseCode(rawCode);
  if (code.length < 4) return null;
  const c = cards.find(x => x.code === code);
  return c ? { id: c.id, last4: c.last4, balanceCents: c.balanceCents, initialCents: c.initialCents, enabled: c.enabled, expiresOn: c.expiresOn, verified: true } : null;
}
/** Charge a practice card, and record it. Runs instead of Shopify's debit while training. Does nothing for an unknown card. */
export function practiceDebitGiftCard(id: string, cents: number): void {
  const c = cards.find(x => x.id === id); if (!c || !c.enabled) return;
  const amount = Math.max(0, Math.min(cents, c.balanceCents));
  c.balanceCents -= amount; debits += 1;
  txns = { ...txns, [id]: [...(txns[id] ?? []), { id: `${P}gct-${debits}`, cents: amount, at: WHEN, kind: 'debit' }] };
}
/** What a practice card has been through, so "Check balance" can show its history. Runs instead of Shopify while training. */
export function practiceGiftCardHistory(id: string): GiftCardTxn[] { return (txns[id] ?? []).map(t => ({ ...t })); }
