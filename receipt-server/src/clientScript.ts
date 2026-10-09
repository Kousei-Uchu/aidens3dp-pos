// Location: receipt-server/src/clientScript.ts
// Browser-side code for the receipt page, kept as a plain string (no build step, no third-party libraries).
// It lays the receipt out once, then draws that layout into (a) a real multi-page PDF and (b) a PNG.
export const CLIENT_JS = String.raw`
(function () {
  var doc = JSON.parse(document.getElementById('rdoc').textContent);
  var $ = function (id) { return document.getElementById(id); };
  var FONT = 'Helvetica, Arial, sans-serif';
  var ctx0 = document.createElement('canvas').getContext('2d');
  function money(c) { try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: doc.currency }).format(c / 100); } catch (e) { return '$' + (c / 100).toFixed(2); } }
  function smoney(c) { return (c < 0 ? '-' : '') + money(Math.abs(c)); }
  function when(iso) { try { return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: doc.tz }).format(new Date(iso)); } catch (e) { return new Date(iso).toLocaleString('en-AU'); } }
  function width(s, size, bold) { ctx0.font = (bold ? 'bold ' : '') + size + 'px ' + FONT; return ctx0.measureText(s).width; }
  function wrap(s, size, bold, max) {
    var out = [], cur = '';
    String(s).split(/\s+/).forEach(function (w) {
      while (width(w, size, bold) > max && w.length > 1) { // break very long words
        var k = w.length; while (k > 1 && width(w.slice(0, k), size, bold) > max) k--;
        if (cur) { out.push(cur); cur = ''; }
        out.push(w.slice(0, k)); w = w.slice(k);
      }
      var t = cur ? cur + ' ' + w : w;
      if (!cur || width(t, size, bold) <= max) cur = t; else { out.push(cur); cur = w; }
    });
    if (cur) out.push(cur);
    return out.length ? out : [''];
  }
  var registered = doc.seller.gstRegistered;
  var titleText = doc.kind === 'refund' ? (registered ? 'ADJUSTMENT NOTE (REFUND)' : 'REFUND RECEIPT') : (registered ? 'TAX INVOICE' : 'RECEIPT');
  function billed() { return { name: ($('bn') && $('bn').value || doc.billedTo || '').trim(), abn: ($('ba') && $('ba').value || '').trim() }; }

  // ---- layout: returns pages of draw ops in PDF points (A4: 595 x 842), y measured from the top ----
  function layout(pageH) {
    var M = 40, W = 595, R = W - M, pages = [[]], pg = 0, y = M, b = billed();
    function room(h) { if (pageH && y + h > pageH - M) { pages.push([]); pg++; y = M; } }
    function row(cols, size, gap) {
      var h = size * 1.4; room(h);
      cols.forEach(function (c) { pages[pg].push({ t: 't', s: c.s, x: c.x, y: y + size, size: c.size || size, b: !!c.b, a: c.a || 'l', g: c.g || 0 }); });
      y += h + (gap || 0);
    }
    function lines(arr, x, size, o) { o = o || {}; arr.forEach(function (s) { row([{ s: s, x: x, b: o.b, g: o.g }], size); }); }
    function rule(g) { room(10); pages[pg].push({ t: 'l', x1: M, x2: R, y: y + 4, g: g == null ? 0.6 : g }); y += 10; }
    var S = doc.seller;
    lines([S.name], M, 18, { b: true });
    if (S.abn) lines(['ABN ' + S.abn], M, 10);
    if (S.address) lines(wrap(S.address, 9, false, 300), M, 9, { g: 0.35 });
    var contact = [S.phone, S.email, S.website].filter(Boolean).join('  |  '); if (contact) lines(wrap(contact, 9, false, 480), M, 9, { g: 0.35 });
    y += 8; lines([titleText], M, 14, { b: true }); y += 2;
    function meta(label, val) { if (!val) return; row([{ s: label, x: M, g: 0.45, size: 9 }, { s: val, x: M + 90, size: 9.5 }], 9.5); }
    meta('Receipt no.', doc.number); meta('Order', doc.order); meta('Date', when(doc.issuedAt)); if (doc.refundOf) meta('Original sale', doc.refundOf); if (doc.reason) meta('Reason', doc.reason);
    meta('Served by', doc.staff); meta('Billed to', b.name); meta('Buyer ABN', b.abn);
    y += 4; rule();
    var cQ = 360, cU = 440;
    row([{ s: 'Description', x: M, b: true, size: 9 }, { s: 'Qty', x: cQ, a: 'r', b: true, size: 9 }, { s: 'Unit', x: cU, a: 'r', b: true, size: 9 }, { s: 'Amount', x: R, a: 'r', b: true, size: 9 }], 9);
    rule(0.8);
    doc.lines.forEach(function (l) {
      var name = l.title + (l.variant ? ' - ' + l.variant : '');
      var parts = wrap(name, 10, false, 290);
      row([{ s: parts[0], x: M }, { s: String(l.qty), x: cQ, a: 'r' }, { s: smoney(l.unitCents), x: cU, a: 'r' }, { s: smoney(l.grossCents), x: R, a: 'r' }], 10);
      parts.slice(1).forEach(function (p) { row([{ s: p, x: M }], 10); });
      if (l.discountCents) row([{ s: '  ' + ((l.discounts && l.discounts.join(', ')) || 'Discount'), x: M, g: 0.35, size: 9 }, { s: '-' + money(l.discountCents), x: R, a: 'r', g: 0.35, size: 9 }], 9);
      if (l.note) lines(wrap('  ' + l.note, 8.5, false, 400), M, 8.5, { g: 0.45 });
    });
    rule(0.8);
    function tot(label, val, bold, size) { row([{ s: label, x: cU - 60, a: 'l', b: bold, size: size || 10 }, { s: val, x: R, a: 'r', b: bold, size: size || 10 }], size || 10); }
    if (doc.discountCents || doc.roundingCents || doc.tipCents) tot('Subtotal', smoney(doc.itemsCents));
    if (doc.discountCents) tot('Discounts', '-' + money(doc.discountCents));
    if (doc.roundingCents) tot('Rounding', smoney(doc.roundingCents));
    if (doc.tipCents) tot('Tip', smoney(doc.tipCents));
    tot(doc.kind === 'refund' ? 'TOTAL REFUNDED' : 'TOTAL', smoney(doc.totalCents), true, 12);
    if (registered) lines([(doc.kind === 'refund' ? 'Total refunded includes GST of ' : 'Total includes GST of ') + money(doc.gstCents)], M, 9.5, { g: 0.2 });
    if (doc.lines.some(function (l) { return l.gift; })) lines(wrap('Gift cards are not taxed at sale; GST applies when the card is redeemed.', 8.5, false, 480), M, 8.5, { g: 0.45 });
    y += 6; lines([doc.kind === 'refund' ? 'Refund method' : 'Payment'], M, 11, { b: true });
    doc.payments.forEach(function (p) {
      row([{ s: p.label, x: M }, { s: smoney(p.amountCents), x: R, a: 'r' }], 10);
      var d = [];
      if (p.card) { if (p.card.approval) d.push('Approval ' + p.card.approval); if (p.card.rrn) d.push('RRN ' + p.card.rrn); if (p.card.txn) d.push('Zeller txn ' + p.card.txn); if (p.card.ref) d.push('Ref ' + p.card.ref); if (p.card.at) d.push(p.card.at); }
      if (p.tenderedCents) d.push('Tendered ' + money(p.tenderedCents)); if (p.changeCents) d.push('Change ' + money(p.changeCents));
      if (d.length) lines(wrap(d.join('  |  '), 8.5, false, 480), M + 8, 8.5, { g: 0.45 });
    });
    y += 8; rule(0.8);
    if (S.returnPolicy) lines(wrap(S.returnPolicy, 8.5, false, 515), M, 8.5, { g: 0.4 });
    lines(['Issued ' + when(doc.issuedAt) + '  |  Ref ' + doc.id], M, 8, { g: 0.55 });
    var link = null; doc.payments.forEach(function (p) { if (!link && p.card && p.card.link) link = p.card.link; });
    if (link) lines(wrap('Original card receipt: ' + link, 8, false, 515), M, 8, { g: 0.55 });
    return { pages: pages, height: y + M };
  }

  // ---- PDF (hand-written, standard Helvetica fonts, WinAnsi text) ----
  var MAP = { '–': '-', '—': '-', '−': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '•': '*', '×': 'x', '…': '...', '•': '*' };
  function latin1(s) { var o = ''; for (var i = 0; i < s.length; i++) { var ch = s[i], c = s.charCodeAt(i); o += MAP[ch] || (c < 256 && c >= 32 ? ch : '?'); } return o; }
  function esc(s) { return latin1(s).replace(/([\\()])/g, '\\$1'); }
  function pdfBytes() {
    var L = layout(842), objs = [];
    function add(s) { objs.push(s); return objs.length; }
    var cat = add(''), pgs = add(''), f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'), kids = [];
    L.pages.forEach(function (ops) {
      var cs = '';
      ops.forEach(function (o) {
        if (o.t === 't') { var x = o.a === 'r' ? o.x - width(latin1(o.s), o.size, o.b) : o.x; cs += o.g + ' g BT /' + (o.b ? 'F2' : 'F1') + ' ' + o.size + ' Tf ' + x.toFixed(2) + ' ' + (842 - o.y).toFixed(2) + ' Td (' + esc(o.s) + ') Tj ET\n'; }
        else cs += o.g + ' G 0.5 w ' + o.x1 + ' ' + (842 - o.y).toFixed(2) + ' m ' + o.x2 + ' ' + (842 - o.y).toFixed(2) + ' l S\n';
      });
      var cid = add('<< /Length ' + cs.length + ' >>\nstream\n' + cs + 'endstream');
      kids.push(add('<< /Type /Page /Parent ' + pgs + ' 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R >> >> /Contents ' + cid + ' 0 R >>') + ' 0 R');
    });
    var info = add('<< /Title (' + esc((registered ? 'Tax invoice ' : 'Receipt ') + doc.number) + ') /Producer (POS receipts) >>');
    objs[cat - 1] = '<< /Type /Catalog /Pages ' + pgs + ' 0 R >>';
    objs[pgs - 1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>';
    var out = '%PDF-1.4\n', offs = [];
    objs.forEach(function (o, i) { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xr = out.length; out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offs.forEach(function (o) { out += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + cat + ' 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xr + '\n%%EOF';
    var u = new Uint8Array(out.length); for (var i = 0; i < out.length; i++) u[i] = out.charCodeAt(i) & 255;
    return u;
  }

  // ---- PNG ----
  function pngCanvas() {
    var L = layout(0), S = 2.5, cv = document.createElement('canvas');
    cv.width = Math.round(595 * S); cv.height = Math.round(L.height * S);
    var c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.scale(S, S);
    L.pages[0].forEach(function (o) {
      var g = Math.round(o.g * 255);
      if (o.t === 't') { c.font = (o.b ? 'bold ' : '') + o.size + 'px ' + FONT; c.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')'; c.textAlign = o.a === 'r' ? 'right' : 'left'; c.textBaseline = 'alphabetic'; c.fillText(o.s, o.x, o.y); }
      else { c.strokeStyle = 'rgb(' + g + ',' + g + ',' + g + ')'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(o.x1, o.y); c.lineTo(o.x2, o.y); c.stroke(); }
    });
    return cv;
  }

  function save(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }
  var fname = (registered ? 'tax-invoice-' : 'receipt-') + doc.number.replace(/[^A-Za-z0-9_-]/g, '');
  $('pdf').addEventListener('click', function () { save(new Blob([pdfBytes()], { type: 'application/pdf' }), fname + '.pdf'); });
  $('img').addEventListener('click', function () { pngCanvas().toBlob(function (b) { save(b, fname + '.png'); }, 'image/png'); });
  $('prt').addEventListener('click', function () { window.print(); });
  function sync() { var b = billed(); $('bto').textContent = b.name ? 'Billed to: ' + b.name + (b.abn ? '  (ABN ' + b.abn + ')' : '') : (b.abn ? 'Buyer ABN: ' + b.abn : ''); }
  ['bn', 'ba'].forEach(function (id) { $(id).addEventListener('input', sync); }); sync();
  window.__receipt = { pdfBytes: pdfBytes, layout: layout, pngCanvas: pngCanvas };
})();
`;
