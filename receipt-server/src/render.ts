// Location: receipt-server/src/render.ts
// Server-side HTML for the receipt page (all values escaped). The same data drives the PDF/PNG downloads in clientScript.ts.
import type { ReceiptDoc } from './types';
import { CLIENT_JS } from './clientScript';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
export const money = (cents: number, cur: string) => { try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur }).format(cents / 100); } catch { return `$${(cents / 100).toFixed(2)}`; } };
const smoney = (c: number, cur: string) => (c < 0 ? '-' : '') + money(Math.abs(c), cur);
const when = (iso: string, tz: string) => { try { return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(iso)); } catch { return new Date(iso).toUTCString(); } };

export const titleFor = (d: ReceiptDoc) => (d.kind === 'refund' ? (d.seller.gstRegistered ? 'Adjustment note (refund)' : 'Refund receipt') : d.seller.gstRegistered ? 'Tax invoice' : 'Receipt');

const CSS = `
:root{color-scheme:light}*{box-sizing:border-box}
body{margin:0;background:#f2f2f0;color:#161616;font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
.bar{position:sticky;top:0;z-index:2;background:#161616;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;padding:10px 12px}
.bar button{font:600 14px/1 inherit;border:0;border-radius:9px;padding:11px 16px;background:#fff;color:#161616;cursor:pointer}
.bar button.p{background:#ffd84d}
.wrap{max-width:680px;margin:0 auto;padding:16px 16px 40px}
.paper{background:#fff;border-radius:6px;padding:28px 26px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
h1{font-size:21px;margin:0 0 2px}h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin:20px 0 6px}
.sub{color:#5b5b5b;font-size:13px}.kind{font-weight:700;font-size:17px;margin:16px 0 8px}
dl{display:grid;grid-template-columns:110px 1fr;gap:3px 10px;margin:0;font-size:14px}dt{color:#5b5b5b}dd{margin:0}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:14px}th{font-size:12px;text-align:right;color:#5b5b5b;border-bottom:1.5px solid #161616;padding:6px 0}th:first-child,td:first-child{text-align:left}
td+td,th+th{padding-left:14px;white-space:nowrap}td{padding:7px 0;border-bottom:1px solid #e6e6e6;text-align:right;vertical-align:top;font-variant-numeric:tabular-nums}.d{color:#5b5b5b;font-size:12.5px}
.tot{margin-top:8px;margin-left:auto;width:min(100%,300px)}.tot div{display:flex;justify-content:space-between;padding:2px 0;font-variant-numeric:tabular-nums}
.tot .grand{font-weight:700;font-size:18px;border-top:1.5px solid #161616;margin-top:5px;padding-top:7px}
.pay div.r{display:flex;justify-content:space-between}.pay .d{margin-bottom:6px}
.who{background:#faf7e8;border:1px solid #efe6b8;border-radius:8px;padding:12px;margin:14px 0}
.who label{display:block;font-size:12px;color:#5b5b5b;margin:0 0 3px}.who input{width:100%;font:inherit;padding:8px 9px;border:1px solid #cfcfcf;border-radius:7px;margin-bottom:8px}
.who small{display:block;color:#6b6b6b;font-size:12px}#bto{font-size:14px;margin:0 0 8px}
.foot{margin-top:18px;border-top:1px solid #e6e6e6;padding-top:10px;color:#5b5b5b;font-size:12.5px;word-break:break-word}.foot a{color:#161616}
@media print{body{background:#fff}.bar,.who{display:none}.paper{box-shadow:none;padding:0}.wrap{padding:0}@page{margin:16mm}}
`;

export function renderReceipt(d: ReceiptDoc, nonce: string): string {
  const c = d.currency, S = d.seller, reg = S.gstRegistered;
  const link = d.payments.find(p => p.card?.link)?.card?.link;
  const meta: [string, string | undefined][] = [['Receipt no.', d.number], ['Order', d.order], ['Date', when(d.issuedAt, d.tz)], ['Original sale', d.refundOf], ['Reason', d.reason], ['Served by', d.staff]];
  const rows = d.lines.map(l => `<tr><td>${esc(l.title)}${l.variant ? ` – ${esc(l.variant)}` : ''}${l.discountCents ? `<div class="d">${esc((l.discounts ?? []).join(', ') || 'Discount')} −${esc(money(l.discountCents, c))}</div>` : ''}${l.note ? `<div class="d">${esc(l.note)}</div>` : ''}</td><td>${l.qty}</td><td>${esc(smoney(l.unitCents, c))}</td><td>${esc(smoney(l.grossCents, c))}</td></tr>`).join('');
  const pay = d.payments.map(p => {
    const det = [p.card?.approval && `Approval ${p.card.approval}`, p.card?.rrn && `RRN ${p.card.rrn}`, p.card?.txn && `Zeller txn ${p.card.txn}`, p.card?.ref && `Ref ${p.card.ref}`, p.card?.at, p.tenderedCents && `Tendered ${money(p.tenderedCents, c)}`, p.changeCents && `Change ${money(p.changeCents, c)}`].filter(Boolean).join(' · ');
    return `<div class="r"><span>${esc(p.label)}</span><span>${esc(smoney(p.amountCents, c))}</span></div>${det ? `<div class="d">${esc(det)}</div>` : ''}`;
  }).join('');
  const contact = [S.phone, S.email, S.website].filter(Boolean).map(esc).join(' · ');
  const json = JSON.stringify(d).replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${esc(titleFor(d))} ${esc(d.number)} · ${esc(S.name)}</title><style>${CSS}</style></head><body>
<div class="bar"><button class="p" id="pdf">Download PDF</button><button id="img">Save as image</button><button id="prt">Print</button></div>
<div class="wrap"><div class="who"><label for="bn">Billed to (name)</label><input id="bn" value="${esc(d.billedTo ?? '')}" autocomplete="name"><label for="ba">Buyer ABN (optional)</label><input id="ba" inputmode="numeric" autocomplete="off">
<small>${reg ? 'Tax invoices of $1,000 or more must show the buyer’s name or ABN. ' : ''}Add your details here before downloading. Nothing you type is sent or saved.</small></div>
<div class="paper"><h1>${esc(S.name)}</h1>${S.abn ? `<div class="sub">ABN ${esc(S.abn)}</div>` : ''}${S.address ? `<div class="sub">${esc(S.address)}</div>` : ''}${contact ? `<div class="sub">${contact}</div>` : ''}
<div class="kind">${esc(titleFor(d)).toUpperCase()}</div>
<dl>${meta.filter(m => m[1]).map(m => `<dt>${esc(m[0])}</dt><dd>${esc(m[1])}</dd>`).join('')}</dl><p id="bto" class="sub" style="margin:8px 0 0"></p>
<table><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot">${d.discountCents || d.roundingCents || d.tipCents ? `<div><span>Subtotal</span><span>${esc(smoney(d.itemsCents, c))}</span></div>` : ''}${d.discountCents ? `<div><span>Discounts</span><span>−${esc(money(d.discountCents, c))}</span></div>` : ''}${d.roundingCents ? `<div><span>Rounding</span><span>${esc(smoney(d.roundingCents, c))}</span></div>` : ''}${d.tipCents ? `<div><span>Tip</span><span>${esc(smoney(d.tipCents, c))}</span></div>` : ''}<div class="grand"><span>${d.kind === 'refund' ? 'Total refunded' : 'Total'}</span><span>${esc(smoney(d.totalCents, c))}</span></div></div>
${reg ? `<p class="sub" style="text-align:right;margin:6px 0 0">${d.kind === 'refund' ? 'Total refunded includes GST of' : 'Total includes GST of'} ${esc(money(d.gstCents, c))}</p>` : ''}
${d.lines.some(l => l.gift) ? '<p class="d">Gift cards are not taxed at sale; GST applies when the card is redeemed.</p>' : ''}
<h2>${d.kind === 'refund' ? 'Refund method' : 'Payment'}</h2><div class="pay">${pay}</div>
<div class="foot">${S.returnPolicy ? `<p>${esc(S.returnPolicy)}</p>` : ''}<p>Issued ${esc(when(d.issuedAt, d.tz))} · Ref ${esc(d.id)}${link ? ` · <a href="${esc(link)}" rel="noopener">Original card receipt</a>` : ''}</p></div></div></div>
<script type="application/json" id="rdoc">${json}</script><script nonce="${nonce}">${CLIENT_JS}</script></body></html>`;
}

export function messagePage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#f2f2f0;font:16px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#161616}main{max-width:420px;padding:24px;text-align:center}h1{font-size:20px}p{color:#5b5b5b}</style></head><body><main><h1>${esc(title)}</h1><p>${esc(body)}</p></main></body></html>`;
}
