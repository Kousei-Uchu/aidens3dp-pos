// Location: receipt-server/src/render.ts
// Server-side HTML for the receipt page (all values escaped). The same data drives the PDF/PNG downloads in clientScript.ts.
import type { ReceiptDoc } from './types';
import { CLIENT_JS } from './clientScript';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
export const money = (cents: number, cur: string) => { try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur }).format(cents / 100); } catch { return `$${(cents / 100).toFixed(2)}`; } };
const smoney = (c: number, cur: string) => (c < 0 ? '-' : '') + money(Math.abs(c), cur);
const when = (iso: string, tz: string) => { try { return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(iso)); } catch { return new Date(iso).toUTCString(); } };

export const titleFor = (d: ReceiptDoc) => (d.kind === 'refund' ? (d.seller.gstRegistered ? 'Adjustment note (refund)' : 'Refund receipt') : d.seller.gstRegistered ? 'Tax invoice' : 'Receipt');

// Storefront styling (E1): the same logo and Instrument Sans as the storefront and the Docs site
// (docs-server/src/index.ts holds the source of truth for these values). The paper itself stays white,
// because this is a printable tax invoice and the PDF/PNG are drawn separately on white.
const LOGO = 'https://www.aidens3dp.com/cdn/shop/files/Untitled_design_1.png?height=108&v=1745546152';

// Fonts + palette shared by the receipt page and the message page, so both read the same as the Docs site.
const TOKENS = `
@font-face{font-family:"Instrument Sans";font-style:normal;font-weight:400;font-display:swap;src:url("https://www.aidens3dp.com/cdn/fonts/instrument_sans/instrumentsans_n4.db86542ae5e1596dbdb28c279ae6c2086c4c5bfa.woff2") format("woff2")}
@font-face{font-family:"Instrument Sans";font-style:normal;font-weight:700;font-display:swap;src:url("https://www.aidens3dp.com/cdn/fonts/instrument_sans/instrumentsans_n7.e4ad9032e203f9a0977786c356573ced65a7419a.woff2") format("woff2")}
:root{color-scheme:dark;--bg:#13111c;--surface:#1b1924;--surface-raised:#211e29;--fg:#efd8c9;--muted:rgba(239,216,201,.68);--line:rgba(246,237,221,.16);--accent:#fae9dc;--accent-text:#13111c;--highlight:#fb873f;--soft:rgba(246,237,221,.08)}
*{box-sizing:border-box}`;

const CSS = `${TOKENS}
body{margin:0;background:#13111c;color:#efd8c9;font:15px/1.45 "Instrument Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
header{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid rgba(246,237,221,.16)}
header>img{width:30px;height:30px;object-fit:contain}header strong{font-size:16px;font-weight:500}header span{color:rgba(239,216,201,.68);font-size:12.5px}
.bar{position:sticky;top:0;z-index:2;background:#1b1924;display:flex;gap:18px;justify-content:center;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid rgba(246,237,221,.16)}
.bar button{font:600 14px/1 "Instrument Sans",inherit;border:0;border-radius:100px;padding:11px 16px;background:rgba(246,237,221,.08);color:#efd8c9;cursor:pointer;transition:filter .15s ease}
.bar button:hover{filter:brightness(1.25)}
.bar button.p{background:#fae9dc;color:#13111c}.bar button.p:hover{filter:brightness(.92)}
.wrap{max-width:680px;margin:0 auto;padding:16px 16px 40px}
.paper{background:#fff;color:#161616;border-radius:14px;padding:28px 26px;box-shadow:0 2px 10px rgba(0,0,0,.35)}
h1{font-size:21px;margin:0 0 2px}h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin:20px 0 6px}
.sub{color:#5b5b5b;font-size:13px}.kind{font-weight:700;font-size:17px;margin:16px 0 8px}
dl{display:grid;grid-template-columns:110px 1fr;gap:3px 10px;margin:0;font-size:14px}dt{color:#5b5b5b}dd{margin:0}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:14px}th{font-size:12px;text-align:right;color:#5b5b5b;border-bottom:1.5px solid #161616;padding:6px 0}th:first-child,td:first-child{text-align:left}
td+td,th+th{padding-left:14px;white-space:nowrap}td{padding:7px 0;border-bottom:1px solid #e6e6e6;text-align:right;vertical-align:top;font-variant-numeric:tabular-nums}.d{color:#5b5b5b;font-size:12.5px}
.tot{margin-top:8px;margin-left:auto;width:min(100%,300px)}.tot div{display:flex;justify-content:space-between;padding:2px 0;font-variant-numeric:tabular-nums}
.tot .grand{font-weight:700;font-size:18px;border-top:1.5px solid #161616;margin-top:5px;padding-top:7px}
.pay div.r{display:flex;justify-content:space-between}.pay .d{margin-bottom:6px}
.who{background:#211e29;border:1px solid rgba(246,237,221,.16);border-radius:14px;padding:12px;margin:0 0 14px}
.who label{display:block;font-size:12px;color:rgba(239,216,201,.68);margin:0 0 3px}
.who input{width:100%;font:inherit;padding:8px 9px;border:1px solid rgba(246,237,221,.16);border-radius:10px;background:rgba(246,237,221,.08);color:#efd8c9;outline:none;margin-bottom:8px}
.who input:focus{border-color:#fae9dc;box-shadow:0 0 0 3px rgba(250,233,220,.18)}
.who small{display:block;color:rgba(239,216,201,.68);font-size:12px}#bto{font-size:14px;margin:0 0 8px}
.foot{margin-top:18px;border-top:1px solid #e6e6e6;padding-top:10px;color:#5b5b5b;font-size:12.5px;word-break:break-word}.foot a{color:#161616}
@media print{body{background:#fff;color:#161616}.bar,.who,header{display:none}.paper{box-shadow:none;border-radius:0;padding:0}.wrap{padding:0}@page{margin:16mm}}
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
<header><img class="brand-mark" src="${LOGO}" alt="Aiden’s 3D Printing"><strong>${esc(S.name)}</strong><span>Receipt</span></header>
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
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="theme-color" content="#13111c"><title>${esc(title)}</title>
<style>${TOKENS}
body{margin:0;display:grid;place-items:center;min-height:100vh;background:var(--bg);color:var(--fg);font:15px/1.5 "Instrument Sans",sans-serif}main{max-width:420px;padding:28px 24px;text-align:center;background:var(--surface);border:1px solid var(--line);border-radius:18px}h1{font-size:22px;font-weight:400;letter-spacing:-.02em;margin:0 0 8px}</style></head><body><main><h1>${esc(title)}</h1><p style="color:var(--muted);margin:0">${esc(body)}</p></main></body></html>`;
}
