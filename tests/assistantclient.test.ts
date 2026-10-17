// Location: tests/assistantclient.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { AssistantError, TEST_PROMPT, TEST_TOOL, TEST_TOOL_PROMPT, chat, listModels, redactSecrets, testConnection, type Endpoint, type FetchLike } from '../src/lib/assistantClient';

const KEY = 'sk-test-SECRETSECRET1234';
const ep = (o: Partial<Endpoint> = {}): Endpoint => ({ baseUrl: 'http://192.168.1.20:11434/v1', model: 'llama3.1:8b', timeoutSec: 5, apiKey: '', ...o });
type Call = { url: string; method: string; headers: Record<string, string>; body?: any };
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
function server(handler: (c: Call) => ReturnType<typeof json> | Promise<ReturnType<typeof json>>) {
  const calls: Call[] = [];
  const f: FetchLike = async (url, init) => { const c = { url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined }; calls.push(c); return handler(c); };
  return { f, calls };
}
const reply = (message: any) => json(200, { choices: [{ message, finish_reason: 'stop' }] });
const toolReply = reply({ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'test_ping', arguments: '{}' } }] });
const good = (c: Call) => c.url.endsWith('/models') ? json(200, { data: [{ id: 'llama3.1:8b' }, { id: 'other' }] }) : c.body?.tools ? toolReply : reply({ role: 'assistant', content: 'OK' });

test('chat: posts to /chat/completions with the model, never streams, and sends the key only as a bearer header', async () => {
  const s = server(() => reply({ role: 'assistant', content: 'Hi' }));
  const r = await chat(s.f, ep({ apiKey: KEY }), { messages: [{ role: 'user', content: 'hello' }], temperature: 0.2 });
  assert.equal(r.message.content, 'Hi'); assert.equal(s.calls[0].url, 'http://192.168.1.20:11434/v1/chat/completions'); assert.equal(s.calls[0].method, 'POST');
  assert.equal(s.calls[0].body.model, 'llama3.1:8b'); assert.equal(s.calls[0].body.stream, false); assert.equal(s.calls[0].headers.authorization, `Bearer ${KEY}`);
  assert.ok(!JSON.stringify(s.calls[0].body).includes(KEY));
});

test('chat: no key means no authorization header; tools are only sent when given', async () => {
  const s = server(() => reply({ role: 'assistant', content: 'x' }));
  await chat(s.f, ep(), { messages: [] });
  assert.ok(!('authorization' in s.calls[0].headers)); assert.ok(!('tools' in s.calls[0].body));
  await chat(s.f, ep(), { messages: [], tools: [TEST_TOOL] });
  assert.equal(s.calls[1].body.tools.length, 1);
});

test('chat: tool calls are read, with object arguments turned into text', async () => {
  const s = server(() => reply({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'a', arguments: { x: 1 } } }, { function: { name: 5 } }] }));
  const r = await chat(s.f, ep(), { messages: [] });
  assert.equal(r.message.tool_calls?.length, 1); assert.equal(r.message.tool_calls?.[0].function.arguments, '{"x":1}'); assert.equal(r.message.tool_calls?.[0].id, 'call_0');
});

test('errors: each failure maps to one plain cause', async () => {
  const kind = async (h: (c: Call) => any, e = ep()) => { try { await chat(server(h).f, e, { messages: [] }); return 'none'; } catch (x) { assert.ok(x instanceof AssistantError); return x.kind; } };
  assert.equal(await kind(() => json(401, { error: { message: 'bad key' } })), 'key_rejected');
  assert.equal(await kind(() => json(403, 'no')), 'key_rejected');
  assert.equal(await kind(() => json(404, { error: { message: 'model "x" not found, try pulling it first' } })), 'model_not_found');
  assert.equal(await kind(() => json(404, { error: { code: 'model_not_found', message: 'The model `x` does not exist' } })), 'model_not_found');
  assert.equal(await kind(() => json(400, { error: { message: 'registry.ollama.ai/library/x does not support tools' } })), 'no_tools');
  assert.equal(await kind(() => json(404, { error: { message: 'No endpoints found that support tool use' } })), 'no_tools');
  assert.equal(await kind(() => json(404, '<html>Not Found</html>')), 'bad_address');
  assert.equal(await kind(() => json(500, 'boom')), 'server_error');
  assert.equal(await kind(() => json(200, 'not json')), 'bad_reply');
  assert.equal(await kind(() => json(200, { choices: [] })), 'bad_reply');
  assert.equal(await kind(() => { throw new TypeError('Network request failed'); }), 'unreachable');
  assert.equal(await kind(() => json(200, {}), ep({ model: '' })), 'not_set_up');
  assert.equal(await kind(() => json(200, {}), ep({ baseUrl: '' })), 'not_set_up');
  assert.equal(await kind(() => json(200, {}), ep({ baseUrl: 'http://u:p@h/v1' })), 'not_set_up');
});

test('a request that does not finish in time is a timeout, not an unreachable server', async () => {
  const f: FetchLike = (_u, init) => new Promise((_res, rej) => { init.signal?.addEventListener('abort', () => { const e: any = new Error('aborted'); e.name = 'AbortError'; rej(e); }); });
  await assert.rejects(() => chat(f, ep({ timeoutSec: 0.05 as any }), { messages: [] }), (e: any) => e.kind === 'timeout' && /seconds/.test(e.message));
});

test('the key never appears in an error message, even when the server echoes it back', async () => {
  const echo = server(() => json(401, { error: { message: `Incorrect API key provided: ${KEY}. Authorization: Bearer ${KEY}` } }));
  for (const run of [() => chat(echo.f, ep({ apiKey: KEY }), { messages: [] }), () => listModels(echo.f, ep({ apiKey: KEY })), () => testConnection(echo.f, ep({ apiKey: KEY }))]) {
    let text = ''; try { const r: any = await run(); text = JSON.stringify(r); } catch (e: any) { text = String(e.message); }
    assert.ok(!text.includes('SECRETSECRET'), text); assert.ok(!text.includes(KEY));
  }
  assert.equal(redactSecrets(`a ${KEY} b`, KEY), 'a [key] b'); assert.equal(redactSecrets('x sk-abcdefghijkl y'), 'x [key] y'); assert.equal(redactSecrets('Bearer abcdefghijklmnop'), 'Bearer [key]');
  assert.equal(redactSecrets('abc', ''), 'abc'); assert.equal(redactSecrets('abc', 'ab'), 'abc'); // a very short key is not blanked out of ordinary text
});

test('server messages are shortened', async () => {
  const s = server(() => json(500, { error: { message: 'x'.repeat(2000) } }));
  await assert.rejects(() => chat(s.f, ep(), { messages: [] }), (e: any) => e.message.length < 400);
});

test('listModels: reads OpenAI, Ollama and OpenRouter shapes, and context sizes when given', async () => {
  const a = await listModels(server(() => json(200, { data: [{ id: 'a', context_length: 32768 }, { id: 'b' }, {}] })).f, ep());
  assert.deepEqual(a.ids, ['a', 'b']); assert.deepEqual(a.contexts, { a: 32768 });
  const b = await listModels(server(() => json(200, { models: [{ name: 'llama3:latest' }] })).f, ep());
  assert.deepEqual(b.ids, ['llama3:latest']);
});

test('testConnection: all three checks pass, and what is sent is only the fixed test text', async () => {
  const s = server(good);
  const r = await testConnection(s.f, ep());
  assert.equal(r.ok, true); assert.deepEqual(r.steps.map(x => x.status), ['ok', 'ok', 'ok']);
  assert.equal(s.calls.length, 3);
  const sent = s.calls.filter(c => c.body).map(c => c.body.messages);
  assert.deepEqual(sent, [[{ role: 'user', content: TEST_PROMPT }], [{ role: 'user', content: TEST_TOOL_PROMPT }]]);
  assert.ok(![TEST_PROMPT, TEST_TOOL_PROMPT, JSON.stringify(TEST_TOOL)].join(' ').match(/@|customer|order|\$\d/i));
});

test('testConnection: reports the context size when the provider gives one, and tolerates Ollama :latest', async () => {
  const s = server(c => c.url.endsWith('/models') ? json(200, { data: [{ id: 'llama3.1:latest', context_length: 131072 }] }) : good(c));
  const r = await testConnection(s.f, ep({ model: 'llama3.1' }));
  assert.equal(r.ok, true); assert.equal(r.contextSize, 131072);
});

test('testConnection: stops at the first failure and marks the rest not checked', async () => {
  const down = await testConnection(server(() => { throw new TypeError('Network request failed'); }).f, ep());
  assert.equal(down.ok, false); assert.deepEqual(down.steps.map(x => x.status), ['failed', 'skipped', 'skipped']); assert.equal(down.steps[0].kind, 'unreachable');
  const badKey = await testConnection(server(() => json(401, {})).f, ep());
  assert.equal(badKey.steps[0].kind, 'key_rejected');
  const unset = await testConnection(server(good).f, ep({ model: '' }));
  assert.equal(unset.steps[0].kind, 'not_set_up'); assert.deepEqual(unset.steps.map(x => x.status), ['failed', 'skipped', 'skipped']);
});

test('testConnection: a wrong model name lists what the server has', async () => {
  const s = server(c => c.url.endsWith('/models') ? json(200, { data: [{ id: 'a' }, { id: 'b' }] }) : json(404, { error: { message: 'model "zzz" not found' } }));
  const r = await testConnection(s.f, ep({ model: 'zzz' }));
  assert.deepEqual(r.steps.map(x => x.status), ['ok', 'failed', 'skipped']); assert.equal(r.steps[1].kind, 'model_not_found'); assert.match(r.steps[1].detail, /a, b/);
});

test('testConnection: a model that answers in words instead of calling the tool is reported as no tool support', async () => {
  const s = server(c => c.url.endsWith('/models') ? json(200, { data: [{ id: 'llama3.1:8b' }] }) : reply({ role: 'assistant', content: 'OK' }));
  const r = await testConnection(s.f, ep());
  assert.equal(r.ok, false); assert.equal(r.steps[2].kind, 'no_tools'); assert.deepEqual(r.steps.map(x => x.status), ['ok', 'ok', 'failed']);
  const s2 = server(c => c.url.endsWith('/models') ? json(200, { data: [{ id: 'llama3.1:8b' }] }) : c.body?.tools ? json(400, { error: { message: 'llama3.1:8b does not support tools' } }) : reply({ role: 'assistant', content: 'OK' }));
  assert.equal((await testConnection(s2.f, ep())).steps[2].kind, 'no_tools');
});

test('testConnection: a server with no model list is still checked by asking the model', async () => {
  const s = server(c => c.url.endsWith('/models') ? json(404, 'Not Found') : good(c));
  const r = await testConnection(s.f, ep());
  assert.equal(r.ok, true); assert.match(r.steps[0].detail, /does not list/);
  const wrong = await testConnection(server(() => json(404, 'Not Found')).f, ep());
  assert.equal(wrong.ok, false); assert.equal(wrong.steps[1].kind, 'bad_address');
});
