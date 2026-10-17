// Location: src/lib/autoPairs.ts
// The "Auto" button on a bundle deal's Recommended pairs (A8.3). Pairs up variations from the deal's item
// positions by STYLE and COLOUR, so a Gemstone Egg in "Crushed Blue" is paired with the Mini Gemstone Dragon in
// "Crushed Blue" and never with a Rose one.
//
// How a variation is read:
//   style  = the product title without type words ("Mini Gemstone Dragon" and "Gemstone Egg Dragon (Outer Egg)"
//            are both "gemstone")
//   colour = the variation title ("Blue/Red Dual Colour")
//
// Colours are compared as WHOLE sets of words, so "Green" can never pair with "Green Black Dual Colour".
// Matching runs in tiers, strictest first, so the best match for a variation always wins before a looser one:
//   1. same colour words, same order
//   2. same colour words, any order            (Blue/Red = Red Blue)
//   3. same colour words once filler is ignored ("Dual Colour", "(EOP)", ...)
// Every variation is used at most once per position, and whatever has no partner is simply left out.
import type { Variant } from './types';
import { slotVariants, unitSlots, type DealForm } from './bundleForm';

/** Words ignored in every tier (they never change which colour something is). */
const ALWAYS_DROP = new Set(['and', 'assorted']);
/** Extra words ignored only in the loosest tier. */
const LOOSE_DROP = new Set(['dual', 'colour', 'colours', 'color', 'colors']);
/** Product title words that describe the kind of item, not its style. */
const TITLE_STOPWORDS = new Set(['mini', 'egg', 'dragon', 'outer', 'the']);

export type AutoPairTier = 'exact' | 'any order' | 'ignoring filler';

export type AutoPairResult = {
  /** New pairs, one variant ID per position, in the deal's position order. */
  pairs: string[][];
  /** Variations that found no partner, one list per position. */
  leftovers: Variant[][];
  /** How many pairs each tier made. */
  byTier: Record<AutoPairTier, number>;
};

type Parsed = { id: string; variant: Variant; style: string; colour: string; order: number };

// ── reading names ────────────────────────────────────────────────────────────
/** Lowercase words only: punctuation, "/", "&" and "->" all just separate words. */
const wordsOf = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9\u00c0-\u024f]+/).filter(Boolean);
const stripBrackets = (text: string): string => text.replace(/\([^)]*\)/g, ' ');

function parse(v: Variant, order: number): Parsed {
  const style = wordsOf(stripBrackets(v.productTitle)).filter(w => !TITLE_STOPWORDS.has(w)).join(' ');
  const colour = v.variantTitle && v.variantTitle !== 'Default Title' ? v.variantTitle : '';
  return { id: v.id, variant: v, style, colour, order };
}

// ── one key function per tier ────────────────────────────────────────────────
const keyOf = (style: string, tokens: string[]): string | null => (tokens.length ? `${style}|${tokens.join(' ')}` : null);

const TIERS: { label: AutoPairTier; key: (p: Parsed) => string | null }[] = [
  { label: 'exact', key: p => keyOf(p.style, wordsOf(p.colour).filter(w => !ALWAYS_DROP.has(w))) },
  { label: 'any order', key: p => keyOf(p.style, wordsOf(p.colour).filter(w => !ALWAYS_DROP.has(w)).sort()) },
  { label: 'ignoring filler', key: p => keyOf(p.style, wordsOf(stripBrackets(p.colour)).filter(w => !ALWAYS_DROP.has(w) && !LOOSE_DROP.has(w)).sort()) },
];

/** Pair up whatever is still unmatched with one key function. Matched items are removed from the pools. */
function runTier(pools: Parsed[][], key: (p: Parsed) => string | null): Parsed[][] {
  const buckets = pools.map(pool => {
    const m = new Map<string, Parsed[]>();
    for (const p of pool) { const k = key(p); if (k == null) continue; const list = m.get(k); if (list) list.push(p); else m.set(k, [p]); }
    return m;
  });
  const groups: Parsed[][] = []; const used: Set<string>[] = pools.map(() => new Set());
  for (const [k, first] of buckets[0]) {
    if (!buckets.every(b => b.has(k))) continue;
    const count = Math.min(first.length, ...buckets.map(b => b.get(k)!.length));
    for (let i = 0; i < count; i++) groups.push(buckets.map((b, pos) => { const item = b.get(k)![i]; used[pos].add(item.id); return item; }));
  }
  pools.forEach((pool, pos) => { pools[pos] = pool.filter(p => !used[pos].has(p.id)); });
  return groups;
}

// ── the public entry point ───────────────────────────────────────────────────
/**
 * Work out recommended pairs for a deal. `existing` are pairs already on the deal: their variations are left alone,
 * so Auto adds to what was picked by hand instead of fighting it.
 */
export function autoRecommendedPairs(f: Pick<DealForm, 'slots' | 'recommended'>, variants: Record<string, Variant>): AutoPairResult {
  const positions = unitSlots(f);
  const empty: AutoPairResult = { pairs: [], leftovers: positions.map(() => []), byTier: { exact: 0, 'any order': 0, 'ignoring filler': 0 } };
  if (positions.length < 2) return empty;

  // One pool per position (positions that share a group each get their own copy of it).
  const pools = positions.map((slot, pos) => {
    const taken = new Set(f.recommended.map(r => r[pos]));
    return slotVariants(f.slots[slot], variants).filter(v => !taken.has(v.id)).map((v, i) => parse(v, i));
  });
  if (pools.some(p => !p.length)) return { ...empty, leftovers: pools.map(p => p.map(x => x.variant)) };

  // When the groups share no style at all (say Highland Cow with Tadling), style cannot tell them apart,
  // so only the colours are compared. Otherwise style must always match.
  const styleSets = pools.map(p => new Set(p.map(x => x.style)));
  if (![...styleSets[0]].some(s => styleSets.every(set => set.has(s)))) for (const pool of pools) for (const p of pool) p.style = '';

  const byTier: Record<AutoPairTier, number> = { exact: 0, 'any order': 0, 'ignoring filler': 0 };
  const groups: Parsed[][] = [];
  for (const tier of TIERS) { const made = runTier(pools, tier.key); byTier[tier.label] = made.length; groups.push(...made); }

  groups.sort((a, b) => a[0].order - b[0].order);
  return { pairs: groups.map(g => g.map(p => p.id)), leftovers: pools.map(p => p.map(x => x.variant)), byTier };
}
