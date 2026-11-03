// Location: tests/lazybackend.test.ts
// CloudKit patch 7 and later: the direct handles on the two backends write only when the guard allows it, the same as the seam,
// and the export refuses to run in a practice run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lazyBackend } from '../src/lib/cloudkit/lazyBackend';
import { BackendBlockedError } from '../src/lib/syncBackend';
import { setDemoGuard } from '../src/lib/trainingGuard';

test('a write through a direct handle is stopped in a practice run, before any backend is loaded', async () => {
  setDemoGuard(true);
  try {
    for (const kind of ['cloudkit', 'metaobject'] as const) await assert.rejects(lazyBackend(kind).put('sale', 's1', { sale_uuid: 's1' }), (e: unknown) => e instanceof BackendBlockedError);
  } finally { setDemoGuard(false); }
});

test('the export checks the guard before it reads or writes anything', () => {
  const s = readFileSync('src/lib/cloudkit/exportAllIO.ts', 'utf8');
  assert.ok(s.indexOf("if (isTraining()) throw new TrainingBlockedError('backing up iCloud')") < s.indexOf('collectExport(n, meta'));
});

test('sync.ts reaches the backends only through the guarded handle', () => {
  const s = readFileSync('src/lib/sync.ts', 'utf8');
  assert.match(s, /from '\.\/cloudkit\/lazyBackend'/); assert.doesNotMatch(s, /\.put\(t, h, f\)/);
});
