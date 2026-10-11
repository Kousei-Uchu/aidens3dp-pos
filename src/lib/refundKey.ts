import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

type RefundLine = { lineId: string; qty: number };

export function refundOperationKey(input: {
  orderId: string; refundedCents: number; refundable: { id: string; qty: number }[];
  lines: RefundLine[]; amountCents: number; method: string; reason: string;
}) {
  const snapshot = JSON.stringify([
    input.orderId, input.refundedCents, input.refundable.map(l => `${l.id}:${l.qty}`).sort(),
    input.lines.map(l => `${l.lineId}:${l.qty}`).sort(),
    input.amountCents, input.method, input.reason,
  ]);
  return `pos-refund-${bytesToHex(sha256(utf8ToBytes(snapshot))).slice(0, 32)}`;
}
