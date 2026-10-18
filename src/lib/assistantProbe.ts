// Location: src/lib/assistantProbe.ts
// A one-off network diagnostic for Settings ▸ AI assistant ▸ Test connection. When the test fails, it tries a handful of addresses
// and reports what each one did and how fast, so "the app cannot reach my server" can be told apart from "the app has no network",
// "plain http is blocked" and "this kind of address is blocked". It sends nothing from the shop: every request is a plain GET.
import type { FetchLike } from './assistantClient';

export type ProbeResult = { label: string; url: string; ok: boolean; ms: number; detail: string };

export function probeTargets(baseUrl: string): { label: string; url: string }[] {
  let origin = ''; try { const m = /^(https?:\/\/[^/]+)/i.exec(baseUrl.trim()); origin = m ? m[1] : ''; } catch { origin = ''; }
  const base = baseUrl.trim().replace(/\/+$/, '');
  return [
    ...(origin ? [{ label: 'Your server (home page)', url: `${origin}/` }, { label: 'Your server (model list)', url: `${base}/models` }] : []),
    { label: 'Tailscale address 100.100.100.100 (plain http)', url: 'http://100.100.100.100/' },
    { label: 'Public website (https)', url: 'https://www.apple.com/library/test/success.html' },
    { label: 'Public website (plain http)', url: 'http://captive.apple.com/hotspot-detect.html' },
  ];
}

/** `raw` opens a plain socket (no web request) so the check can tell a refused web request from a refused connection. */
export async function runProbes(f: FetchLike, baseUrl: string, timeoutMs = 6000, raw?: (host: string, port: number) => Promise<void>): Promise<ProbeResult[]> {
  const out: ProbeResult[] = [];
  const hp = /^http:\/\/([^/?#:]+):?(\d*)/i.exec(baseUrl.trim());
  if (raw && hp) { const t0 = Date.now(); const port = Number(hp[2]) || 80; const url = `tcp://${hp[1]}:${port}`;
    try { await raw(hp[1], port); out.push({ label: 'Your server (raw connection, no web request)', url, ok: true, ms: Date.now() - t0, detail: 'connected' }); }
    catch (e: any) { out.push({ label: 'Your server (raw connection, no web request)', url, ok: false, ms: Date.now() - t0, detail: `${e?.name ?? 'Error'}: ${e?.message ?? String(e)}` }); } }
  for (const t of probeTargets(baseUrl)) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs); const t0 = Date.now();
    try {
      const r = await f(t.url, { method: 'GET', headers: { accept: '*/*' }, signal: ctl.signal });
      out.push({ ...t, ok: true, ms: Date.now() - t0, detail: `answered (HTTP ${r.status})` });
    } catch (e: any) {
      const ms = Date.now() - t0;
      out.push({ ...t, ok: false, ms, detail: e?.name === 'AbortError' ? `no answer in ${Math.round(timeoutMs / 1000)}s` : `${e?.name ?? 'Error'}: ${e?.message ?? String(e)}` });
    } finally { clearTimeout(timer); }
  }
  return out;
}
