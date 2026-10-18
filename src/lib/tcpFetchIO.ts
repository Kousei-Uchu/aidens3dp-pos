// Location: src/lib/tcpFetchIO.ts
// The socket half of tcpFetch.ts, and `assistantFetch`: the system fetch first, and for a plain http:// address that the system refuses
// ("Network request failed"), the same request over a raw socket. Only the assistant and its network check use it.
import TcpSocket from 'react-native-tcp-socket';
import type { FetchLike } from './assistantClient';
import { buildRequest, parseHttpUrl, parseResponse } from './tcpFetch';

const latin1 = (d: unknown): string => { if (typeof d === 'string') return d; const u = d as Uint8Array; let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return s; };

/** Opens a raw connection and closes it again. Resolves when connected; rejects with the socket's own error. */
export function rawConnect(host: string, port: number, timeoutMs = 6000): Promise<void> {
  return new Promise((ok, no) => {
    let done = false; const fin = (e?: Error) => { if (done) return; done = true; clearTimeout(t); try { s.destroy(); } catch { /* closed */ } e ? no(e) : ok(); };
    const t = setTimeout(() => fin(new Error(`no answer in ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
    const s = TcpSocket.createConnection({ host, port }, () => fin());
    s.on('error', (e: Error) => fin(e));
  });
}

export const tcpFetch: FetchLike = (url, init) => new Promise((ok, no) => {
  const t = parseHttpUrl(url); if (!t) { no(new TypeError('Network request failed')); return; }
  let raw = ''; let done = false;
  const fin = (e?: unknown, r?: { status: number; text: string }) => {
    if (done) return; done = true; init.signal?.removeEventListener?.('abort', onAbort); try { s.destroy(); } catch { /* closed */ }
    if (e) no(e); else ok({ ok: r!.status >= 200 && r!.status < 300, status: r!.status, text: async () => r!.text });
  };
  const onAbort = () => { const e: any = new Error('Aborted'); e.name = 'AbortError'; fin(e); };
  init.signal?.addEventListener?.('abort', onAbort);
  const s = TcpSocket.createConnection({ host: t.host, port: t.port }, () => { try { s.write(buildRequest(t, init.method, init.headers, init.body), 'utf8'); } catch (e) { fin(e); } });
  s.on('data', (d: unknown) => { raw += latin1(d); const r = parseResponse(raw, false); if (r) fin(undefined, r); });
  s.on('error', (e: Error) => fin(e));
  s.on('close', () => { const r = parseResponse(raw, true); if (r && r.status) fin(undefined, r); else fin(new TypeError('Network request failed')); });
});

/** System fetch, then (plain http only) a raw socket if the system refused. */
export const assistantFetch: FetchLike = async (url, init) => {
  try { return await (fetch as unknown as FetchLike)(url, init); }
  catch (e: any) {
    if (e?.name === 'AbortError' || !/^http:\/\//i.test(url) || !parseHttpUrl(url)) throw e;
    return tcpFetch(url, init);
  }
};
