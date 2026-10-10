// Location: src/lib/adjustReason.ts
// A16.8: the optional reason for a price adjustment, and how adjustments are kept on a sale. The list is saved on the
// Shopify order as one custom attribute (pos_adjustments, 255 characters at most) and added up by reason for Reports.
import type { SaleAdjustment } from './types';

export const REASON_MAX = 80;
/** What the cashier typed, tidied: spaces collapsed, cut to REASON_MAX; undefined when blank. */
export const cleanReason = (s: string | undefined): string | undefined => { const t = (s ?? '').replace(/\s+/g, ' ').trim().slice(0, REASON_MAX).trim(); return t || undefined; };
/** Reports group reasons without caring about capitals or spacing ("Damaged box" and "damaged  box" are one). '' = no reason given. */
export const reasonKey = (s: string | undefined): string => (cleanReason(s) ?? '').toLowerCase();
export const reasonLabel = (key: string): string => (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'No reason given');

const E = (v: unknown) => encodeURIComponent(v === undefined || v === null ? '' : String(v));
const LIMIT = 250;
const one = (a: SaleAdjustment, title: number, reason: number) => [a.kind, a.cents, E(a.title.slice(0, title)), E((a.reason ?? '').slice(0, reason))].join('|');
/**
 * kind|cents|title|reason per adjustment (each text part URI-encoded), joined with ";". Shopify allows 255 characters, so a long
 * reason is shortened to fit, and entries that still don't fit are left off and counted at the end (";+2").
 */
export function encodeAdjustments(list: SaleAdjustment[]): string {
  const parts: string[] = []; let len = 0;
  for (let i = 0; i < list.length; i++) {
    const room = LIMIT - len - 6; // keeps space for a trailing ";+NN"
    let p = one(list[i], 24, REASON_MAX);
    for (let r = REASON_MAX; p.length > room && r > 0; r -= 10) p = one(list[i], 24, Math.max(0, r - 10));
    if (p.length > room) { parts.push(`+${list.length - i}`); break; }
    parts.push(p); len += p.length + 1;
  }
  return parts.join(';');
}
export function decodeAdjustments(s: string | undefined): SaleAdjustment[] {
  if (!s) return [];
  const out: SaleAdjustment[] = [];
  for (const part of s.split(';')) {
    const f = part.split('|'); if (f.length < 4) continue;
    const kind = f[0]; const cents = Number(f[1]);
    if ((kind !== 'item' && kind !== 'line' && kind !== 'order') || !Number.isFinite(cents)) continue;
    const dec = (x: string) => { try { return decodeURIComponent(x); } catch { return x; } };
    out.push({ kind, cents, title: dec(f[2]), detail: '', reason: dec(f[3]) || undefined });
  }
  return out;
}
