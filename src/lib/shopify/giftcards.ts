// Location: src/lib/shopify/giftcards.ts
// Gift cards use Shopify's native GiftCard objects as the balance ledger.
// Redemption = giftCardDebit (reserves the balance at tender time); refund-to-card = giftCardCredit.
// NOTE: giftCardCredit/Debit need the write_gift_card_transactions scope (add it to the Dev Dashboard app).
import * as Crypto from 'expo-crypto';
import { gql, throwUserErrors } from './client';
import { CURRENCY, toCents, toDecimal } from '../money';
import { uid } from '../ids';
import { createCustomer, searchRemote } from './customers';
import type { GiftRecipient } from '../types';

export type GiftCardInfo = { id: string; last4: string; balanceCents: number; initialCents: number; enabled: boolean; expiresOn?: string; customerName?: string; verified: boolean };

export const normaliseCode = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
export const newGiftCode = () => uid().replace(/-/g, '').slice(0, 16).toUpperCase();
const checksum = async (code: string) => (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normaliseCode(code))).slice(0, 10);

const FIELDS = `id lastCharacters balance { amount } initialValue { amount } enabled expiresOn note customer { displayName }`;
const mapCard = (n: any, verified: boolean): GiftCardInfo => ({
  id: n.id, last4: n.lastCharacters, balanceCents: toCents(n.balance.amount), initialCents: toCents(n.initialValue.amount),
  enabled: !!n.enabled, expiresOn: n.expiresOn ?? undefined, customerName: n.customer?.displayName, verified,
});

/** Find the recipient's Shopify customer by email, or create one (Shopify needs a customer to deliver the card to). */
async function resolveRecipientId(r: GiftRecipient): Promise<string> {
  const email = r.email.trim().toLowerCase();
  const found = (await searchRemote(`email:${email}`)).find(c => c.email?.toLowerCase() === email);
  if (found) return found.id;
  const [firstName, ...rest] = (r.name ?? '').trim().split(/\s+/).filter(Boolean);
  return (await createCustomer({ email, firstName, lastName: rest.join(' ') || undefined })).id;
}

export async function createGiftCard(valueCents: number, code: string, saleUuid: string, customerId?: string, recipient?: GiftRecipient): Promise<GiftCardInfo> {
  const note = `pos|sale:${saleUuid}|chk:${await checksum(code)}`;
  const recipientId = recipient?.email ? await resolveRecipientId(recipient) : undefined;
  const recipientAttributes = recipientId ? { id: recipientId, ...(recipient?.name ? { preferredName: recipient.name.slice(0, 100) } : {}), ...(recipient?.message ? { message: recipient.message.slice(0, 200) } : {}) } : undefined;
  const d = await gql(`mutation($i: GiftCardCreateInput!){ giftCardCreate(input: $i) { giftCard { ${FIELDS} } userErrors { field message code } } }`,
    { i: { initialValue: toDecimal(valueCents), code: normaliseCode(code), note, ...(customerId ? { customerId } : {}), ...(recipientAttributes ? { recipientAttributes } : {}) } });
  const errs = d.giftCardCreate.userErrors as any[];
  if (errs?.length && /taken|already/i.test(`${errs[0].code} ${errs[0].message}`)) {
    const existing = await lookupGiftCard(code); // a retry after a lost reply – the card already exists
    if (existing) return existing;
  }
  throwUserErrors(errs, 'Creating the gift card');
  const card = mapCard(d.giftCardCreate.giftCard, true);
  if (recipientAttributes) await sendGiftCardEmail(card.id); // delivers the code + (if enabled in Shopify) the Apple Wallet button
  return card;
}

/** (Re)send the gift card notification to its recipient. Never fails a sale: the card exists either way. */
export async function sendGiftCardEmail(id: string): Promise<boolean> {
  try {
    const d = await gql(`mutation($id:ID!){ giftCardSendNotificationToRecipient(id:$id) { userErrors { field message } } }`, { id });
    return !(d.giftCardSendNotificationToRecipient.userErrors as any[]).length;
  } catch { return false; }
}

/** Find a card by its code. Shopify only lets us search by the last characters, so we verify with the note checksum. */
export async function lookupGiftCard(rawCode: string): Promise<GiftCardInfo | null> {
  const code = normaliseCode(rawCode);
  if (code.length < 4) return null;
  const d = await gql(`query($q:String){ giftCards(first: 10, query: $q) { nodes { ${FIELDS} } } }`, { q: `last_characters:${code.slice(-4).toLowerCase()}` });
  const nodes: any[] = d.giftCards.nodes;
  if (!nodes.length) return null;
  const chk = await checksum(code);
  const verified = nodes.find(n => (n.note ?? '').includes(`chk:${chk}`));
  if (verified) return mapCard(verified, true);
  const unmarked = nodes.filter(n => !(n.note ?? '').includes('chk:'));
  if (unmarked.length === 1 && code.length >= 8) return mapCard(unmarked[0], false); // created outside the POS
  return null;
}

export async function debitGiftCard(id: string, cents: number, note: string) {
  const d = await gql(`mutation($id:ID!,$i:GiftCardDebitInput!){ giftCardDebit(id:$id, debitInput:$i) { giftCardDebitTransaction { id } userErrors { field message code } } }`,
    { id, i: { debitAmount: { amount: toDecimal(cents), currencyCode: CURRENCY }, note } });
  throwUserErrors(d.giftCardDebit.userErrors, 'Redeeming the gift card');
}
export async function creditGiftCard(id: string, cents: number, note: string) {
  const d = await gql(`mutation($id:ID!,$i:GiftCardCreditInput!){ giftCardCredit(id:$id, creditInput:$i) { giftCardCreditTransaction { id } userErrors { field message code } } }`,
    { id, i: { creditAmount: { amount: toDecimal(cents), currencyCode: CURRENCY }, note } });
  throwUserErrors(d.giftCardCredit.userErrors, 'Crediting the gift card');
}

export type GiftCardTxn = { id: string; cents: number; at: string; note?: string; kind: 'credit' | 'debit' };
export async function giftCardHistory(id: string): Promise<GiftCardTxn[]> {
  const d = await gql(`query($id:ID!){ giftCard(id:$id){ transactions(first: 30) { nodes { __typename id note processedAt amount { amount } } } } }`, { id });
  return d.giftCard.transactions.nodes.map((n: any) => ({ id: n.id, cents: toCents(n.amount.amount), at: n.processedAt, note: n.note ?? undefined, kind: n.__typename.includes('Debit') ? 'debit' : 'credit' }));
}

export async function outstandingBalance(): Promise<{ cards: number; cents: number }> {
  let after: string | null = null, cards = 0, cents = 0;
  for (let i = 0; i < 40; i++) {
    const d: any = await gql(`query($after:String){ giftCards(first: 100, after:$after, query: "status:enabled") { pageInfo { hasNextPage endCursor } nodes { balance { amount } } } }`, { after });
    for (const n of d.giftCards.nodes) { const b = toCents(n.balance.amount); if (b > 0) { cards++; cents += b; } }
    if (!d.giftCards.pageInfo.hasNextPage) break;
    after = d.giftCards.pageInfo.endCursor;
  }
  return { cards, cents };
}
