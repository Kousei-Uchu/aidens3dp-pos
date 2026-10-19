// Location: src/lib/assistantTools.ts
// The assistant's tools (patch 0157 added search_docs and read_doc, patch 0158 search_screens, patch 0159 show_link, patch 0162 show_guide, patch 0163 the shop data tools in assistantDataTools.ts, patch 0166 current_time, patch 0167 screen_context, patch 0169 app_status and read_settings, patch 0172 cash_drawer, cash_calculator and current_cart). Plain functions that read what they are
// given and return data. None is handed anything that can write, which is how the assistant stays read-only. Pure, so it
// runs in the node tests.
//
// Every tool gets a ToolContext: the pages it may read (already limited to what the signed in role may see), the role, and a
// size limit. Every result is cut to that limit, so a long page cannot flood a small model's context.
import { redactSecrets, type ChatMessage, type ToolCall, type ToolDef } from './assistantClient';
import { applyGate, type Category, type GatePolicy, type GateSpec } from './assistantGate';
import { DEPTHS, depthsPresent, pageVisibleTo, selectDepth, type Depth, type Page } from './helpDocs';
// A type only, so this file stays free of the app graph and runs in the node tests. The list itself is built in assistantScreens.ts.
import type { ScreenEntry, ScreenTarget } from './assistantScreens';
import type { Guide } from './assistantGuide';
import type { AssistantData } from './assistantData';
import { DATA_TOOLS } from './assistantDataTools';
import { currentTimeTool } from './assistantTime';
import { contextInfo, type RegisterContext } from './assistantContext';
import { appStatusTool, readSettingsTool, type TillState } from './assistantStatus';
import { CASH_TOOLS, type CashState } from './assistantCash';

export type ToolContext = {
  /** Every help page the app has. Tools filter these by role themselves, through `visiblePages`. */
  pages: Page[];
  /** Every screen the assistant may know about (patch 0158). Tools filter these by role themselves, through `visibleScreens`. Left out, there are none. */
  screens?: ScreenEntry[];
  role: string;
  /** Longest result, in characters. Set from the context size so a small model is not flooded. */
  maxChars: number;
  /** What the data gate lets through for this endpoint and these toggles (patch 0161). Left out, the strictest rules apply. */
  policy?: GatePolicy;
  /** What the data tools read (patch 0163): a snapshot of what is saved on this iPad, taken when the question was asked. Left out, the data tools say there is no shop data. */
  data?: AssistantData;
  /** The time the question was asked, in milliseconds (patch 0166). Left out, the clock is read when the tool runs. */
  now?: number;
  /** Where the person was and how the till is set up for them, when the question was asked (patch 0167). Left out, `screen_context` says it does not know. */
  where?: RegisterContext;
  /** How the till is set up and how it is doing, taken when the question was asked (patch 0169). Left out (practice data), `app_status` and `read_settings` say it could not be read. */
  till?: TillState;
  /** The cash drawer and the cart on the till, taken when the question was asked (patch 0172). Left out (practice data), the cash and cart tools say they could not read the till. */
  cash?: CashState;
};
export type AssistantTool = {
  /** Only these roles are offered the tool (patch 0169). Left out, every role is. A role not listed never sees it in the request, and calling it gets the answer an unknown tool gets (plan 3.4). */
  roles?: readonly string[];
  /** Which fields the tool can return and what category each is in (patch 0161). Every result goes through the data gate by this map. 'content' is for tools that only return help text and screen names. */
  gate: GateSpec;
  def: ToolDef; run: (args: Record<string, unknown>, ctx: ToolContext) => unknown;
  /** Tools that put a button under the reply say which one for a call that worked. The runtime collects them; the model never sees this. */
  link?: (args: Record<string, unknown>, ctx: ToolContext) => ChatLink | null;
};

/** A button under a reply (patch 0159). It only says what to open; what tapping does is worked out again when it is drawn, for the role signed in then. */
export type ChatLink = { kind: 'doc' | 'screen' | 'guide'; id: string; /** What the button says, for example "Open Reports". */ label: string };
/** What tapping a button does. The screen turns this into navigation. */
export type LinkAction = { to: 'help'; id: string } | { to: 'tab'; tab: string } | { to: 'route'; route: string } | { to: 'guide'; guide: Guide };
export const MAX_LINKS = 3;

/** What one tool call did, kept for the audit log (the manager sees exactly what the model was given). */
export type ToolRecord = { name: string; args: string; ok: boolean; result: string; ms: number; /** What the data gate hid from this result, by category (patch 0161). Counts only. */ withheld?: Record<string, number>; /** The categories of shop data the result still held. */ used?: Category[] };
export type ToolSet = { tools: AssistantTool[]; ctx: ToolContext; /** Most tool calls in one question. */ limit: number; /** Filled in as calls are made, so a failed question still shows what ran. */ records: ToolRecord[] };

export const DEFAULT_TOOL_LIMIT = 15;
export const MAX_RESULT_CHARS = 6000;
export const MIN_RESULT_CHARS = 1500;
/** Longest result for a context size. A shorter context gets shorter results. */
export const resultCharsFor = (contextSize: number): number => Math.max(MIN_RESULT_CHARS, Math.min(MAX_RESULT_CHARS, Math.round(contextSize * 0.6)));

/** The pages this role may see. The one place pages are filtered, so a tool cannot forget to. */
export const visiblePages = (ctx: Pick<ToolContext, 'pages' | 'role'>): Page[] => ctx.pages.filter(p => pageVisibleTo(p, ctx.role));

/** The screens this role can get to. The one place screens are filtered, so a tool cannot forget to. An unknown role sees none. */
export const visibleScreens = (ctx: Pick<ToolContext, 'screens' | 'role'>): ScreenEntry[] => (ctx.screens ?? []).filter(e => e.roles.includes(ctx.role));

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
  gate: 'content',
  def: { type: 'function', function: {
    name: 'search_docs',
    description: 'Search the till\'s help pages by a few key words. Use it first for any question about how the app works or where something is. Returns up to 5 pages; then use read_doc on the best one.',
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
  gate: 'content',
  def: { type: 'function', function: {
    name: 'read_doc',
    description: 'Read one help page by the id search_docs gave. "basic" (the default) is the plain steps, "deep" the detail and "advanced" how it works inside. Answer only from what this returns.',
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

// ---------- search_screens ----------
/** Words that tell nothing about which screen is meant ("open the Reports page"), so they are not searched for. */
const SCREEN_NOISE = new Set(('screen page window button tab up out open go find see look tap press click take show').split(' '));
export type ScreenHit = { id: string; name: string; kind: string; summary: string; how_to_open?: string[]; /** Present when show_guide can point the way (patch 0162). */ can_guide?: true };
/**
 * Finds screens for a question, by name or by what they are for. One matching word is enough, because a screen's name and
 * summary are short and a whole sentence rarely matches half of them; screens that match more of the words come first, and the
 * name counts most, then the other words people use for it, then its summary. Only screens this role can get to are searched.
 */
export function searchScreenList(ctx: Pick<ToolContext, 'screens' | 'role'>, query: string, max = 5): ScreenHit[] {
  const terms = searchTerms(query).filter(t => !SCREEN_NOISE.has(t)); if (!terms.length) return [];
  const scored: { e: ScreenEntry; hit: number; score: number }[] = [];
  for (const e of visibleScreens(ctx)) {
    const name = e.name.toLowerCase(), kws = e.keywords.join(' ').toLowerCase(), sum = e.summary.toLowerCase();
    let hit = 0, score = 0;
    for (const t of terms) { const w = (name.includes(t) ? 10 : 0) + (kws.includes(t) ? 6 : 0) + (sum.includes(t) ? 3 : 0); if (w) { hit++; score += w; } }
    if (hit > 0) scored.push({ e, hit, score });
  }
  scored.sort((a, b) => b.hit - a.hit || b.score - a.score || a.e.name.localeCompare(b.e.name));
  return scored.slice(0, max).map(({ e }) => { const how = e.steps[ctx.role]; return { id: e.id, name: e.name, kind: e.kind, summary: e.summary, ...(how && how.length ? { how_to_open: how } : {}), ...(e.walk?.[ctx.role]?.length ? { can_guide: true as const } : {}) }; });
}

const searchScreens: AssistantTool = {
  gate: 'content',
  def: { type: 'function', function: {
    name: 'search_screens',
    description: 'Search the till\'s screens (tabs, pages and windows) by name or purpose, using a few key words. Returns up to 5 screens with what each is for and the taps to open it from the Checkout tab. To explain how to use one, follow up with search_docs and read_doc.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'A few key words, for example "cash drawer" or "discount one item".' } }, required: ['query'], additionalProperties: false },
  } },
  run: (args, ctx) => {
    const query = typeof args.query === 'string' ? args.query : '';
    if (!query.trim()) return { error: 'Give a query: a few key words to search for.' };
    const results = searchScreenList(ctx, query);
    if (!results.length) return { results: [], note: 'No screen matched. Try different key words.' };
    return { results, ...(results.some(r => r.how_to_open) ? { note: 'how_to_open starts from the Checkout tab. The person may already be part of the way there.' } : {}) };
  },
};

// ---------- show_link ----------
/**
 * Works out a button for a help page or a screen, or null. The one place a button is checked, used when the model asks for one
 * and again when the button is drawn, so a button saved in the history is gone once the signed in role can no longer reach it.
 * A page or screen this role may not see gets null, exactly like one that does not exist.
 */
export function resolveLink(ctx: Pick<ToolContext, 'pages' | 'screens' | 'role'>, kind: unknown, id: unknown): { link: ChatLink; action: LinkAction } | null {
  const key = typeof id === 'string' ? id.trim() : ''; if (!key) return null;
  if (kind === 'doc') { const p = visiblePages(ctx).find(x => x.id === key); return p ? { link: { kind: 'doc', id: p.id, label: p.title }, action: { to: 'help', id: p.id } } : null; }
  if (kind === 'guide') {
    const e = visibleScreens(ctx).find(x => x.id === key); const walk = e?.walk?.[ctx.role]; if (!e || !walk || !walk.length) return null;
    return { link: { kind: 'guide', id: e.id, label: `Guide me to ${e.name}` }, action: { to: 'guide', guide: { screen: e.id, name: e.name, steps: walk.map(s => ({ ...s })), ...(e.target ? { target: e.target } : {}), ...(e.arrive?.length ? { arrive: [...e.arrive] } : {}) } } };
  }
  if (kind === 'screen') {
    const e = visibleScreens(ctx).find(x => x.id === key); const t: ScreenTarget | undefined = e?.target; if (!e || !t) return null;
    return { link: { kind: 'screen', id: e.id, label: `Open ${e.name}` }, action: 'tab' in t ? { to: 'tab', tab: t.tab } : { to: 'route', route: t.route } };
  }
  return null;
}
/** The buttons that still work for this role, with what each does. Anything else is dropped. */
export function liveLinks(ctx: Pick<ToolContext, 'pages' | 'screens' | 'role'>, links: ChatLink[] | undefined): { link: ChatLink; action: LinkAction }[] {
  const out: { link: ChatLink; action: LinkAction }[] = [];
  for (const l of links ?? []) { const r = resolveLink(ctx, l.kind, l.id); if (r && !out.some(o => o.link.kind === r.link.kind && o.link.id === r.link.id)) out.push(r); }
  return out;
}

const NO_LINK = { error: 'No button can be made for that. Use search_docs or search_screens to find the id, and give the taps in words instead.' };
const showLink: AssistantTool = {
  gate: 'content',
  def: { type: 'function', function: {
    name: 'show_link',
    description: 'Put a button under your reply that opens a help page or a screen, for the one or two best places, using an id from search_docs or search_screens. Windows cannot have a button: give their taps in words. Never write links or ids in your reply yourself.',
    parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['doc', 'screen'], description: '"doc" for a help page, "screen" for a screen.' }, id: { type: 'string', description: 'The id from search_docs or search_screens, for example "pay/cash" or "page_reports".' } }, required: ['kind', 'id'], additionalProperties: false },
  } },
  run: (args, ctx) => { const r = resolveLink(ctx, args.kind, args.id); return r ? { ok: true, note: `A button "${r.link.label}" will be shown under your reply. Do not write the link yourself.` } : NO_LINK; },
  link: (args, ctx) => resolveLink(ctx, args.kind, args.id)?.link ?? null,
};

// ---------- show_guide ----------
const NO_GUIDE = { error: 'No guide can be made for that screen. Only screens that search_screens marks can_guide have one. Give the taps in words instead.' };
const showGuide: AssistantTool = {
  gate: 'content',
  def: { type: 'function', function: {
    name: 'show_guide',
    description: 'Put a "Guide me" button under your reply. Tapping it points at each button to tap, from the Checkout tab, until the person reaches the screen. Use it when someone asks to be shown, guided or walked to a screen, after search_screens gave the id and marked it can_guide. Still give the taps in words. Never write the button or the id in your reply.',
    parameters: { type: 'object', properties: { screen: { type: 'string', description: 'The id from search_screens, for example "page_reports".' } }, required: ['screen'], additionalProperties: false },
  } },
  run: (args, ctx) => { const r = resolveLink(ctx, 'guide', args.screen); return r ? { ok: true, note: `A button "${r.link.label}" will be shown under your reply. It points at each tap from the Checkout tab. Do not write the button yourself.` } : NO_GUIDE; },
  link: (args, ctx) => resolveLink(ctx, 'guide', args.screen)?.link ?? null,
};

// ---------- screen_context ----------
/**
 * Every field is shop data (the category the plan gives the app's own state), and there is nothing personal in it: the role, the mode,
 * the tab names, the register's name. The screen is looked up in `visibleScreens`, the one place screens are filtered by role, so a
 * page this role cannot reach is answered exactly like a page the till cannot name.
 */
const screenContext: AssistantTool = {
  gate: { role: 'shop', display_mode: 'shop', tabs_shown: 'shop', guided_checkout: 'shop', practice_mode: 'shop', register: 'shop', selected_tab: 'shop', screen: { name: 'shop', kind: 'shop', summary: 'shop' } },
  def: { type: 'function', function: {
    name: 'screen_context',
    description: 'Where the person is on the till: the tab or page they were on when they opened the chat, their role, display mode and the tabs it shows, and whether practice mode is on. Use it when the answer depends on where they are, or when they say "this screen" or "here".',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  } },
  run: (_args, ctx) => contextInfo(ctx.role, ctx.where, ctx.where?.screen ? visibleScreens(ctx).find(e => e.id === ctx.where!.screen) : undefined),
};

/** The tools in this build. Later patches add to the end. */
export const ASSISTANT_TOOLS: AssistantTool[] = [searchDocs, readDoc, searchScreens, showLink, showGuide, currentTimeTool, screenContext, appStatusTool, readSettingsTool, ...CASH_TOOLS, ...DATA_TOOLS];
/** The tools this role is offered. The one place tools are filtered by role, so a request cannot forget to. */
export const toolsFor = (role: string, tools: AssistantTool[] = ASSISTANT_TOOLS): AssistantTool[] => tools.filter(t => !t.roles || t.roles.includes(role));
export const toolDefs = (tools: AssistantTool[]): ToolDef[] => tools.map(t => t.def);

// ---------- running a call ----------
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}[cut]` : s);
/** The result as the text the model reads. Cut to the limit, and always valid JSON. */
export function resultText(result: unknown, maxChars: number): string {
  let json = ''; try { json = JSON.stringify(result) ?? 'null'; } catch { json = JSON.stringify({ error: 'The tool could not return a result.' }); }
  if (json.length <= maxChars) return json;
  // The cut text is escaped again inside the wrapper (every quote gets a backslash), so keep trimming until the whole thing fits.
  let keep = Math.max(0, maxChars - 40); let out = JSON.stringify({ cut: true, text: json.slice(0, keep) });
  while (out.length > maxChars && keep > 0) { keep = Math.max(0, keep - Math.max(1, out.length - maxChars)); out = JSON.stringify({ cut: true, text: json.slice(0, keep) }); }
  return out;
}
/**
 * Runs one tool call the model asked for. It never throws: an unknown tool, arguments that are not JSON, or a tool that
 * fails all come back as an error result the model can read and recover from. The result is what goes back to the model.
 */
export function runToolCall(call: ToolCall, set: Pick<ToolSet, 'tools' | 'ctx'>, now: () => number = Date.now, apiKey?: string): { message: ChatMessage; record: ToolRecord; /** The button this call asked for, when it worked (patch 0159). */ link?: ChatLink } {
  const t0 = now(); let ok = true; let result: unknown; let link: ChatLink | undefined; let usedArgs: Record<string, unknown> = {}; let withheld: Record<string, number> | undefined; let used: Category[] | undefined;
  const tool = set.tools.find(t => t.def.function.name === call.function.name);
  if (!tool) { ok = false; result = { error: `There is no tool called "${call.function.name}".` }; }
  else {
    let args: Record<string, unknown> = {};
    try { const raw = call.function.arguments?.trim(); const parsed = raw ? JSON.parse(raw) : {}; if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed as Record<string, unknown>; else throw new Error('not an object'); }
    catch { ok = false; result = { error: 'The arguments were not a JSON object.' }; }
    usedArgs = args;
    if (ok) {
      try {
        result = tool.run(args, set.ctx); if (result && typeof result === 'object' && 'error' in (result as object)) ok = false;
        // Everything a tool returns goes through the data gate before it can reach the model (patch 0161). The gate never throws, so a fault in it ends the call with nothing returned.
        const g = applyGate(result, tool.gate, set.ctx.policy); result = g.value; if (Object.keys(g.withheld).length) withheld = g.withheld; if (g.used.length) used = g.used;
      } catch { ok = false; result = { error: 'The tool failed. Try something else.' }; }
    }
    if (ok && tool.link) { try { link = tool.link(usedArgs, set.ctx) ?? undefined; } catch { link = undefined; } }
  }
  const content = resultText(result, set.ctx.maxChars);
  return {
    ...(link ? { link } : {}),
    message: { role: 'tool', tool_call_id: call.id, name: call.function.name, content },
    record: { name: call.function.name, args: clip(redactSecrets(call.function.arguments ?? '', apiKey), 500), ok, result: clip(redactSecrets(content, apiKey), 4000), ms: Math.max(0, now() - t0), ...(withheld ? { withheld } : {}), ...(used ? { used } : {}) },
  };
}

/** A new tool set for one question. */
export const makeToolSet = (o: { pages: Page[]; screens?: ScreenEntry[]; role: string; contextSize: number; limit?: number; tools?: AssistantTool[]; policy?: GatePolicy; data?: AssistantData; now?: number; where?: RegisterContext; till?: TillState; cash?: CashState }): ToolSet =>
  ({ tools: toolsFor(o.role, o.tools), ctx: { pages: o.pages, ...(o.screens ? { screens: o.screens } : {}), role: o.role, maxChars: resultCharsFor(o.contextSize), ...(o.policy ? { policy: o.policy } : {}), ...(o.data ? { data: o.data } : {}), ...(o.now !== undefined ? { now: o.now } : {}), ...(o.where ? { where: o.where } : {}), ...(o.till ? { till: o.till } : {}), ...(o.cash ? { cash: o.cash } : {}) }, limit: Math.max(1, Math.round(o.limit ?? DEFAULT_TOOL_LIMIT)), records: [] });
