// Location: tests/alloyselection.test.ts
// 0250: the Alloy selection rules: what setup warns about, what an old install reads as, what the picker shows, what the policy removes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENTS, ELEMENT_IDS, REQUIRED_ELEMENTS } from '../src/alloykit/elements';
import { alloyFor, applyPolicy, diffSelection, featuresOf, legacySelection, supports, validateSelection } from '../src/alloykit/selection';
import { ALLOY_POLICY } from '../src/alloykit/policy';
import { AlloyNetworkError, AlloyUserError, isAlloyNetworkError, isAlloyUserError } from '../src/alloykit/errors';
import { ALLOYS } from '../src/alloys';
import type { Alloy, ElementId } from '../src/alloykit/types';

const stub = (id: string, elements: Partial<Record<ElementId, Record<string, unknown>>>): Alloy => ({
  id, name: id, blurb: '', contract: 1, settings: [], connect: async () => ({ ok: true }),
  elements: Object.fromEntries(Object.entries(elements).map(([k, api]) => [k, { api }])) as Alloy['elements'],
});
const fn = () => async () => undefined;
const shopify = stub('shopify', { catalogue: { listItems: fn(), listCollections: fn(), createItem: fn() }, orders: { record: fn() }, sharedState: { backend: fn() }, stock: { changesSince: fn(), adjust: fn() }, customers: { search: fn() }, discounts: { listAutomatic: fn(), listPresets: fn() }, giftCards: { lookup: fn(), create: fn(), debit: fn(), credit: fn() } });
const icloud = stub('icloud', { sharedState: { backend: fn() }, customers: { search: fn(), create: fn() } });
const zeller = stub('zeller', { cardTerminal: { terminal: fn() } });
const pure = stub('tillium', { catalogue: { listItems: fn(), listCollections: fn() }, orders: { record: fn() }, sharedState: { backend: fn() } });
const ALL = [shopify, icloud, zeller, pure];

test('the Elements table is complete and ordered, with Catalogue, Orders and Shared state required', () => {
  assert.equal(ELEMENTS.length, 9); assert.equal(new Set(ELEMENT_IDS).size, 9);
  assert.deepEqual(REQUIRED_ELEMENTS, ['catalogue', 'orders', 'sharedState']);
  for (const e of ELEMENTS) assert.ok(e.blurb.length > 0 && (e.required || e.whenOff.length > 0), e.id);
});

test('setup warns about each unchosen required Element, and optional ones may be left unset or Off', () => {
  const v = validateSelection({ cardTerminal: 'zeller', stock: 'off' }, ALL);
  assert.equal(v.ok, false);
  assert.deepEqual(v.problems.map(p => `${p.kind}:${p.element}`), ['unchosen:catalogue', 'unchosen:orders', 'unchosen:sharedState']);
  assert.ok(v.off.includes('stock') && v.off.includes('giftCards') && !v.off.includes('cardTerminal'));
  assert.equal(validateSelection({ catalogue: 'shopify', orders: 'shopify', sharedState: 'icloud' }, ALL).ok, true);
});

test('a required Element set to Off is a problem, and John\'s forgotten Shopify choices are caught', () => {
  assert.equal(validateSelection({ catalogue: 'off', orders: 'tillium', sharedState: 'tillium' }, ALL).problems[0].kind, 'unchosen');
  const john = validateSelection({ cardTerminal: 'zeller' }, ALL); assert.equal(john.ok, false);
});

test('an unknown Alloy or one that cannot do the Element is reported by name', () => {
  const v = validateSelection({ catalogue: 'wix', orders: 'zeller', sharedState: 'icloud', giftCards: 'icloud' }, ALL);
  assert.deepEqual(v.problems.map(p => `${p.kind}:${p.element}`).sort(), ['unknown_alloy:catalogue', 'unsupported:giftCards', 'unsupported:orders']);
});

test('an install that never chose reads as today: Shopify for the shop, Zeller for the reader, the shared backend it uses', () => {
  assert.deepEqual(legacySelection({ shopifyConnected: true, sharedBackend: 'metaobject', zellerPaired: true }),
    { catalogue: 'shopify', stock: 'shopify', discounts: 'shopify', customers: 'shopify', orders: 'shopify', giftCards: 'shopify', sharedState: 'shopify', cardTerminal: 'zeller' });
  assert.deepEqual(legacySelection({ shopifyConnected: true, sharedBackend: 'cloudkit', zellerPaired: false }).sharedState, 'icloud');
  assert.deepEqual(legacySelection({ shopifyConnected: false, sharedBackend: 'metaobject', zellerPaired: false }), { sharedState: 'shopify' });
});

test('the legacy selection is valid against the first public Alloys', () => {
  const v = validateSelection(legacySelection({ shopifyConnected: true, sharedBackend: 'cloudkit', zellerPaired: true }), ALL); assert.deepEqual(v.problems, []);
});

test('features come from the functions an Element really has', () => {
  assert.deepEqual(featuresOf(shopify, 'catalogue'), ['createItem', 'listCollections', 'listItems']);
  assert.deepEqual(featuresOf(pure, 'catalogue'), ['listCollections', 'listItems']);
  assert.deepEqual(featuresOf(zeller, 'catalogue'), []);
  assert.ok(supports(icloud, 'sharedState') && !supports(icloud, 'catalogue'));
  assert.equal(alloyFor(ALL, 'zeller'), zeller); assert.equal(alloyFor(ALL, undefined), undefined); assert.equal(alloyFor(ALL, 'nope'), undefined);
});

test('diffing selections lists the Elements that move, treating unset and Off as the same', () => {
  assert.deepEqual(diffSelection({ catalogue: 'shopify', stock: 'shopify' }, { catalogue: 'square', stock: 'shopify', giftCards: 'off' }), [{ element: 'catalogue', from: 'shopify', to: 'square' }]);
  assert.deepEqual(diffSelection({ stock: 'off' }, {}), []);
  assert.deepEqual(diffSelection({}, { customers: 'tillium' }), [{ element: 'customers', from: undefined, to: 'tillium' }]);
});

test('the policy can remove the iCloud Customers Element, and a saved choice of it then fails validation', () => {
  assert.equal(ALLOY_POLICY.icloudCustomers, 'allowed');
  assert.equal(applyPolicy(ALL, { icloudCustomers: 'allowed' }), ALL);
  const locked = applyPolicy(ALL, { icloudCustomers: 'disabled' });
  assert.ok(!supports(locked.find(a => a.id === 'icloud')!, 'customers')); assert.ok(supports(locked.find(a => a.id === 'icloud')!, 'sharedState'));
  assert.ok(supports(locked.find(a => a.id === 'shopify')!, 'customers')); assert.ok(supports(icloud, 'customers'), 'the original is not changed');
  const sel = { catalogue: 'shopify', orders: 'shopify', sharedState: 'icloud', customers: 'icloud' };
  assert.equal(validateSelection(sel, ALL).ok, true);
  assert.deepEqual(validateSelection(sel, locked).problems, [{ kind: 'unsupported', element: 'customers', alloy: 'icloud' }]);
});

test('the errors tell network trouble from a refusal', () => {
  const n = new AlloyNetworkError('offline'); const u = new AlloyUserError('bad key', 'token');
  assert.ok(isAlloyNetworkError(n) && !isAlloyUserError(n) && n.retryable); assert.ok(isAlloyUserError(u) && !u.retryable && u.field === 'token');
  assert.ok(n instanceof Error && u.name === 'AlloyUserError');
});

test('no Alloy is registered yet, so nothing in the app can reach one', () => { assert.deepEqual(ALLOYS, []); });
