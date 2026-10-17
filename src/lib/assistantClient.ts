// Location: src/lib/assistantClient.ts
// A small client for any server that speaks the OpenAI-compatible chat API (Ollama, LM Studio, a hosted provider).
// Pure logic: the fetch function is passed in, so it runs in the node tests. Nothing here reads shop data.
// Replies are not streamed yet (non-streaming is the reliable path in React Native); the chat screen can add streaming later.
import { parseBaseUrl } from './assistantConfig';

export type AssistantErrorKind = 'not_set_up' | 'unreachable' | 'timeout' | 'key_rejected' | 'model_not_found' | 'no_tools' | 'bad_address' | 'server_error' | 'bad_reply';
export class AssistantError extends Error {
  kind: AssistantErrorKind; status?: number;
  constructor(kind: AssistantErrorKind, message: string, status?: number) { super(message); this.name = 'AssistantError'; this.kind = kind; this.status = status; }
}

export type Endpoint = { baseUrl: string; apiKey?: string; model: string; timeoutSec: number };
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;
export type ChatMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string; name?: string };
export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type ToolDef = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type ChatResult = { message: { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }; finishReason: string };

/** Takes the key (and anything shaped like one) out of text that may be shown on screen or logged. */
export function redactSecrets(text: string, apiKey?: string): string {
  let t = text ?? '';
  const k = (apiKey ?? '').trim();
  if (k.length >= 4) t = t.split(k).join('[key]');
  return t.replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, '[key]').replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [key]');
}

const short = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n)}...` : s);
function serverMessage(body: string): string {
  try { const j = JSON.parse(body); const m = j?.error?.message ?? (typeof j?.error === 'string' ? j.error : undefined) ?? j?.message; if (typeof m === 'string') return m; } catch { /* not JSON */ }
  return body.trim().startsWith('<') ? '' : body.trim();
}
const NO_TOOLS = /(does not support|doesn't support|no endpoints? found that support|not supported|unsupported).{0,40}tool|tool.{0,40}(not supported|unsupported|not available)/i;
const NO_MODEL = /model.{0,80}(not found|does not exist|unknown|not available)|(not found|does not exist|unknown).{0,40}model/i;

const REQUIRED = 'Set up the address and model first.';
function checked(ep: Endpoint): { base: string } {
  const p = parseBaseUrl(ep.baseUrl);
  if (!p.ok || !ep.model.trim()) throw new AssistantError('not_set_up', REQUIRED);
  return { base: p.base };
}

async function call(f: FetchLike, ep: Endpoint, base: string, path: string, body?: unknown): Promise<{ status: number; text: string }> {
  const ctl = new AbortController(); let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, Math.max(1, ep.timeoutSec) * 1000);
  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (ep.apiKey && ep.apiKey.trim()) headers.authorization = `Bearer ${ep.apiKey.trim()}`;
    const res = await f(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
    const text = await res.text();
    if (!res.ok) throw httpError(res.status, text, ep);
    return { status: res.status, text };
  } catch (e: any) {
    if (e instanceof AssistantError) throw e;
    if (timedOut || e?.name === 'AbortError') throw new AssistantError('timeout', `The model did not answer within ${ep.timeoutSec} seconds.`);
    throw new AssistantError('unreachable', 'Could not reach the server. Check the address, that the server is on, and that this iPad is on the same Wi-Fi.');
  } finally { clearTimeout(timer); }
}

function httpError(status: number, body: string, ep: Endpoint): AssistantError {
  const said = redactSecrets(short(serverMessage(body)), ep.apiKey); const tail = said ? ` The server said: ${said}` : '';
  if (status === 401 || status === 403) return new AssistantError('key_rejected', `The server did not accept the API key.${tail}`, status);
  if (NO_TOOLS.test(said)) return new AssistantError('no_tools', `This model does not support tool calling.${tail}`, status);
  if (NO_MODEL.test(said) || (status === 404 && /model/i.test(said))) return new AssistantError('model_not_found', `The server does not have a model called "${ep.model}".${tail}`, status);
  if (status === 404 || status === 405) return new AssistantError('bad_address', `The server answered, but not at this address. The address usually ends in /v1.${tail}`, status);
  return new AssistantError('server_error', `The server returned an error (${status}).${tail}`, status);
}

export type ModelList = { ids: string[]; contexts: Record<string, number> };
export async function listModels(f: FetchLike, ep: Endpoint): Promise<ModelList> {
  const { base } = checked(ep);
  const { text } = await call(f, ep, base, '/models');
  let j: any; try { j = JSON.parse(text); } catch { throw new AssistantError('bad_reply', 'The server answered, but not with a model list. Check that the address points at an OpenAI-compatible API.'); }
  const rows: any[] = Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : [];
  const ids: string[] = []; const contexts: Record<string, number> = {};
  for (const r of rows) {
    const id = typeof r === 'string' ? r : typeof r?.id === 'string' ? r.id : typeof r?.name === 'string' ? r.name : '';
    if (!id) continue; ids.push(id);
    const c = Number(r?.context_length ?? r?.context_window ?? r?.max_context_length);
    if (Number.isFinite(c) && c > 0) contexts[id] = Math.round(c);
  }
  return { ids, contexts };
}

export async function chat(f: FetchLike, ep: Endpoint, req: { messages: ChatMessage[]; tools?: ToolDef[]; temperature?: number }): Promise<ChatResult> {
  const { base } = checked(ep);
  const body: Record<string, unknown> = { model: ep.model.trim(), messages: req.messages, stream: false };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.tools && req.tools.length) { body.tools = req.tools; body.tool_choice = 'auto'; }
  const { text } = await call(f, ep, base, '/chat/completions', body);
  let j: any; try { j = JSON.parse(text); } catch { throw new AssistantError('bad_reply', 'The server answered, but not in the format this app expects.'); }
  const choice = j?.choices?.[0]; const m = choice?.message;
  if (!m || typeof m !== 'object') throw new AssistantError('bad_reply', 'The server answered, but the reply had no message in it.');
  const calls: ToolCall[] | undefined = Array.isArray(m.tool_calls) && m.tool_calls.length
    ? m.tool_calls.filter((c: any) => c?.function && typeof c.function.name === 'string').map((c: any, i: number) => ({ id: String(c.id ?? `call_${i}`), type: 'function' as const, function: { name: c.function.name, arguments: typeof c.function.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function.arguments ?? {}) } }))
    : undefined;
  return { message: { role: 'assistant', content: typeof m.content === 'string' ? m.content : null, ...(calls && calls.length ? { tool_calls: calls } : {}) }, finishReason: String(choice?.finish_reason ?? '') };
}

// ---------- Test connection ----------
/** Fixed test text. It never holds shop data, which is the only reason Test connection is safe to send before the data rules exist. */
export const TEST_PROMPT = 'Reply with the single word OK.';
export const TEST_TOOL_PROMPT = 'Call the tool named test_ping now. Do not answer in words.';
export const TEST_TOOL: ToolDef = { type: 'function', function: { name: 'test_ping', description: 'A test tool. Call it once with no arguments.', parameters: { type: 'object', properties: {}, additionalProperties: false } } };

export type TestStep = { id: 'endpoint' | 'model' | 'tools'; label: string; status: 'ok' | 'failed' | 'skipped'; detail: string; kind?: AssistantErrorKind };
export type TestReport = { ok: boolean; steps: TestStep[]; contextSize?: number };
const LABEL = { endpoint: 'The server answers', model: 'The model replies', tools: 'The model can call a tool' } as const;

/** Runs the three checks in order and stops at the first failure. */
export async function testConnection(f: FetchLike, ep: Endpoint): Promise<TestReport> {
  const steps: TestStep[] = []; let contextSize: number | undefined;
  const fail = (id: TestStep['id'], e: unknown): TestReport => {
    const err = e instanceof AssistantError ? e : new AssistantError('server_error', redactSecrets(String((e as Error)?.message ?? e), ep.apiKey));
    steps.push({ id, label: LABEL[id], status: 'failed', detail: err.message, kind: err.kind });
    for (const next of (['endpoint', 'model', 'tools'] as const).filter(x => !steps.some(s => s.id === x))) steps.push({ id: next, label: LABEL[next], status: 'skipped', detail: 'Not checked.' });
    return { ok: false, steps, contextSize };
  };
  try { checked(ep); } catch (e) { return fail('endpoint', e); }

  let listed: ModelList | null = null;
  try { listed = await listModels(f, ep); steps.push({ id: 'endpoint', label: LABEL.endpoint, status: 'ok', detail: `${listed.ids.length} model${listed.ids.length === 1 ? '' : 's'} listed.` }); }
  catch (e) {
    if (e instanceof AssistantError && e.kind === 'bad_address') steps.push({ id: 'endpoint', label: LABEL.endpoint, status: 'ok', detail: 'This server does not list its models, so the next step checks the model by asking it.' });
    else return fail('endpoint', e);
  }
  if (listed) { const m = ep.model.trim(); const hit = listed.ids.find(id => id === m || id === `${m}:latest`); if (hit && listed.contexts[hit]) contextSize = listed.contexts[hit]; }

  try {
    await chat(f, ep, { messages: [{ role: 'user', content: TEST_PROMPT }] });
    steps.push({ id: 'model', label: LABEL.model, status: 'ok', detail: `"${ep.model.trim()}" replied.` });
  } catch (e) {
    if (e instanceof AssistantError && e.kind === 'model_not_found' && listed && listed.ids.length) {
      return fail('model', new AssistantError('model_not_found', `${e.message} Models on this server: ${listed.ids.slice(0, 5).join(', ')}${listed.ids.length > 5 ? ', and more' : ''}.`, e.status));
    }
    return fail('model', e);
  }

  try {
    const r = await chat(f, ep, { messages: [{ role: 'user', content: TEST_TOOL_PROMPT }], tools: [TEST_TOOL] });
    if (r.message.tool_calls?.some(c => c.function.name === TEST_TOOL.function.name)) steps.push({ id: 'tools', label: LABEL.tools, status: 'ok', detail: 'The model called the test tool.' });
    else return fail('tools', new AssistantError('no_tools', 'The model answered in words instead of calling the test tool. It may not support tool calling, or it may be too small to use tools reliably.'));
  } catch (e) { return fail('tools', e); }
  return { ok: true, steps, contextSize };
}
