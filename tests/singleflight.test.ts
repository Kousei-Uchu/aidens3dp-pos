// Location: tests/singleflight.test.ts
// A call made while a run is going joins it; a call after it has finished starts a new one; a failure does not block the next run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { singleFlight } from '../src/lib/singleFlight';
import { pollTiming } from '../src/lib/pollTiming';

test('calls made during a run share it, and a later call runs again', async () => {
  let runs = 0; let release!: () => void;
  const f = singleFlight(() => new Promise<number>(res => { runs += 1; release = () => res(runs); }));
  const a = f(); const b = f(); const c = f();
  assert.equal(runs, 1);
  release(); assert.deepEqual(await Promise.all([a, b, c]), [1, 1, 1]);
  const d = f(); assert.equal(runs, 2); release(); assert.equal(await d, 2);
});
test('a run that fails does not stop the next one', async () => {
  let n = 0; const f = singleFlight(async () => { n += 1; if (n === 1) throw new Error('x'); return n; });
  await assert.rejects(f(), /x/);
  assert.equal(await f(), 2);
});
test('the shared poll is single-flight and records how long its parts took', () => {
  const src = readFileSync('src/lib/sync.ts', 'utf8');
  assert.match(src, /const pollOnce = singleFlight\(pollSharedWork\);\nexport async function pollShared\(\): Promise<void> \{ return pollOnce\(\); \}/);
  assert.match(src, /lap\('events'\)[\s\S]*lap\('sales history'\)[\s\S]*setLastPoll\(pollTiming\(/);
});
test('the timing line names the total and only the slow parts, slowest first', () => {
  assert.equal(pollTiming(4200, [['events', 100], ['notices', 2500], ['logo', 900], ['x', 299]]), 'Poll took 4.2 s. Slowest: notices 2.5 s, logo 0.9 s');
  assert.equal(pollTiming(800, [['events', 100]]), 'Poll took 0.8 s');
  assert.equal(pollTiming(42000, [['secrets', 31000]]), 'Poll took 42 s. Slowest: secrets 31 s');
});
