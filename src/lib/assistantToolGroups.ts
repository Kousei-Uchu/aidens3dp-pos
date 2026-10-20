// Location: src/lib/assistantToolGroups.ts
// Patch 0185: send the model only the tools a question is likely to need.
// Every tool definition is sent with every request and shares the model's context with the chat (0174 measured it: at the
// default 8000 the definitions were about 3,700 tokens of what is left). Most questions are "where is" or "how do I", and
// need only the help tools, so the rest are left out until the question, or the chat so far, mentions what they are for.
//
// This never takes a tool away from anyone: it only chooses which of the tools the person's role already has are sent.
// A question the words miss can still reach them, because the model is given `more_tools` while any group is left out.
// `toolsFor` stays the one place tools are filtered by role, and nothing here can add a tool it did not return.
import type { AssistantTool } from './assistantTools';

export type ToolGroup = 'help' | 'shop' | 'cash' | 'status';
/** The help tools are always sent. The others are sent when the question asks for them. */
export const TOOL_GROUPS: Record<ToolGroup, readonly string[]> = {
  help: ['search_docs', 'read_doc', 'search_screens', 'show_link', 'show_guide', 'screen_context'],
  shop: ['current_time', 'find_products', 'stock_levels', 'sales_report', 'find_orders', 'list_deals', 'find_customers', 'gift_card_activity'],
  cash: ['cash_drawer', 'cash_calculator', 'current_cart'],
  status: ['app_status', 'read_settings'],
};
export const OPTIONAL_GROUPS = ['shop', 'cash', 'status'] as const;
export type OptionalGroup = typeof OPTIONAL_GROUPS[number];
export const MORE_TOOLS = 'more_tools';

/** What the model is told each group holds, so it can ask for the right one. */
const BLURB: Record<OptionalGroup, string> = {
  shop: 'shop figures: products and prices, stock, sales totals, orders, deals, customers, gift card activity, and the date',
  cash: 'cash: the cash drawer, change and split sums, and the cart on the till',
  status: 'the till itself: sync and app status, and its settings',
};

/**
 * Words that say a question is about a group. They lean towards including a group, because a group sent for nothing costs
 * some of the context and a group left out costs a lookup (the model can still ask for it with more_tools).
 */
const WORDS: Record<OptionalGroup, RegExp> = {
  shop: /\b(stock|inventory|sku|barcode|products?|variations?|prices?|cost|margin|profit|revenue|takings|turnover|sales?|sold|sell(?:ing)?|best.?sell\w*|top.?sell\w*|orders?|deals?|discounts?|bundles?|customers?|gift.?cards?|vouchers?|catalogue|oversold|low|totals?|how many|how much|do we have|have we got|we got|today|yesterday|tomorrow|this (?:week|month|year)|last (?:week|month|year)|so far)\b/i,
  cash: /\b(cash|drawer|float|coins?|notes?|change|cart|basket|tender|rounding|split|paying|pay|payment|charge|go(?:es)? through|won'?t (?:go|let|take)|can'?t (?:pay|take|charge))\b/i,
  status: /\b(not working|isn'?t working|doesn'?t work|stopped|broken|broke|error|fail\w*|sync\w*|updat\w*|version|offline|online|connect\w*|reader|terminal|settings?|setting up|turned (?:on|off)|switched (?:on|off)|enabled|disabled|is it on|is it off|pin|display mode|who can)\b/i,
};

/** The newest few things the person typed, so a follow up such as "and the large one?" keeps the tools the chat already needed. */
export const RECENT_ASKS = 3;
export const recentAsks = (history: ReadonlyArray<{ role: string; text: string }>, text: string, n = RECENT_ASKS): string[] =>
  [...history.filter(e => e.role === 'user').slice(-(n - 1)).map(e => e.text), text].slice(-n);

/** Which optional groups these messages ask for. The help group is not listed because it is always sent. */
export function wantedGroups(texts: readonly string[]): OptionalGroup[] {
  const all = texts.join('\n');
  return OPTIONAL_GROUPS.filter(g => WORDS[g].test(all));
}

const namesOf = (tools: readonly AssistantTool[]): Set<string> => new Set(tools.map(t => t.def.function.name));
/** The names in a group this role really has. A group a role has nothing in is not offered or asked for. */
export const groupNames = (g: ToolGroup, allowed: readonly AssistantTool[]): string[] => {
  const have = namesOf(allowed); return TOOL_GROUPS[g].filter(n => have.has(n));
};

export type Narrowed = {
  /** What is sent now. Always a subset of what `allowed` holds, plus more_tools when something was left out. */
  offered: Set<string>;
  /** The groups left out that this role could still ask for. */
  left: OptionalGroup[];
  /** more_tools, only when `left` is not empty. Add it to the tools of the set. */
  more?: AssistantTool;
};

/**
 * Chooses what to send for these messages out of `allowed` (the tools this role has). Tools the groups do not name (a tool
 * added later and not put in a group yet) are always sent, so a new tool cannot silently go missing.
 */
export function narrow(allowed: readonly AssistantTool[], texts: readonly string[]): Narrowed {
  const grouped = new Set<string>(Object.values(TOOL_GROUPS).flat());
  const want = new Set<OptionalGroup>(wantedGroups(texts));
  const offered = new Set<string>(allowed.map(t => t.def.function.name).filter(n => !grouped.has(n)));
  for (const n of groupNames('help', allowed)) offered.add(n);
  for (const g of want) for (const n of groupNames(g, allowed)) offered.add(n);
  const left = OPTIONAL_GROUPS.filter(g => !want.has(g) && groupNames(g, allowed).length > 0);
  if (!left.length) return { offered, left };
  offered.add(MORE_TOOLS);
  const more: AssistantTool = {
    gate: 'content',
    def: { type: 'function', function: {
      name: MORE_TOOLS,
      description: `Load more tools for this question. Groups: ${left.map(g => `${g} (${BLURB[g]})`).join('; ')}. Use it when the question needs one of these and you do not have the tool yet, then use the new tool.`,
      parameters: { type: 'object', properties: { group: { type: 'string', enum: [...left], description: 'The group to load.' } }, required: ['group'], additionalProperties: false },
    } },
    run: args => {
      const g = typeof args.group === 'string' ? args.group : '';
      if (!(left as readonly string[]).includes(g)) return { error: `There is no group called "${g}". The groups you can load are: ${left.join(', ')}.` };
      const names = groupNames(g as ToolGroup, allowed); const fresh = names.filter(n => !offered.has(n));
      for (const n of names) offered.add(n);
      return fresh.length ? { ok: true, loaded: fresh, note: 'These tools can be used from now on in this question.' } : { ok: true, loaded: [], note: 'That group was already loaded.' };
    },
  };
  return { offered, left, more };
}
