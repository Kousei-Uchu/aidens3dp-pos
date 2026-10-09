// Processing fees – the Zeller SDK result has NO fee field, so fees are always computed locally and
// are "estimated" until reconciled against Zeller's statements (research doc §4.9 / §6.9).
export type FeeSettings = {
  cardPresentRate: number; // 0.014 = 1.4 %
  keyedRate: number; // 0.017 = 1.7 % (MANUAL / CNP)
  refundReturnsFee: boolean; // default false: the original fee stays a cost
};
export const DEFAULT_FEES: FeeSettings = { cardPresentRate: 0.014, keyedRate: 0.017, refundReturnsFee: false };

const KEYED = new Set(['MANUAL', 'CNP', 'CNP_APPLE_PAY', 'CNP_GOOGLE_PAY']);

export function feeRateFor(cardMedia: string | undefined, s: FeeSettings): number {
  return cardMedia && KEYED.has(cardMedia) ? s.keyedRate : s.cardPresentRate;
}
export function feeFor(amountCents: number, cardMedia: string | undefined, s: FeeSettings) {
  const rate = feeRateFor(cardMedia, s);
  return { rate, cents: Math.round(amountCents * rate) };
}
