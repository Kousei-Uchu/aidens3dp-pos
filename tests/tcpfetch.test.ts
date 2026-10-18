import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, parseHttpUrl, parseResponse } from '../src/lib/tcpFetch';

test('parseHttpUrl reads host, port and path; refuses https', () => {
  assert.deepEqual(parseHttpUrl('http://100.122.167.39:11434/v1/models'), { host: '100.122.167.39', port: 11434, path: '/v1/models', hostHeader: '100.122.167.39:11434' });
  assert.equal(parseHttpUrl('https://x.com/'), null);
});
test('buildRequest sets Host, Connection close and a byte Content-Length', () => {
  const r = buildRequest(parseHttpUrl('http://h:1/p')!, 'POST', { 'content-type': 'application/json' }, '{"a":"é"}');
  assert.ok(r.startsWith('POST /p HTTP/1.1\r\nHost: h:1\r\nConnection: close\r\n')); assert.ok(r.includes('Content-Length: 10\r\n')); assert.ok(r.endsWith('\r\n\r\n{"a":"é"}'));
});
test('parseResponse: content-length, waiting for more, chunked, and utf8', () => {
  assert.deepEqual(parseResponse('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nhi', false), { status: 200, text: 'hi' });
  assert.equal(parseResponse('HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhi', false), null);
  assert.deepEqual(parseResponse('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n2\r\nde\r\n0\r\n\r\n', false), { status: 200, text: 'abcde' });
  const b = unescape(encodeURIComponent('é'));
  assert.deepEqual(parseResponse(`HTTP/1.1 404 NF\r\nContent-Length: ${b.length}\r\n\r\n${b}`, false), { status: 404, text: 'é' });
  assert.deepEqual(parseResponse('HTTP/1.1 200 OK\r\n\r\nrest', true), { status: 200, text: 'rest' });
});
