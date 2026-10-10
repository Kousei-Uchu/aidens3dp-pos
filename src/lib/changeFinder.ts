// Location: src/lib/changeFinder.ts
// B1b: your Bounded Change Combination Finder (DEV_NOTES "MY RESPONSE"), kept as you wrote it, plus two things that do not change its answers:
//  - dead-branch pruning (stop when even all the remaining notes and coins could not reach the target), so the same results come back faster;
//  - an optional node cap, so a huge drawer cannot freeze the iPad. Hitting the cap is reported, never hidden.
// Amounts and denomination keys are integer cents.

export type ChangeResult = {
  values: Record<string, { qty_used: number; qty_remaining: number }>;
  total: number;
  exact: boolean;
};

/** `all`: when exact matches exist, still return the near ones too (the float report wants to weigh closeness against stock). */
export type FindOptions = { maxNodes?: number; all?: boolean };
export type FindOutcome = { results: ChangeResult[]; truncated: boolean };

/** Same behaviour as findCombinations, but says whether the search was cut short by `maxNodes` (results are then incomplete). */
export function findCombinationsLimited(available: Record<string, number>, target: number, delta = 500, opts: FindOptions = {}): FindOutcome {
  const entries = Object.entries(available)
    .map(([value, quantity]) => [Number(value), quantity] as const)
    .filter(([value, quantity]) => value > 0 && Number.isFinite(value) && Number.isInteger(quantity) && quantity >= 0)
    .sort(([a], [b]) => b - a);

  // most each suffix of the denomination list could still add, for pruning
  const reach = new Array(entries.length + 1).fill(0);
  for (let i = entries.length - 1; i >= 0; i--) reach[i] = reach[i + 1] + entries[i][0] * entries[i][1];

  const results: ChangeResult[] = [];
  const used = new Array(entries.length).fill(0);
  const maxNodes = opts.maxNodes ?? Infinity; let nodes = 0; let truncated = false;

  function buildResult(total: number, exact: boolean): ChangeResult {
    const values: ChangeResult['values'] = {};
    entries.forEach(([value, quantity], index) => { values[String(value)] = { qty_used: used[index], qty_remaining: quantity - used[index] }; });
    return { values, total, exact };
  }
  function search(index: number, total: number): void {
    if (truncated) return;
    if (++nodes > maxNodes) { truncated = true; return; }
    if (total + reach[index] < target - delta - 1e-9) return; // cannot get close enough from here
    if (index === entries.length) {
      const difference = Math.abs(total - target);
      if (difference <= 1e-9) results.push(buildResult(total, true));
      else if (difference <= delta + 1e-9) results.push(buildResult(total, false));
      return;
    }
    const [value, quantity] = entries[index];
    for (let qty = 0; qty <= quantity; qty++) {
      const nextTotal = total + value * qty;
      if (nextTotal > target + delta + 1e-9) break;
      used[index] = qty;
      search(index + 1, nextTotal);
      if (truncated) break;
    }
    used[index] = 0;
  }
  search(0, 0);
  const exactResults = results.filter(r => r.exact);
  return { results: exactResults.length > 0 && !opts.all ? exactResults : results, truncated };
}

/**
 * Every combination of the available denominations that adds up to `target`, without using more of any denomination than exists.
 * - If any exact matches exist, only those are returned.
 * - Otherwise every combination within ±delta cents (default 500) is returned, with exact: false.
 * - An empty array means nothing was found in range. Invalid entries are ignored.
 */
export function findCombinations(available: Record<string, number>, target: number, delta = 500): ChangeResult[] {
  return findCombinationsLimited(available, target, delta).results;
}
