import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardLast4, maskedLast4 } from '../src/lib/cards';

test('cardLast4 takes the last four digits of a masked PAN', () => {
  assert.equal(cardLast4('XXXXXXXXXXXX0000'), '0000');
  assert.equal(cardLast4('411111******1111'), '1111');
  assert.equal(cardLast4('1234'), '1234');
  assert.equal(cardLast4(undefined), '');
  assert.equal(cardLast4(''), '');
});

test('maskedLast4 shows the last four, or nothing when there is none', () => {
  assert.equal(maskedLast4('XXXXXXXXXXXX0000'), '\u2022\u2022\u2022\u2022 0000');
  assert.equal(maskedLast4(undefined, '7788'), '\u2022\u2022\u2022\u2022 7788');
  assert.equal(maskedLast4(undefined), '');
});
