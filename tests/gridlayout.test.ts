import test from 'node:test';
import assert from 'node:assert/strict';
import { tileSizeForPane, type TileSizePreference } from '../src/lib/gridLayout';

test('tiles fill the available pane at the closest column count for each size preference', () => {
  const prefs: TileSizePreference[] = ['S', 'M', 'L'];
  for (const width of [320, 390, 612, 900]) {
    for (const pref of prefs) {
      const target = pref === 'S' ? 96 : pref === 'L' ? 160 : 124;
      const columns = Math.max(2, Math.floor((width - 16) / target));
      const size = tileSizeForPane(width, pref);
      assert.ok(Math.abs(size * columns + 16 - width) < 0.001);
      assert.ok(size >= target || columns === 2);
    }
  }
});
