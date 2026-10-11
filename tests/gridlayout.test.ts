import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID_PADDING, TILE_TARGET, tileColumnsForPane, tileSizeForPane, type TileSizePreference } from '../src/lib/gridLayout';

const PREFS: TileSizePreference[] = ['S', 'M', 'L'];

test('a row of tiles never adds up to more than the pane, and leaves less than a point per column unused', () => {
  for (let width = 300; width <= 1400; width += 7) {
    for (const pref of PREFS) {
      const columns = tileColumnsForPane(width, pref);
      const size = tileSizeForPane(width, pref);
      const used = size * columns;
      const room = width - GRID_PADDING;
      assert.ok(used <= room, `${pref} at ${width}: ${used} > ${room}`);
      assert.ok(room - used < columns * 0.25 + 0.001, `${pref} at ${width}: gap ${room - used}`);
    }
  }
});

test('with less than about half a tile left over the tiles grow, with more they shrink to fit another column', () => {
  const t = TILE_TARGET.M;
  // 4 columns plus 0.3 of a tile spare: stay at 4 columns, tiles bigger than the target
  assert.equal(tileColumnsForPane(4.3 * t + GRID_PADDING, 'M'), 4);
  assert.ok(tileSizeForPane(4.3 * t + GRID_PADDING, 'M') > t);
  // 4 columns plus 0.7 of a tile spare: add a fifth column, tiles a little smaller than the target
  assert.equal(tileColumnsForPane(4.7 * t + GRID_PADDING, 'M'), 5);
  assert.ok(tileSizeForPane(4.7 * t + GRID_PADDING, 'M') < t);
});

test('tiles stay within about a quarter of the chosen size once there is room for three or more columns', () => {
  for (let width = 400; width <= 1400; width += 5) {
    for (const pref of PREFS) {
      if (Math.floor((width - GRID_PADDING) / TILE_TARGET[pref]) < 3) continue;
      const ratio = tileSizeForPane(width, pref) / TILE_TARGET[pref];
      assert.ok(ratio > 0.84 && ratio < 1.17, `${pref} at ${width}: ratio ${ratio}`);
    }
  }
});

test('narrow panes still get two columns, and an empty measurement does not break', () => {
  assert.equal(tileColumnsForPane(150, 'L'), 2);
  assert.ok(tileSizeForPane(150, 'L') > 0);
  assert.equal(tileColumnsForPane(0, 'M'), 2);
  assert.equal(tileSizeForPane(0, 'M'), 0);
});
