// Location: tests/assistantconfig.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEndpoint, classifyHost, defaultAssistant, isConfigured, maskKey, normaliseAssistant, parseBaseUrl } from '../src/lib/assistantConfig';

test('classifyHost: this device, the private ranges and .local names are local', () => {
  for (const h of ['localhost', 'LOCALHOST', 'localhost.', 'app.localhost', '127.0.0.1', '127.9.9.9', '10.0.0.5', '10.255.255.255', '192.168.1.20', '172.16.0.1', '172.31.255.254', '::1', 'shop-pc.local', 'SHOP-PC.LOCAL']) assert.equal(classifyHost(h), 'local', h);
});

test('classifyHost: everything else is remote, including lookalikes and bare names', () => {
  for (const h of ['', 'example.com', 'api.openai.com', '8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.1.1', '11.0.0.1', '100.64.0.1', '192.168.1.1.example.com', 'localhost.example.com', 'local', '.local', 'evil.local.com', 'shop-pc', '192.168.1', '192.168.1.256', '192.168.01.1', '0177.0.0.1', '2130706433', '::2', 'fe80::1', 'fd00::1']) assert.equal(classifyHost(h), 'remote', h);
});

test('parseBaseUrl: reads typical addresses', () => {
  assert.deepEqual(parseBaseUrl('http://192.168.1.20:11434/v1'), { ok: true, base: 'http://192.168.1.20:11434/v1', host: '192.168.1.20', https: false });
  assert.deepEqual(parseBaseUrl('  https://API.Example.com/v1/  '), { ok: true, base: 'https://api.example.com/v1', host: 'api.example.com', https: true });
  assert.deepEqual(parseBaseUrl('http://[::1]:11434/v1'), { ok: true, base: 'http://[::1]:11434/v1', host: '::1', https: false });
  assert.deepEqual(parseBaseUrl('http://shop-pc.local:11434/v1///'), { ok: true, base: 'http://shop-pc.local:11434/v1', host: 'shop-pc.local', https: false });
});

test('parseBaseUrl: no scheme means http for a local host and https for anything else', () => {
  const a = parseBaseUrl('192.168.1.20:11434/v1'); assert.ok(a.ok); assert.equal(a.ok && a.base, 'http://192.168.1.20:11434/v1');
  const b = parseBaseUrl('api.example.com/v1'); assert.ok(b.ok); assert.equal(b.ok && b.base, 'https://api.example.com/v1');
  const c = parseBaseUrl('localhost:11434/v1'); assert.ok(c.ok); assert.equal(c.ok && c.base, 'http://localhost:11434/v1');
});

test('parseBaseUrl: refuses what could hide the real host or leak the key', () => {
  for (const bad of ['', '   ', 'ftp://host/v1', 'file:///etc/passwd', 'http://', 'http://user:pass@host/v1', 'http://localhost@evil.com/v1', 'http://host/v1?key=abc', 'http://host/v1#x', 'http://host name/v1', 'http://[::1/v1', 'http://host:abc/v1', 'javascript:alert(1)'])
    assert.equal(parseBaseUrl(bad).ok, false, bad);
});

test('classifyEndpoint: an address with userinfo or garbage is never local, and the mode can force either way', () => {
  assert.equal(classifyEndpoint('http://localhost@evil.com/v1', 'auto'), 'remote');
  assert.equal(classifyEndpoint('http://192.168.1.1.example.com/v1', 'auto'), 'remote');
  assert.equal(classifyEndpoint('', 'auto'), 'remote');
  assert.equal(classifyEndpoint('nonsense', 'auto'), 'remote');
  assert.equal(classifyEndpoint('http://192.168.1.20:11434/v1', 'auto'), 'local');
  assert.equal(classifyEndpoint('https://api.example.com/v1', 'auto'), 'remote');
  assert.equal(classifyEndpoint('https://api.example.com/v1', 'local'), 'local');
  assert.equal(classifyEndpoint('', 'local'), 'local');
  assert.equal(classifyEndpoint('http://192.168.1.20:11434/v1', 'remote'), 'remote');
  assert.equal(classifyEndpoint('http://localhost:11434/v1', 'remote'), 'remote');
  assert.equal(classifyEndpoint('', 'remote'), 'remote');
});

test('normaliseAssistant: defaults, clamps and ignores junk', () => {
  assert.deepEqual(normaliseAssistant(undefined), defaultAssistant());
  assert.deepEqual(normaliseAssistant('x'), defaultAssistant());
  assert.deepEqual(normaliseAssistant([1]), defaultAssistant());
  const d = defaultAssistant();
  assert.equal(d.timeoutSec, 120); assert.equal(d.contextSize, 8000); assert.equal(d.toolCallLimit, 15); assert.equal(d.endpointMode, 'auto');
  const n = normaliseAssistant({ baseUrl: '  http://h/v1 ', model: ' m ', temperature: 9, timeoutSec: 1, contextSize: '32000', toolCallLimit: 1000, endpointMode: 'sideways', treatAsLocal: 'yes' });
  assert.equal(n.baseUrl, 'http://h/v1'); assert.equal(n.model, 'm'); assert.equal(n.temperature, 2); assert.equal(n.timeoutSec, 5); assert.equal(n.contextSize, 32000); assert.equal(n.toolCallLimit, 100); assert.equal(n.endpointMode, 'auto'); assert.ok(!('treatAsLocal' in n));
  const bad = normaliseAssistant({ temperature: 'hot', timeoutSec: NaN, contextSize: '', toolCallLimit: null, baseUrl: 5, model: {} });
  assert.deepEqual(bad, d);
  assert.equal(normaliseAssistant({ treatAsLocal: true }).endpointMode, 'local'); // settings saved by 0148
  assert.equal(normaliseAssistant({ treatAsLocal: false }).endpointMode, 'auto');
  assert.equal(normaliseAssistant({ treatAsLocal: true, endpointMode: 'remote' }).endpointMode, 'remote'); // the new field wins
  for (const m of ['auto', 'local', 'remote']) assert.equal(normaliseAssistant({ endpointMode: m }).endpointMode, m);
});

test('isConfigured needs a readable address and a model', () => {
  assert.equal(isConfigured({ baseUrl: '', model: 'm' }), false);
  assert.equal(isConfigured({ baseUrl: 'http://h/v1', model: '' }), false);
  assert.equal(isConfigured({ baseUrl: 'http://user:p@h/v1', model: 'm' }), false);
  assert.equal(isConfigured({ baseUrl: 'http://h/v1', model: 'm' }), true);
});

test('maskKey shows at most the last four characters of a long key', () => {
  assert.equal(maskKey(''), ''); assert.equal(maskKey('short'), 'Saved');
  assert.equal(maskKey('sk-abcdefghijklmnop1234'), 'Saved, ends 1234');
  assert.ok(!maskKey('sk-abcdefghijklmnop1234').includes('abcdefghijklmnop'));
});
