// Location: tests/squareshare.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:net';
import type { AddressInfo } from 'node:net';
import { buildManifest, isManifestUrl, packMonths, parseManifest, unpackJson, type SquareManifest } from '../src/lib/squareHistory';
import type { HistSale } from '../src/lib/squareConvert';
import {
  MAX_HEAD_BYTES, SHARE_PORT, answerRequest, chunkBytes, contentTypeOf, newShareKey, noteServed, parseRequest, responseHead, route,
  shareStatus, shareUrl, shareableNames, statusLine, usableLanIp, type ShareLog,
} from '../src/lib/squareShare';

const sale = (uuid: string, ts: string): HistSale => ({ uuid, ts, type: 'sale', registerId: 'square', source: 'square', squareOrderId: `SQ-${uuid}`, lines: [], cogsCents: 0 } as unknown as HistSale);
const sales = [sale('a', '2025-03-01T01:00:00Z'), sale('b', '2025-03-02T01:00:00Z'), sale('c', '2025-04-02T01:00:00Z')];
const { files } = packMonths(sales); const manifest = buildManifest(sales, files, ['Market']);
const KEY = newShareKey(new Uint8Array([1, 2, 3, 4, 171, 205, 239, 255]));

test('share key is 16 lowercase hex characters from 8 bytes, and refuses too few bytes', () => {
  assert.equal(KEY, '01020304abcdefff');
  assert.throws(() => newShareKey(new Uint8Array(4)));
});

test('the share address has the same shape as the PC script address, so the existing scanner accepts it', () => {
  const u = shareUrl('192.168.1.20', SHARE_PORT, KEY);
  assert.equal(u, 'http://192.168.1.20:8787/01020304abcdefff/manifest.json');
  assert.ok(isManifestUrl(u));
  assert.throws(() => shareUrl('not an ip!', 8787, KEY));
});

test('only a real Wi-Fi address can be shared', () => {
  for (const ok of ['192.168.1.20', '10.0.0.5', '172.20.10.2']) assert.ok(usableLanIp(ok), ok);
  for (const bad of ['0.0.0.0', '127.0.0.1', '169.254.3.4', '', null, undefined, 'abc', '300.1.1.1', '192.168.1', '::1', '224.0.0.1']) assert.ok(!usableLanIp(bad as any), String(bad));
});

test('the server only ever offers the manifest and the files the manifest lists', () => {
  const names = shareableNames(manifest);
  assert.deepEqual([...names].sort(), ['manifest.json', ...files.map(f => f.name)].sort());
  const sneaky: SquareManifest = { ...manifest, files: [...manifest.files, { name: '../etc/passwd', bytes: 1, sales: 0, month: 'x' }] };
  assert.ok(!shareableNames(sneaky).has('../etc/passwd'));
  assert.ok(!names.has('rollups.json.gz'));
});

test('request parsing waits for the end of the headers and refuses nonsense', () => {
  assert.deepEqual(parseRequest('GET /x HTTP/1.1\r\nHost: a'), { kind: 'more' });
  assert.deepEqual(parseRequest('GET /abc/manifest.json HTTP/1.1\r\nHost: a\r\n\r\n'), { kind: 'ok', method: 'GET', target: '/abc/manifest.json' });
  assert.deepEqual(parseRequest('hello\r\n\r\n'), { kind: 'bad' });
  assert.deepEqual(parseRequest('GET /x HTTP/2\r\n\r\n'), { kind: 'bad' });
  assert.deepEqual(parseRequest('x'.repeat(MAX_HEAD_BYTES + 10)), { kind: 'bad' });
});

test('routing: right key and a listed file is 200; everything else is 404 or 405 and says nothing about why', () => {
  const allowed = shareableNames(manifest); const f = files[0].name;
  assert.deepEqual(route('GET', `/${KEY}/manifest.json`, KEY, allowed), { status: 200, name: 'manifest.json' });
  assert.deepEqual(route('GET', `/${KEY}/${f}`, KEY, allowed), { status: 200, name: f });
  assert.deepEqual(route('GET', `/${KEY}/${f}?x=1`, KEY, allowed), { status: 200, name: f });
  assert.deepEqual(route('GET', `/ffffffffffffffff/${f}`, KEY, allowed), { status: 404 });
  assert.deepEqual(route('GET', `/${KEY}/rollups.json.gz`, KEY, allowed), { status: 404 });
  assert.deepEqual(route('GET', `/${KEY}/../manifest.json`, KEY, allowed), { status: 404 });
  assert.deepEqual(route('GET', `/${KEY}/%2e%2e/x`, KEY, allowed), { status: 404 });
  assert.deepEqual(route('GET', '/', KEY, allowed), { status: 404 });
  assert.deepEqual(route('POST', `/${KEY}/manifest.json`, KEY, allowed), { status: 405 });
});

test('answerRequest ties parsing and routing together', () => {
  const allowed = shareableNames(manifest);
  assert.deepEqual(answerRequest('GET /', KEY, allowed), { kind: 'more' });
  assert.deepEqual(answerRequest('junk\r\n\r\n', KEY, allowed), { kind: 'error', status: 400 });
  assert.deepEqual(answerRequest(`GET /${KEY}/manifest.json HTTP/1.1\r\n\r\n`, KEY, allowed), { kind: 'file', name: 'manifest.json' });
  assert.deepEqual(answerRequest('GET /nope/manifest.json HTTP/1.1\r\n\r\n', KEY, allowed), { kind: 'error', status: 404 });
});

test('response head has the length, a type, no caching and closes the connection', () => {
  const h = responseHead(200, 1234, contentTypeOf('sales-2025-03.json.gz'));
  assert.match(h, /^HTTP\/1\.1 200 OK\r\n/); assert.match(h, /Content-Type: application\/gzip\r\n/); assert.match(h, /Content-Length: 1234\r\n/);
  assert.match(h, /Connection: close\r\n\r\n$/); assert.match(h, /no-store/);
  assert.match(responseHead(404, 0), /^HTTP\/1\.1 404 Not Found\r\n/); assert.doesNotMatch(responseHead(404, 0), /Content-Type/);
  assert.equal(contentTypeOf('manifest.json'), 'application/json');
});

test('chunking keeps every byte, in order, and handles empty input', () => {
  const b = new Uint8Array(100000).map((_, i) => i % 251); const parts = chunkBytes(b, 32768);
  assert.equal(parts.length, 4); assert.ok(parts.every(p => p.length <= 32768));
  const joined = new Uint8Array(b.length); let o = 0; for (const p of parts) { joined.set(p, o); o += p.length; }
  assert.deepEqual(joined, b); assert.deepEqual(chunkBytes(new Uint8Array(0)), []);
});

test('progress: a register is finished only after the manifest and every file reached it', () => {
  const log: ShareLog = new Map(); assert.deepEqual(shareStatus(manifest, log), { devices: 0, finished: 0, files: 0 });
  assert.match(statusLine(shareStatus(manifest, log)), /Waiting/);
  noteServed(log, '192.168.1.30', 'manifest.json'); noteServed(log, '192.168.1.30', files[0].name);
  let st = shareStatus(manifest, log); assert.deepEqual(st, { devices: 1, finished: 0, files: 2 }); assert.match(statusLine(st), /Sending… 2 files/);
  noteServed(log, '192.168.1.30', files[1].name); noteServed(log, '192.168.1.30', files[1].name);
  st = shareStatus(manifest, log); assert.deepEqual(st, { devices: 1, finished: 1, files: 3 }); assert.match(statusLine(st), /Sent to 1 register\./);
  for (const n of ['manifest.json', ...files.map(f => f.name)]) noteServed(log, '192.168.1.31', n);
  st = shareStatus(manifest, log); assert.equal(st.finished, 2); assert.match(statusLine(st), /Sent to 2 registers/);
});

// A real round trip over a local socket. The server below is the app's logic (answerRequest, responseHead, chunkBytes) with Node
// sockets in place of the phone's, and the client is Node's own fetch, standing in for the importer on the other register.
function serve(map: Map<string, Uint8Array>, key: string): Promise<{ server: Server; base: string }> {
  const allowed = new Set(map.keys());
  return new Promise(ok => {
    const server = createServer(sock => {
      let head = ''; let done = false;
      sock.on('error', () => {});
      sock.on('data', d => {
        if (done) return; head += d.toString('latin1'); const a = answerRequest(head, key, allowed); if (a.kind === 'more') return; done = true;
        if (a.kind === 'error') { sock.end(responseHead(a.status, 0)); return; }
        const bytes = map.get(a.name)!; sock.write(responseHead(200, bytes.length, contentTypeOf(a.name)));
        for (const c of chunkBytes(bytes, 1000)) sock.write(c);
        sock.end();
      });
    }).listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/${key}/` }));
  });
}

test('round trip: another register can fetch the manifest and every month over real HTTP and read them back unchanged', async () => {
  const mtext = JSON.stringify(manifest); const map = new Map<string, Uint8Array>([['manifest.json', new TextEncoder().encode(mtext)], ...files.map(f => [f.name, f.data] as [string, Uint8Array])]);
  const { server, base } = await serve(map, KEY);
  try {
    const m = parseManifest(await (await fetch(`${base}manifest.json`)).text());
    assert.equal(m.sales, 3); assert.equal(m.files.length, 2);
    const got: HistSale[] = [];
    for (const f of m.files) {
      const res = await fetch(base + encodeURIComponent(f.name)); assert.equal(res.status, 200);
      const bytes = new Uint8Array(await res.arrayBuffer()); assert.deepEqual(bytes, map.get(f.name)); got.push(...unpackJson<HistSale[]>(bytes));
    }
    assert.deepEqual(got.map(s => s.uuid), ['a', 'b', 'c']);
    assert.equal((await fetch(base.replace(KEY, 'ffffffffffffffff') + 'manifest.json')).status, 404);
    assert.equal((await fetch(`${base}rollups.json.gz`)).status, 404);
    assert.equal((await fetch(`${base}manifest.json`, { method: 'POST' })).status, 405);
  } finally { server.close(); }
});
