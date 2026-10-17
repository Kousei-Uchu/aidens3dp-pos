// Location: src/lib/assistantTools.ts
// The assistant's tools (patch 0157 adds the first two: search_docs and read_doc). Plain functions that read what they are
// given and return data. None is handed anything that can write, which is how the assistant stays read-only. Pure, so it
// runs in the node tests.
//
// Every tool gets a ToolContext: the pages it may read (already limited to what the signed in role may see), the role, and a
// size limit. Every result is cut to that limit, so a long page cannot flood a small model's context.
import { redactSecrets, type ChatMessage, type ToolCall, type ToolDef } from './assistantClient';
import { DEPTHS, depthsPresent, pageVisibleTo, selectDepth, type Depth, type Page } from './helpDocs';

export type ToolContext = {
  /** Every help page the app has. Tools filter these by role themselves, through `visiblePages`. */
  pages: Page[];
  role: string;
  /** Longest result, in characters. Set from the context size so a small model is not flooded. */
  maxChars: number;
};
export type AssistantTool = { def: ToolDef; run: (args: Record<string, unknown>, ctx: ToolContext) => unknown };

/** What one tool call did, kept for the audit log (the manager sees exactly what the model was given). */
export type ToolRecord = { name: string; args: string; ok: boolean; result: string; ms: number };
export type ToolSet = { tools: AssistantTool[]; ctx: ToolContext; /** Most tool calls in one question. */ limit: number; /** Filled in as calls are made, so a failed question still shows what ran. */ records: ToolRecord[] };

export const DEFAULT_TOOL_LIMIT = 15;
export const MAX_RESULT_CHARS = 6000;
export const MIN_RESULT_CHARS = 1500;
/** Longest result for a context size. A shorter context gets shorter results. */
export const resultCharsFor = (contextSize: number): number => Math.max(MIN_RESULT_CHARS, Math.min(MAX_RESULT_CHARS, Math.round(contextSize * 0.6)));

/** The pages this role may see. The one place pages are filtered, so a tool cannot forget to. */
export const visiblePages = (ctx: Pick<ToolContext, 'pages' | 'role'>): Page[] => ctx.pages.filter(p => pageVisibleTo(p, ctx.role));

// ---------- search_docs ----------
const STOP = new Set(('a an and are as at be but by can do does for from how i if in is it its me my of on or so that the then there this to was what when where which who why will with you your ' +
  'please tell show about need want help get use using way able make').split(' '));
const stem = (w: string): string => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
/** The words of a question that are worth searching for. Small models write whole sentences, so the little words are dropped. */
export function searchTerms(query: string): string[] {
  const out: string[] = [];
  for (const w of (query ?? '').toLowerCase().split(/[^a-z0-9$]+/).filter(Boolean)) { const t = stem(w); if (t.length > 1 && !STOP.has(w) && !STOP.has(t) && !out.includes(t)) out.push(t); }
  return out.slice(0, 8);
}

/** Plain text for a snippet: no headings, fences, link marks or bold. */
const plain = (md: string): string => md.replace(/^## (Basic|Deep|Advanced)\s*$/gm, ' ').replace(/```[\s\S]*?```/g, ' ').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, id: string, t?: string) => t ?? id).replace(/[#*_`>|]/g, ' ').replace(/\s+/g, ' ').trim();
function snippet(p: Page, terms: string[]): string {
  const text = plain(selectDepth(p, 'advanced'));
  const low = text.toLowerCase(); let at = -1;
  for (const t of terms) { const i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
  if (at < 0) return '';
  const from = Math.max(0, at - 60); const s = text.slice(from, from + 220).trim();
  return `${from > 0 ? '...' : ''}${s}${from + 220 < text.length ? '...' : ''}`;
}

export type DocHit = { id: string; title: string; summary: string; match: string; depths: Depth[] };
/**
 * Finds help pages for a question. A page needs at least half the search words, so a sentence still finds something, and
 * pages with more of the words (and the words in the title or tags) come first. Only pages this role may see are searched.
 */
export function searchDocPages(ctx: Pick<ToolContext, 'pages' | 'role'>, query: string, max = 5): DocHit[] {
  const terms = searchTerms(query); if (!terms.length) return [];
  const need = Math.max(1, Math.ceil(terms.length / 2));
  const scored: { p: Page; hit: number; score: number }[] = [];
  for (const p of visiblePages(ctx)) {
    const title = p.title.toLowerCase(), sum = p.summary.toLowerCase(), tags = p.tags.join(' ').toLowerCase(), body = selectDepth(p, 'advanced').toLowerCase();
    let hit = 0, score = 0;
    for (const t of terms) { const s = (title.includes(t) ? 10 : 0) + (tags.includes(t) ? 6 : 0) + (sum.includes(t) ? 4 : 0) + (body.includes(t) ? 1 : 0); if (s) { hit++; score += s; } }
    if (hit >= need) scored.push({ p, hit, score });
  }
  scored.sort((a, b) => b.hit - a.hit || b.score - a.score || a.p.title.localeCompare(b.p.title));
  return scored.slice(0, max).map(({ p }) => ({ id: p.id, title: p.title, summary: p.summary, match: snippet(p, terms), depths: depthsPresent(p) }));
}

const searchDocs: AssistantTool = {
  def: { type: 'function', function: {
    name: 'search_docs',
    description: 'Search the till\'s help pages. Use it first for any question about how the app works or where something is. Give a few key words, not a whole sentence. Returns up to 5 pages with a short summary and a matching line. Then use read_doc on the best one.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'A few key words, for example "refund card payment".' } }, required: ['query'], additionalProperties: false },
  } },
  run: (args, ctx) => {
    const query = typeof args.query === 'string' ? args.query : '';
    if (!query.trim()) return { error: 'Give a query: a few key words to search for.' };
    const results = searchDocPages(ctx, query);
    return results.length ? { results } : { results: [], note: 'No help page matched. Try different key words.' };
  },
};

// ---------- read_doc ----------
/** A page as text for the model: no diagrams, and links turned into "Title (page id)", or just the words when the page is not one this role may see. */
export function docText(p: Page, depth: Depth, ctx: Pick<ToolContext, 'pages' | 'role'>): string {
  const byId = new Map(visiblePages(ctx).map(x => [x.id, x] as const));
  return selectDepth(p, depth)
    .replace(/```mermaid[\s\S]*?```/g, '')
    .replace(/\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g, (_m, id: string, t?: string) => { const target = byId.get(id.trim()); return target ? `${t ?? target.title} (page ${target.id})` : (t ?? ''); })
    .replace(/\n{3,}/g, '\n\n').trim();
}

const NO_PAGE = { error: 'There is no help page with that id. Use search_docs to find the right id.' };
const readDoc: AssistantTool = {
  def: { type: 'function', function: {
    name: 'read_doc',
    description: 'Read one help page, by the id search_docs gave. "basic" is the plain steps and is usually enough. Use "deep" for the detail behind it and "advanced" for how it works inside and where the code is. Answer only from what this returns.',
    parameters: { type: 'object', properties: { id: { type: 'string', description: 'The page id, for example "pay/cash".' }, depth: { type: 'string', enum: [...DEPTHS], description: 'How much to read. Default basic.' } }, required: ['id'], additionalProperties: false },
  } },
  run: (args, ctx) => {
    const id = typeof args.id === 'string' ? args.id.trim() : '';
    const p = visiblePages(ctx).find(x => x.id === id);
    if (!p) return NO_PAGE; // a page this role may not see gets exactly the same answer as one that does not exist
    const depth: Depth = (DEPTHS as readonly string[]).includes(args.depth as string) ? (args.depth as Depth) : 'basic';
    const full = docText(p, depth, ctx);
    const room = Math.max(500, ctx.maxChars - 400); // the rest of the result (title, summary, links) takes some of the limit
    const text = full.length > room ? `${full.slice(0, room).trimEnd()}\n[cut here, the page is longer than this]` : full;
    const seeAlso = visiblePages(ctx).filter(x => p.related.includes(x.id)).map(x => ({ id: x.id, title: x.title }));
    return { id: p.id, title: p.title, summary: p.summary, depth, depths_available: depthsPresent(p), text, ...(full.length > room ? { cut: true } : {}), ...(seeAlso.length ? { see_also: seeAlso } : {}) };
  },
};

/** The tools in this build. Later patches add to the end. */
export const ASSISTANT_TOOLS: AssistantTool[] = [searchDocs, readDoc];
export const toolDefs = (tools: AssistantTool[]): ToolDef[] => tools.map(t => t.def);

// ---------- running a call ----------
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}[cut]` : s);
/** The result as the text the model reads. Cut to the limit, and always valid JSON. */
export function resultText(result: unknown, maxChars: number): string {
  let json = ''; try { json = JSON.stringify(result) ?? 'null'; } catch { json = JSON.stringify({ error: 'The tool could not return a result.' }); }
  return json.length > maxChars ? JSON.stringify({ cut: true, text: json.slice(0, Math.max(0, maxChars - 40)) }) : json;
}
/**
 * Runs one tool call the model asked for. It never throws: an unknown tool, arguments that are not JSON, or a tool that
 * fails all come back as an error result the model can read and recover from. The result is what goes back to the model.
 */
export function runToolCall(call: ToolCall, set: Pick<ToolSet, 'tools' | 'ctx'>, now: () => number = Date.now, apiKey?: string): { message: ChatMessage; record: ToolRecord } {
  const t0 = now(); let ok = true; let result: unknown;
  const tool = set.tools.find(t => t.def.function.name === call.function.name);
  if (!tool) { ok = false; result = { error: `There is no tool called "${call.function.name}".` }; }
  else {
    let args: Record<string, unknown> = {};
    try { const raw = call.function.arguments?.trim(); const parsed = raw ? JSON.parse(raw) : {}; if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed as Record<string, unknown>; else throw new Error('not an object'); }
    catch { ok = false; result = { error: 'The arguments were not a JSON object.' }; }
    if (ok) { try { result = tool.run(args, set.ctx); if (result && typeof result === 'object' && 'error' in (result as object)) ok = false; } catch { ok = false; result = { error: 'The tool failed. Try something else.' }; } }
  }
  const content = resultText(result, set.ctx.maxChars);
  return {
    message: { role: 'tool', tool_call_id: call.id, name: call.function.name, content },
    record: { name: call.function.name, args: clip(redactSecrets(call.function.arguments ?? '', apiKey), 500), ok, result: clip(redactSecrets(content, apiKey), 4000), ms: Math.max(0, now() - t0) },
  };
}

/** A new tool set for one question. */
export const makeToolSet = (o: { pages: Page[]; role: string; contextSize: number; limit?: number; tools?: AssistantTool[] }): ToolSet =>
  ({ tools: o.tools ?? ASSISTANT_TOOLS, ctx: { pages: o.pages, role: o.role, maxChars: resultCharsFor(o.contextSize) }, limit: Math.max(1, Math.round(o.limit ?? DEFAULT_TOOL_LIMIT)), records: [] });
