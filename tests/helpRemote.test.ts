import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchRemoteHelp } from '../src/lib/helpRemote';
import { builtinHelp } from '../src/lib/helpBuiltin';
import { makeBundle } from '../src/lib/helpDocs';

const bundle = JSON.parse(readFileSync('help/help.json', 'utf8'));

test('remote help sends the current version and returns a valid newer bundle', async () => {
  let etag: string | null = null;
  const local = builtinHelp();
  const remote = makeBundle(local.pages.map((page, i) => i === 0 ? { ...page, summary: `${page.summary} refreshed` } : page));
  const request: typeof fetch = async (_input, init) => {
    etag = new Headers(init?.headers).get('If-None-Match');
    return new Response(JSON.stringify(remote), { status: 200 });
  };
  const result = await fetchRemoteHelp('https://docs.example.test/', bundle.version, request);
  assert.equal(etag, `"${bundle.version}"`);
  assert.equal(result?.version, remote.version);
  assert.equal(result?.pages.length, bundle.pages.length);
});

test('unchanged remote help uses the built-in copy', async () => {
  const request: typeof fetch = async () => new Response(null, { status: 304 });
  assert.equal(await fetchRemoteHelp('https://docs.example.test', bundle.version, request), null);
});

test('invalid remote bundles are surfaced for the built-in fallback UI', async () => {
  const request: typeof fetch = async () => new Response('{"pages":[]}', { status: 200 });
  await assert.rejects(fetchRemoteHelp('https://docs.example.test', bundle.version, request), /invalid help bundle/);
});
