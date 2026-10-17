// Location: src/lib/squareShareIO.ts
// Register side of "share Square history with another register". It does what tools/square-history/export.ts does at the end of
// its run: a tiny read-only web server on the shop Wi-Fi, behind a random key, serving manifest.json and the monthly files already
// stored on this device. The other register scans the QR code (squareShare.ts builds the address) and downloads with the same
// importer it uses for the PC. Nothing is written, nothing leaves the local network, and the server stops by itself.
import TcpSocket from 'react-native-tcp-socket';
import DeviceInfo from 'react-native-device-info';
import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { noteActivity } from './idle';
import { readStoredFile, storedFileExists, storedManifest } from './squareHistoryIO';
import type { SquareManifest } from './squareHistory';
import {
  SHARE_PORT, SHARE_PORT_TRIES, SHARE_TTL_MS, answerRequest, chunkBytes, contentTypeOf, newShareKey, noteServed, responseHead, shareStatus,
  shareUrl, shareableNames, statusLine, usableLanIp, type ShareLog, type ShareStatus,
} from './squareShare';

const KEEP_TAG = 'pos-square-share';
const WRITE_TIMEOUT_MS = 20000;
export type ShareEnd = 'manual' | 'ttl' | 'background' | 'error';
export type ShareHandle = { url: string; manifest: SquareManifest; stop: () => void };

type Sock = InstanceType<typeof TcpSocket.Socket>;

const latin1 = (d: unknown): string => {
  if (typeof d === 'string') return d;
  const u = d as Uint8Array; let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return s;
};
const write = (s: Sock, data: string | Uint8Array): Promise<void> => new Promise((ok, no) => {
  const t = setTimeout(() => no(new Error('write timed out')), WRITE_TIMEOUT_MS);
  try { s.write(data, typeof data === 'string' ? 'utf8' : undefined, (err?: Error) => { clearTimeout(t); err ? no(err) : ok(); }); } catch (e) { clearTimeout(t); no(e); }
});

/** Starts sharing. Throws a plain-words Error when this register cannot share (no history, not on Wi-Fi, no free port). */
export async function startShare(onUpdate: (line: string, s: ShareStatus) => void, onEnd: (why: ShareEnd, message?: string) => void): Promise<ShareHandle> {
  const manifest = await storedManifest();
  if (!manifest) throw new Error('This register has no Square history yet. Import it first, then share it.');
  for (const f of manifest.files) if (!(await storedFileExists(f.name))) throw new Error(`The file ${f.name} is missing on this register. Import the history again, then share it.`);
  const ip = await DeviceInfo.getIpAddress().catch(() => '');
  if (!usableLanIp(ip)) throw new Error('This iPad is not connected to Wi-Fi. Join the same Wi-Fi as the other register and try again.');

  const key = newShareKey(Crypto.getRandomBytes(8)); const allowed = shareableNames(manifest); const log: ShareLog = new Map();
  const sockets = new Set<Sock>(); let stopped = false;
  const push = () => { const st = shareStatus(manifest, log); onUpdate(statusLine(st), st); };

  const server = TcpSocket.createServer((socket: Sock) => {
    sockets.add(socket); let head = ''; let handled = false;
    socket.on('error', () => { sockets.delete(socket); });
    socket.on('close', () => { sockets.delete(socket); });
    socket.on('data', async (d: unknown) => {
      if (handled || stopped) return; head += latin1(d); const a = answerRequest(head, key, allowed); if (a.kind === 'more') return; handled = true;
      const who = String(socket.remoteAddress ?? 'unknown');
      try {
        if (a.kind === 'error') { await write(socket, responseHead(a.status, 0)); socket.end(); return; }
        const bytes = await readStoredFile(a.name);
        await write(socket, responseHead(200, bytes.length, contentTypeOf(a.name)));
        for (const c of chunkBytes(bytes)) await write(socket, c);
        noteServed(log, who, a.name); noteActivity(); push(); socket.end();
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
  const stop = (why: ShareEnd = 'manual', message?: string) => {
    if (stopped) return; stopped = true; clearTimeout(timer); sub.remove();
    for (const s of sockets) { try { s.destroy(); } catch { /* already closed */ } } sockets.clear();
    try { server.close(); } catch { /* already closed */ }
    void Promise.resolve(deactivateKeepAwake(KEEP_TAG)).catch(() => {});
    onEnd(why, message);
  };
  const timer = setTimeout(() => stop('ttl'), SHARE_TTL_MS);
  // iOS pauses sockets in the background, so a half-working server would only confuse the other register.
  const sub = AppState.addEventListener('change', st => { if (st !== 'active') stop('background'); });
  server.on('error', (e: Error) => stop('error', e.message));
  return { url: shareUrl(ip, port, key), manifest, stop: () => stop('manual') };
}
