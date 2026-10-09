// Location: receipt-server/src/types.ts
// Shared by the Worker and the app (the app imports this type only). One snapshot = one customer-facing receipt / tax invoice.
export type ReceiptLine = {
  title: string; variant?: string; qty: number; unitCents: number; grossCents: number; discountCents: number; netCents: number;
  discounts?: string[]; note?: string; gift?: boolean;
};
export type ReceiptPayment = {
  kind: 'card' | 'cash' | 'gift_card' | 'credit'; label: string; amountCents: number; tenderedCents?: number; changeCents?: number;
  card?: { scheme?: string; masked?: string; approval?: string; rrn?: string; txn?: string; ref?: string; at?: string; link?: string };
};
export type ReceiptDoc = {
  v: 1; id: string; kind: 'sale' | 'refund'; number: string; issuedAt: string; tz: string; currency: string;
  seller: { name: string; abn?: string; address?: string; phone?: string; email?: string; website?: string; returnPolicy?: string; gstRegistered: boolean };
  order?: string; register?: string; staff?: string; billedTo?: string; refundOf?: string; reason?: string;
  lines: ReceiptLine[];
  itemsCents: number; discountCents: number; roundingCents: number; tipCents: number; totalCents: number; gstCents: number;
  payments: ReceiptPayment[];
};
