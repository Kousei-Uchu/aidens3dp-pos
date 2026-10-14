// Location: tests/trainingscanning.test.ts
// The "Scan items" course: registered, valid, the practice barcodes really resolve the way the course says (using the app's own scan code),
// and each Guide step and Check goal is finished by the right thing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanning } from '../src/training/modules/scanning';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { SPOT, gridItemSpot, isKnownSpot, isWindowSpot, scanCardSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf } from '../src/lib/trainingConds';
import { PRACTICE_SCANS, practiceScanOf } from '../src/lib/trainingScan';
import { FIXTURE_VARIANTS, applyInjections, buildSandbox } from '../src/lib/trainingSandbox';
import { resolveScan, scanProblem } from '../src/lib/lookup';
import { isBadgeCode } from '../src/lib/badge';
import { isGiftQr } from '../src/lib/giftCode';
import { findByBarcode } from '../src/lib/cartOps';

const line = (variantId: string, qty = 1) => ({ variantId, title: variantId, kind: 'item' as const, qty, discounted: false, adjusted: false });
const snap = (lines: any[], o: { sheets?: number; payOpen?: TrainSnap['payOpen'] } = {}): TrainSnap => snapOf({ tab: 'checkout', route: '', sheets: o.sheets ?? 0, payOpen: o.payOpen, cart: { lines: lines.map(l => ({ ...l, id: l.variantId })) }, sales: 0, paying: false });
const by = (list: any[], id: string) => list.find(x => x.id === id);
const real: any = { settings: { staff: [], requirePin: false, receipt: {} }, data: {}, grid: {}, gridVersion: 0, pos: {}, sync: {}, zeller: {}, staffId: undefined, unlocked: true };
const ev = (pressed: string[] = [], visible: string[] = []) => ({ pressed: new Set(pressed), visible: new Set(visible) });

test('the course is registered last, is valid, and may use the Payment page', () => {
  assert.equal(getModule('scanning'), scanning); assert.equal(MODULES[MODULES.length - 1], scanning); assert.deepEqual(validateModule(scanning, isKnownSpot), []); assert.ok(scanning.routes.includes('pay'));
});

test('the practice barcodes resolve exactly as the course says, using the real scan code', () => {
  const variants = FIXTURE_VARIANTS;
  for (const [key, name] of [['bee', 'Bumble Bee'], ['dragon', 'Red Dragon'], ['sticker', 'Sticker Pack']] as const) {
    const r = resolveScan(practiceScanOf(key)!.code, variants); assert.equal(r.kind, 'variant', key); assert.equal((r as any).variant.productTitle, name);
  }
  const torn = resolveScan(practiceScanOf('torn')!.code, variants); assert.equal(torn.kind, 'none'); assert.equal(scanProblem(torn, practiceScanOf('torn')!.code), 'No item for 9300000009421');
  const gift = resolveScan(practiceScanOf('gift')!.code, variants); assert.equal(gift.kind, 'gift'); assert.match(scanProblem(gift, practiceScanOf('gift')!.code)!, /Charge/);
});

test('no practice barcode is a cashier pass (a scanned pass would sign someone in on the real till), the torn label matches no item, and the cards are unique', () => {
  for (const s of PRACTICE_SCANS) assert.ok(!isBadgeCode(s.code), `${s.key} must not look like a cashier pass`);
  assert.ok(isGiftQr(practiceScanOf('gift')!.code)); assert.ok(!isGiftQr(practiceScanOf('torn')!.code));
  assert.equal(findByBarcode(FIXTURE_VARIANTS, practiceScanOf('torn')!.code), undefined);
  assert.equal(new Set(PRACTICE_SCANS.map(s => s.key)).size, PRACTICE_SCANS.length); assert.equal(new Set(PRACTICE_SCANS.map(s => s.code)).size, PRACTICE_SCANS.length);
  for (const s of PRACTICE_SCANS) assert.match(s.code, /^[\x20-\x7e]+$/, `${s.key} must be printable ASCII so Code 128 can draw it`);
});

test('the camera, the result message, Done and each card have spots, and the window ones are window spots', () => {
  for (const id of [SPOT.scanCamera, SPOT.scanDone, SPOT.scanResult, ...PRACTICE_SCANS.map(s => scanCardSpot(s.key))]) assert.ok(isKnownSpot(id), id);
  assert.equal(scanCardSpot('bee'), 'scan.card:bee');
  assert.ok(isWindowSpot(SPOT.scanDone) && isWindowSpot(SPOT.scanResult) && isWindowSpot(scanCardSpot('torn'))); assert.ok(!isWindowSpot(SPOT.scanCamera));
  for (const s of scanning.guide.filter(x => x.target && isWindowSpot(x.target))) assert.equal(s.at?.sheets, true, s.id);
});

test('Guide steps are finished by the right press or cart change, and each scan step allows what the scan really does', () => {
  const g = (id: string) => by(scanning.guide, id);
  assert.ok(isMet(g('g-camera').until, snap([]), ev([SPOT.scanCamera]))); assert.ok(!isMet(g('g-camera').until, snap([]), noEvents()));
  assert.ok(isMet(g('g-bee').until, snap([]), ev([scanCardSpot('bee')]))); assert.ok(!isMet(g('g-bee').until, snap([]), ev([scanCardSpot('dragon')])));
  assert.ok(isMet(g('g-torn').until, snap([]), ev([scanCardSpot('torn')]))); assert.ok(isMet(g('g-gift-scan').until, snap([]), ev([scanCardSpot('gift')]))); assert.ok(isMet(g('g-close').until, snap([]), ev([SPOT.scanDone])));
  assert.ok(isMet(g('g-torn-fix').until, snap([line('train-v-key')]), noEvents())); assert.ok(!isMet(g('g-torn-fix').until, snap([line('train-v-bee')]), noEvents()));
  // A scan of an item adds to the cart, so those steps must allow adding; a scan that matches nothing adds nothing, so those allow no change at all.
  for (const id of ['g-bee', 'g-dragon']) assert.deepEqual(g(id).allow, ['add'], id);
  for (const id of ['g-torn', 'g-gift-scan', 'g-close', 'g-camera']) assert.deepEqual(g(id).allow, [], id);
  for (const id of ['g-intro', 'g-window', 'g-added', 'g-notfound', 'g-gift', 'g-cart', 'g-bt', 'g-end']) assert.equal(g(id).until.kind, 'next', id);
  assert.equal(g('g-torn-fix').target, gridItemSpot('train-v-key'));
});

test('Check 1: the dragon by camera, a Bumble Bee and a Sticker Pack and Done, then a second Bumble Bee and Done', () => {
  const [dragon, two, twice] = scanning.check1;
  assert.ok(isMet(dragon.until, snap([]), ev([scanCardSpot('dragon')]))); assert.ok(!isMet(dragon.until, snap([line('train-v-dragon')]), noEvents()), 'adding it from the grid does not count as scanning');
  assert.ok(!isMet(two.until, snap([line('train-v-bee'), line('train-v-sticker')], { sheets: 1 }), noEvents()), 'the camera must be closed'); assert.ok(isMet(two.until, snap([line('train-v-bee'), line('train-v-sticker')]), noEvents()));
  assert.ok(!isMet(two.until, snap([line('train-v-bee')]), noEvents()));
  assert.ok(!isMet(twice.until, snap([line('train-v-bee', 1)]), noEvents())); assert.ok(isMet(twice.until, snap([line('train-v-bee', 2)]), noEvents())); assert.ok(!isMet(twice.until, snap([line('train-v-bee', 2)], { sheets: 1 }), noEvents()));
  for (const g of scanning.check1) assert.ok(g.allow.includes('add'), g.id);
});

test('Check 2: a torn Keyring label (the Keyring cannot be scanned at all) and a gift card that has to go to Charge; each says where it was taught', () => {
  const [torn, gift] = scanning.check2;
  assert.ok(!PRACTICE_SCANS.some(s => resolveScan(s.code, FIXTURE_VARIANTS).kind === 'variant' && (resolveScan(s.code, FIXTURE_VARIANTS) as any).variant.id === 'train-v-key'), 'no card may scan the Keyring, or the goal could be passed without the fix');
  const tornStart = applyInjections(buildSandbox(real), torn.inject); assert.deepEqual(tornStart.pos.cart.lines.map((l: any) => l.variantId), ['train-v-dragon']);
  assert.ok(!isMet(torn.until, snap([line('train-v-dragon')]), noEvents())); assert.ok(isMet(torn.until, snap([line('train-v-dragon'), line('train-v-key')]), noEvents()));
  const giftStart = applyInjections(buildSandbox(real), gift.inject); assert.deepEqual(giftStart.pos.cart.lines.map((l: any) => l.variantId), ['train-v-bee']);
  assert.ok(!isMet(gift.until, snap([line('train-v-bee')]), noEvents())); assert.ok(!isMet(gift.until, snap([line('train-v-bee')], { payOpen: 'cash' }), noEvents())); assert.ok(isMet(gift.until, snap([line('train-v-bee')], { payOpen: 'gift' }), noEvents()));
  assert.ok(gift.at?.routes?.includes('pay') && gift.at?.sheets === true);
  for (const g of scanning.check2) { assert.ok(g.taughtBy, g.id); assert.ok(scanning.show.steps.some(s => s.id === g.taughtBy) || scanning.guide.some(s => s.id === g.taughtBy), g.id); assert.ok(isKnownSpot(g.reveal!), g.id); }
});
