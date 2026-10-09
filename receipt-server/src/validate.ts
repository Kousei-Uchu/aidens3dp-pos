// Location: receipt-server/src/validate.ts
// Defensive parsing: the Worker only stores what passes this, and everything is HTML-escaped again at render time.
import type { ReceiptDoc, ReceiptLine, ReceiptPayment } from './types';

export const ID_RE = /^[a-f0-9]{20}$/;
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : undefined);
const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);
const link = (v: unknown): string | undefined => { const s = str(v, 400); return s && /^https:\/\/[^\s"'<>]+$/.test(s) ? s : undefined; };

export function parseReceipt(input: unknown, id: string): ReceiptDoc | null {
  const d = input as any;
  if (!d || typeof d !== 'object' || d.v !== 1 || d.id !== id || !ID_RE.test(id)) return null;
  if (!d.seller || typeof d.seller !== 'object' || !Array.isArray(d.lines) || !Array.isArray(d.payments)) return null;
  if (d.lines.length > 200 || d.payments.length > 20) return null;
  const sellerName = str(d.seller.name, 120); if (!sellerName) return null;
  if (Number.isNaN(Date.parse(d.issuedAt))) return null;
  const lines: ReceiptLine[] = d.lines.map((l: any) => ({
    title: str(l?.title, 200) ?? 'Item', variant: str(l?.variant, 120), qty: Math.max(1, int(l?.qty)), unitCents: int(l?.unitCents), grossCents: int(l?.grossCents),
    discountCents: int(l?.discountCents), netCents: int(l?.netCents),
    discounts: Array.isArray(l?.discounts) ? l.discounts.slice(0, 5).map((x: unknown) => str(x, 80)).filter(Boolean) as string[] : undefined,
    note: str(l?.note, 200), gift: l?.gift ? true : undefined,
  }));
  const kinds = ['card', 'cash', 'gift_card', 'credit'];
  const payments: ReceiptPayment[] = d.payments.map((p: any) => ({
    kind: kinds.includes(p?.kind) ? p.kind : 'card', label: str(p?.label, 80) ?? 'Payment', amountCents: int(p?.amountCents),
    tenderedCents: p?.tenderedCents != null ? int(p.tenderedCents) : undefined, changeCents: p?.changeCents != null ? int(p.changeCents) : undefined,
    card: p?.card && typeof p.card === 'object' ? { scheme: str(p.card.scheme, 40), masked: str(p.card.masked, 40), approval: str(p.card.approval, 40), rrn: str(p.card.rrn, 40), txn: str(p.card.txn, 80), ref: str(p.card.ref, 80), at: str(p.card.at, 60), link: link(p.card.link) } : undefined,
  }));
  const s = d.seller;
  return {
    v: 1, id, kind: d.kind === 'refund' ? 'refund' : 'sale', number: str(d.number, 40) ?? id.slice(0, 8).toUpperCase(), issuedAt: new Date(d.issuedAt).toISOString(),
    tz: str(d.tz, 60) ?? 'UTC', currency: /^[A-Z]{3}$/.test(d.currency) ? d.currency : 'AUD',
    seller: { name: sellerName, abn: str(s.abn, 30), address: str(s.address, 240), phone: str(s.phone, 40), email: str(s.email, 120), website: str(s.website, 120), returnPolicy: str(s.returnPolicy, 600), gstRegistered: !!s.gstRegistered },
    order: str(d.order, 40), register: str(d.register, 60), staff: str(d.staff, 60), billedTo: str(d.billedTo, 120), refundOf: str(d.refundOf, 40), reason: str(d.reason, 120),
    lines, itemsCents: int(d.itemsCents), discountCents: int(d.discountCents), roundingCents: int(d.roundingCents), tipCents: int(d.tipCents), totalCents: int(d.totalCents), gstCents: int(d.gstCents), payments,
  };
}
