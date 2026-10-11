import test from 'node:test';
import assert from 'node:assert/strict';
import { helpForError } from '../src/lib/helpContext';
import { loadPages } from '../scripts/build-help';

test('error help links target existing relevant pages', () => {
  const pages = new Set(loadPages().pages.map(page => page.id));
  const cases: [string, string | undefined, string][] = [
    ['Card declined', undefined, 'fix/card-declined'],
    ['Reader not ready', undefined, 'fix/reader'],
    ['Sync issue', 'No connection', 'fix/offline-sync'],
    ["Can't make change", undefined, 'fix/cant-make-change'],
    ['Stock update failed', undefined, 'fix/stock-mismatch'],
    ['Scanner barcode not found', undefined, 'fix/keyboard'],
    ['Wrong PIN', undefined, 'fix/locked-out'],
  ];
  for (const [title, message, expected] of cases) {
    const id = helpForError(title, message);
    assert.equal(id, expected);
    assert.ok(id && pages.has(id), `Help page ${id} exists`);
  }
});

test('non-troubleshooting messages do not get a misleading fix link', () => {
  assert.equal(helpForError('Name and price are required'), undefined);
});
