// Location: src/lib/setupTransferIO.ts
// Device side of the QR setup transfer (rules in setupTransfer.ts). The set up device seals its backup with a one-time code and
// serves it once on the shop Wi-Fi, the same small server the Square history share uses. The new device scans the QR, fetches,
// opens it with the code and applies it like a restored backup.
import TcpSocket from 'react-native-tcp-socket';
import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { noteActivity } from './idle';
import { collectBackup } from './backupIO';
import { decryptBackup, encryptBackup, validateBackup, type BackupV1 } from './backupFile';
import { askForIp, lanIp } from './squareShareIO';
import { SHARE_PORT, SHARE_PORT_TRIES, answerRequest, chunkBytes, newShareKey, responseHead, usableLanIp } from './squareShare';
import { SETUP_FILE, SETUP_TTL_MS, describeFetchFailure, newSetupCode, setupQr, setupStatusLine, type SetupEnd, type SetupTarget } from './setupTransfer';
import { assistantFetch } from './tcpFetchIO';

const KEEP_TAG = 'pos-setup-share';
const WRITE_TIMEOUT_MS = 20000;
type Sock = InstanceType<typeof TcpSocket.Socket>;
const latin1 = (d: unknown): string => { if (typeof d === 'string') return d; const u = d as Uint8Array; let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return s; };
const write = (s: Sock, data: string | Uint8Array): Promise<void> => new Promise((ok, no) => {
  const t = setTimeout(() => no(new Error('write timed out')), WRITE_TIMEOUT_MS);
  try { s.write(data, typeof data === 'string' ? 'utf8' : undefined, (err?: Error) => { clearTimeout(t); err ? no(err) : ok(); }); } catch (e) { clearTimeout(t); no(e); }
});
const utf8 = (s: string): Uint8Array => { const TE = (globalThis as any).TextEncoder; if (TE) return new TE().encode(s); const e = unescape(encodeURIComponent(s)); return Uint8Array.from(e, c => c.charCodeAt(0)); };

export type SetupShareHandle = { qr: string; stop: () => void };

/**
 * Seals this device's settings, grid and logins with a fresh one-time code and serves them once. The caller has already asked for the
 * admin PIN. Throws a plain-words Error when this device cannot share (not on Wi-Fi, no free port).
 */
export async function startSetupShare(onUpdate: (line: string) => void, onEnd: (why: SetupEnd, message?: string) => void): Promise<SetupShareHandle> {
  let { ip, seen } = await lanIp();
  if (!usableLanIp(ip)) ip = await askForIp(seen);
  if (!usableLanIp(ip)) throw new Error(`Could not find this device's Wi-Fi address (got ${seen.map(x => x || 'nothing').join(', ')}). Check it is on Wi-Fi and try again.`);
  const code = newSetupCode(Crypto.getRandomBytes(16)); const key = newShareKey(Crypto.getRandomBytes(8));
  const body = utf8(await encryptBackup(JSON.stringify(await collectBackup()), code)); // a few seconds: the key is stretched
  const allowed = new Set([SETUP_FILE]); const sockets = new Set<Sock>(); let stopped = false;

  const server = TcpSocket.createServer((socket: Sock) => {
    sockets.add(socket); let head = ''; let handled = false;
    socket.on('error', () => { sockets.delete(socket); }); socket.on('close', () => { sockets.delete(socket); });
    socket.on('data', async (d: unknown) => {
      if (handled || stopped) return; head += latin1(d); const a = answerRequest(head, key, allowed); if (a.kind === 'more') return; handled = true;
      try {
        if (a.kind === 'error') { await write(socket, responseHead(a.status, 0)); socket.end(); return; }
        await write(socket, responseHead(200, body.length, 'application/octet-stream'));
        for (const c of chunkBytes(body)) await write(socket, c);
        socket.end(); noteActivity(); onUpdate(setupStatusLine(true));
        setTimeout(() => stop('done'), 800); // one transfer only: let the last bytes leave, then close the door
      } catch { try { socket.destroy(); } catch { /* already closed */ } }
    });
  });

  let port = SHARE_PORT;
  for (let i = 0; ; i++) {
    port = SHARE_PORT + i;
    try { await new Promise<void>((ok, no) => { server.once('error', no); server.listen({ port, host: '0.0.0.0', reuseAddress: true }, () => { server.removeListener('error', no); ok(); }); }); break; }
    catch (e: any) { if (i + 1 >= SHARE_PORT_TRIES) throw new Error(`Could not start sharing (${e?.message ?? 'no free port'}). Check Local Network is allowed for this app in iOS Settings.`); }
  }
  void activateKeepAwakeAsync(KEEP_TAG).catch(() => {});
  const stop = (why: SetupEnd = 'manual', message?: string) => {
    if (stopped) return; stopped = true; clearTimeout(timer); sub.remove();
    for (const s of sockets) { try { s.destroy(); } catch { /* already closed */ } } sockets.clear();
    try { server.close(); } catch { /* already closed */ }
    void Promise.resolve(deactivateKeepAwake(KEEP_TAG)).catch(() => {});
    onEnd(why, message);
  };
  const timer = setTimeout(() => stop('ttl'), SETUP_TTL_MS);
  const sub = AppState.addEventListener('change', st => { if (st !== 'active') stop('background'); });
  server.on('error', (e: Error) => stop('error', e.message));
  onUpdate(setupStatusLine(false));
  return { qr: setupQr(ip, port, key, code), stop: () => stop('manual') };
}

/** New device: fetch the sealed backup from the set up device, open it with the code from the QR, and check it is one of ours. */
export async function fetchSetupBackup(t: SetupTarget): Promise<BackupV1> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 20000);
  let text: string;
  try {
    const res = await assistantFetch(t.url, { method: 'GET', headers: {}, signal: ctl.signal });
    if (!res.ok) throw Object.assign(new Error(describeFetchFailure(res.status, '')), { handled: true });
    text = await res.text();
  } catch (e: any) { throw e?.handled ? e : new Error(describeFetchFailure(null, e?.name === 'AbortError' ? 'no answer in 20 seconds' : String(e?.message ?? e))); }
  finally { clearTimeout(timer); }
  return validateBackup(JSON.parse(await decryptBackup(text, t.code)));
}
