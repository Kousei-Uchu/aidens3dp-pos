// Compact (≤255 char) encodings so tender details survive as Shopify order custom attributes.
import type { Tender } from './types';

const E = (v: unknown) => encodeURIComponent(v === undefined || v === null ? '' : String(v));
const D = (s: string) => decodeURIComponent(s);

export function encodeTender(t: Tender): string {
  const c = t.card;
  return [t.kind, t.amountCents, t.feeCents ?? '', t.roundingCents ?? '', t.tenderedCents ?? '', c?.externalReference ?? '', c?.transactionUuid ?? '',
    c?.approvalCode ?? '', c?.scheme ?? '', c?.panMasked ?? '', c?.cardMedia ?? '', c?.receiptLink ?? '', t.giftCardId ?? '', t.giftCardCode ? t.giftCardCode.slice(-4) : ''].map(E).join('|');
}

export function decodeTender(s: string, at = ''): Tender | null {
  const p = s.split('|').map(D);
  if (p.length < 14) return null;
  const num = (x: string) => (x === '' ? undefined : Number(x));
  const t: Tender = {
    id: p[5] || p[12] || `${p[0]}-${p[1]}`, kind: p[0] as Tender['kind'], amountCents: Number(p[1]), feeCents: num(p[2]), roundingCents: num(p[3]),
    tenderedCents: num(p[4]), at, giftCardId: p[12] || undefined, giftCardCode: p[13] ? `••••${p[13]}` : undefined,
  };
  if (p[0] === 'card') t.card = { externalReference: p[5] || undefined, transactionUuid: p[6] || undefined, approvalCode: p[7] || undefined, scheme: p[8] || undefined, panMasked: p[9] || undefined, cardMedia: p[10] || undefined, receiptLink: p[11] || undefined };
  return t;
}
