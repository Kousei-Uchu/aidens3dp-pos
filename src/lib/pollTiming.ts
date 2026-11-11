// Location: src/lib/pollTiming.ts
// One line of text for Diagnostics: how long the last shared poll took in all and which parts were slowest, so a slow iCloud can be pinned on a
// step instead of guessed at. Pure, so tests/polltiming.test.ts covers it.
const secs = (ms: number): string => `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s`;

export function pollTiming(totalMs: number, laps: ReadonlyArray<readonly [string, number]>, top = 4): string {
  const slow = [...laps].filter(l => l[1] >= 300).sort((a, b) => b[1] - a[1]).slice(0, top).map(l => `${l[0]} ${secs(l[1])}`);
  return `Poll took ${secs(totalMs)}${slow.length ? `. Slowest: ${slow.join(', ')}` : ''}`;
}

/** The line for the last poll that finished, kept here (not in the sync state, which other code replaces whole). */
let lastPoll = '';
export const setLastPoll = (line: string): void => { lastPoll = line; };
export const getLastPoll = (): string => lastPoll;
