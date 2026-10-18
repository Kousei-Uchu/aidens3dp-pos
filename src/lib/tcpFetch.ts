// Location: src/lib/tcpFetch.ts
// Pure half of a tiny HTTP/1.1 client over a raw socket (the socket itself is in tcpFetchIO.ts). Used only as a fallback for plain
// http:// addresses when the system's web request is refused, e.g. a Tailscale 100.x address. No TLS, no redirects, no keep-alive:
// one request, "Connection: close", read to the end. Strings here are "binary" (one char per byte) so lengths are byte lengths.
export type TcpTarget = { host: string; port: number; path: string; hostHeader: string };

export function parseHttpUrl(url: string): TcpTarget | null {
  const m = /^http:\/\/([^/?#:]+|\[[0-9a-f:]+\])(?::(\d{1,5}))?([/?][^#]*)?$/i.exec(url.trim()); if (!m) return null;
  const port = m[2] ? Number(m[2]) : 80; if (!(port > 0 && port < 65536)) return null;
  return { host: m[1], port, path: m[3] || '/', hostHeader: m[2] ? `${m[1]}:${port}` : m[1] };
}

const utf8Bytes = (s: string): string => unescape(encodeURIComponent(s)); // text -> one char per byte
const fromUtf8Bytes = (b: string): string => { try { return decodeURIComponent(escape(b)); } catch { return b; } };

/** The full request as text to write (UTF-8). */
export function buildRequest(t: TcpTarget, method: string, headers: Record<string, string>, body?: string): string {
  const h: Record<string, string> = { ...headers, host: t.hostHeader, connection: 'close' };
  const lower = new Set(Object.keys(h).map(k => k.toLowerCase())); lower.delete('host'); lower.delete('connection');
  const lines = [`${method} ${t.path} HTTP/1.1`, `Host: ${t.hostHeader}`, 'Connection: close'];
  for (const [k, v] of Object.entries(headers)) if (!/^(host|connection|content-length)$/i.test(k)) lines.push(`${k}: ${v}`);
  if (body !== undefined) lines.push(`Content-Length: ${utf8Bytes(body).length}`);
  return `${lines.join('\r\n')}\r\n\r\n${body ?? ''}`;
}

/** Complete when the head and (for Content-Length or chunked) the whole body have arrived; otherwise null. A close ends anything else. */
export function parseResponse(raw: string, closed: boolean): { status: number; text: string } | null {
  const cut = raw.indexOf('\r\n\r\n'); if (cut < 0) return null;
  const head = raw.slice(0, cut); const rest = raw.slice(cut + 4);
  const sm = /^HTTP\/1\.[01] (\d{3})/.exec(head); if (!sm) return closed ? { status: 0, text: '' } : null;
  const status = Number(sm[1]);
  if (/^transfer-encoding:\s*chunked/im.test(head)) {
    let pos = 0; let out = '';
    for (;;) {
      const eol = rest.indexOf('\r\n', pos); if (eol < 0) return closed ? { status, text: fromUtf8Bytes(out) } : null;
      const size = parseInt(rest.slice(pos, eol).split(';')[0].trim(), 16); if (!Number.isFinite(size)) return { status, text: fromUtf8Bytes(out) };
      if (size === 0) return { status, text: fromUtf8Bytes(out) };
      if (rest.length < eol + 2 + size + 2) return closed ? { status, text: fromUtf8Bytes(out + rest.slice(eol + 2)) } : null;
      out += rest.slice(eol + 2, eol + 2 + size); pos = eol + 2 + size + 2;
    }
  }
  const lm = /^content-length:\s*(\d+)/im.exec(head);
  if (lm) { const n = Number(lm[1]); if (rest.length >= n) return { status, text: fromUtf8Bytes(rest.slice(0, n)) }; return closed ? { status, text: fromUtf8Bytes(rest) } : null; }
  return closed ? { status, text: fromUtf8Bytes(rest) } : null;
}
