import { test, describe } from 'node:test';
import assert from 'node:assert';
import { renderTemplate, templateTokens, TEMPLATE_HINTS } from '../src/lib/textTemplates';

describe('text templates', () => {
  test('fills basic item name and cart', () => {
    const out = renderTemplate('someone bought {{ item.name }}, put another out', { 'item.name': 'Display Widget · Blue' });
    assert.equal(out, 'someone bought Display Widget · Blue, put another out');
  });
  test('ignores case and spaces', () => {
    const out = renderTemplate('qty {{ qty }}, total {{ cart.total }}, sku {{ ITEM.SKU }}', { qty: 3, 'cart.total': '$6.00', 'item.sku': 'ABC123' });
    assert.equal(out, 'qty 3, total $6.00, sku ABC123');
  });
  test('leaves unknown tokens as written', () => {
    const out = renderTemplate('check {{ unknown }} here', {});
    assert.equal(out, 'check {{ unknown }} here');
  });
  test('tokenises correctly', () => {
    assert.deepEqual(templateTokens('{{item.name}} and {{ qty }}'), ['item.name', 'qty']);
  });
  test('has hints', () => {
    assert.ok(TEMPLATE_HINTS.length > 0);
    assert.ok(TEMPLATE_HINTS.some(h => h.name === 'item.name'));
  });
});