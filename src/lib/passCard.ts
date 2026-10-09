// Location: src/lib/passCard.ts
// Printable cashier pass (a card-sized HTML page for AirPrint or a PDF). Pure, so it is testable without a device.
import qrcode from 'qrcode-generator';
import { code128Path } from './code128';

export type PassFormat = 'qr' | 'code128';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function qrSvgMarkup(value: string): string {
  const q = qrcode(0, 'M'); q.addData(value); q.make(); const n = q.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -3 ${n + 6} ${n + 6}" shape-rendering="crispEdges"><rect x="-3" y="-3" width="${n + 6}" height="${n + 6}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
export function code128SvgMarkup(value: string): string {
  const { d, width } = code128Path(value);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 1" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${width}" height="1" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

export function buildPassHtml(i: { shop: string; name: string; role: string; code: string; format: PassFormat }): string {
  const qr = i.format === 'qr';
  const code = qr ? `<div class="qr">${qrSvgMarkup(i.code)}</div>` : `<div class="bar">${code128SvgMarkup(i.code)}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cashier pass</title><style>
@page { margin: 18mm; }
body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; }
.card { width: 85.6mm; height: 54mm; box-sizing: border-box; border: 0.4mm dashed #888; border-radius: 4mm; padding: 5mm; display: flex; ${qr ? 'flex-direction: row; align-items: center; gap: 4mm;' : 'flex-direction: column; justify-content: space-between;'} background: #fff; }
.who { flex: 1; min-width: 0; }
.shop { font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: #555; }
.name { font-size: 17pt; font-weight: 700; margin-top: 2mm; overflow-wrap: anywhere; }
.role { font-size: 10pt; color: #444; margin-top: 1mm; }
.qr { width: 30mm; height: 30mm; flex: none; } .qr svg { width: 100%; height: 100%; display: block; }
.bar { height: 14mm; width: 100%; } .bar svg { width: 100%; height: 100%; display: block; }
.note { margin-top: 8mm; max-width: 120mm; font-size: 9.5pt; line-height: 1.5; color: #333; }
</style></head><body>
<div class="card"><div class="who"><div class="shop">${esc(i.shop || 'Register')}</div><div class="name">${esc(i.name)}</div><div class="role">${esc(cap(i.role))} pass</div></div>${qr ? code : ''}${qr ? '' : code}</div>
<p class="note">Cashier pass for ${esc(i.name)}. Cut along the dashed line and laminate it if you like. Scan it at the register to sign in. Keep it private: anyone holding this card can sign in as ${esc(i.name)}. If it is lost, issue a new pass in the app and the old one stops working.</p>
</body></html>`;
}
