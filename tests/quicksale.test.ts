// Location: tests/quicksale.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p: string) => fs.readFileSync(p, 'utf8');

test('a device with no drawer never marks a drawer change as pending', () => {
  const sync = read('src/lib/sync.ts'); const i = sync.indexOf('export function drawerChanged');
  assert.ok(i > 0 && sync.slice(i, i + 260).includes('if (!drawerOn()) return;'), 'the guard comes before the pending flag is set');
  assert.ok(sync.slice(i).indexOf('if (!drawerOn()) return;') < sync.slice(i).indexOf('drawerPending: true'));
});

test('Pay hides Card without the reader and flags cash taken without a drawer', () => {
  const pay = read('src/screens/Pay.tsx');
  assert.ok(pay.includes('{methods.card ? <PayOption'), 'the card button needs the Card reader group');
  assert.ok(pay.includes('if (methods.cashInDrawer) {') && pay.includes("kind: 'cash', title: 'Cash outside the drawer'"), 'cash is flagged, not posted');
  assert.ok(pay.includes('drawerChanged(); }'), 'the ledger and the push only happen with the drawer');
});

test('the quick sale and the hand-off are wired to the shell, Today and the routes', () => {
  const app = read('App.tsx');
  for (const needle of ['<QuickSale kind="sell" onExpand={() => setFullPos(true)} />', `case 'handoff': return <QuickSale kind="handoff"`, "salesPane(devMode, fullPos) === 'quick'", 'title="Quick sale"']) assert.ok(app.includes(needle), needle);
  assert.ok(read('src/screens/Today.tsx').includes("nav.push('handoff')"));
  const qs = read('src/screens/QuickSale.tsx');
  for (const needle of ['SaveCartSheet', 'ops.addVariant', 'ops.addCustom', `nav.push('pay')`, 'pushSaved']) assert.ok(qs.includes(needle), needle);
});

test('the quick sale and the full checkout share one cart, so expanding loses nothing', () => {
  const qs = read('src/screens/QuickSale.tsx');
  assert.ok(qs.includes('useApp(s => s.pos.cart)') && qs.includes('useApp(s => s.setCart)'), 'the same cart in the store');
  assert.equal(/useState<Cart/.test(qs), false, 'no cart of its own');
});
