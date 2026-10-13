// Location: tests/trainingreceipts.test.ts
// The "Finish a sale and send the receipt" course: registered, valid, and each step and goal is finished only by the right thing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { receipts } from '../src/training/modules/receipts';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { SPOT, isKnownSpot, isWindowSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf } from '../src/lib/trainingConds';
import { stepRules } from '../src/lib/trainingCourse';
import { applyInjections, buildSandbox, sandboxSettings, PRACTICE_RECEIPT_URL } from '../src/lib/trainingSandbox';

const line = (variantId: string, qty = 1) => ({ variantId, title: variantId, kind: 'item' as const, qty });
const snap = (lines: any[], o: { sheets?: number; sales?: number } = {}): TrainSnap => snapOf({ tab: 'checkout', route: '', sheets: o.sheets ?? 0, cart: { lines }, sales: o.sales ?? 0, paying: false });
const by = (list: any[], id: string) => list.find(x => x.id === id);
const real: any = { settings: { staff: [], requirePin: false, receipt: { serverUrl: 'https://real.example' } }, data: {}, grid: {}, gridVersion: 0, pos: {}, sync: {}, zeller: {}, staffId: undefined, unlocked: true };
const ev = (pressed: string[] = [], visible: string[] = []) => ({ pressed: new Set(pressed), visible: new Set(visible) });

test('the course is registered after the card course, is valid, and lets the terminal tap the card', () => {
  assert.equal(getModule('receipts'), receipts); assert.ok(MODULES.findIndex(m => m.id === 'receipts') > MODULES.findIndex(m => m.id === 'pay-card'), 'the card course comes first');
  assert.deepEqual(validateModule(receipts, isKnownSpot), []); assert.equal(receipts.card, 'auto'); assert.ok(receipts.routes.includes('pay'));
});

test('Guide steps are finished by the right press or window', () => {
  const g = (id: string) => by(receipts.guide, id).until;
  assert.ok(isMet(g('g-add'), snap([line('train-v-bee')]), noEvents())); assert.ok(!isMet(g('g-add'), snap([line('train-v-egg')]), noEvents()));
  assert.ok(isMet(g('g-wait'), snap([]), ev([], [SPOT.receiptNone]))); assert.ok(!isMet(g('g-wait'), snap([]), ev()));
  for (const [step, spot] of [['g-email', SPOT.receiptEmail], ['g-text', SPOT.receiptText], ['g-share', SPOT.receiptShare], ['g-qr', SPOT.receiptQr], ['g-unpublished', SPOT.receiptQrBack]] as const) {
    assert.ok(isMet(g(step), snap([]), ev([spot])), step); for (const other of [SPOT.receiptEmail, SPOT.receiptText, SPOT.receiptShare, SPOT.receiptQr, SPOT.receiptNone]) if (other !== spot) assert.ok(!isMet(g(step), snap([]), ev([other])), `${step} is not finished by ${other}`);
  }
  assert.ok(!isMet(g('g-none'), snap([], { sales: 1, sheets: 1 }), noEvents()), 'the window is still open'); assert.ok(!isMet(g('g-none'), snap([], { sheets: 0 }), noEvents()), 'no sale yet'); assert.ok(isMet(g('g-none'), snap([], { sales: 1 }), noEvents()));
});

test('every receipt button is a window spot, so each step that points at one allows windows, and a stray cash choice is watched for', () => {
  for (const id of [SPOT.receiptQr, SPOT.receiptEmail, SPOT.receiptText, SPOT.receiptShare, SPOT.receiptQrBack, SPOT.receiptNone]) assert.ok(isWindowSpot(id), id);
  for (const s of receipts.guide.filter(x => x.target && isWindowSpot(x.target))) assert.equal(stepRules(s).at?.sheets, true, s.id);
  assert.ok(by(receipts.guide, 'g-card').watch.some((w: any) => w.id === 'wrong-way-open'));
  const cash = by(receipts.check1, 'send-email').watch.find((w: any) => w.id === 'wrong-way-done'); assert.ok(cash.when({ ...snap([]), lastSaleKinds: ['cash'] })); assert.ok(!cash.when({ ...snap([]), lastSaleKinds: ['card'] })); assert.equal(cash.fix, 'restart');
});

test('Check 1 and 2: each goal starts unfinished, press goals are finished only by their own button, and the closing goals need the window shut', () => {
  for (const gl of [...receipts.check1, ...receipts.check2]) assert.ok(!isMet(gl.until, snap([]), noEvents()), `${gl.id} does not start finished`);
  assert.ok(isMet(by(receipts.check1, 'send-email').until, snap([]), ev([SPOT.receiptEmail]))); assert.ok(!isMet(by(receipts.check1, 'send-email').until, snap([]), ev([SPOT.receiptText])));
  assert.ok(isMet(by(receipts.check1, 'send-text').until, snap([]), ev([SPOT.receiptText]))); assert.ok(isMet(by(receipts.check2, 'share-it').until, snap([]), ev([SPOT.receiptShare])));
  assert.ok(isMet(by(receipts.check2, 'qr-not-live').until, snap([]), ev([SPOT.receiptText])), 'sent by text'); assert.ok(!isMet(by(receipts.check2, 'qr-not-live').until, snap([]), ev([SPOT.receiptQr])), 'the QR code alone is not enough');
  for (const id of ['send-none']) assert.ok(isMet(by(receipts.check1, id).until, snap([], { sales: 1 }), noEvents()));
  assert.ok(isMet(by(receipts.check2, 'close-it').until, snap([], { sales: 1 }), noEvents())); assert.ok(!isMet(by(receipts.check2, 'close-it').until, snap([], { sales: 1, sheets: 1 }), noEvents()));
});

test('Check 2 sets up a cart, says where the problem was taught, and every goal can use the Receipt window', () => {
  const g = by(receipts.check2, 'qr-not-live'); const start = applyInjections(buildSandbox(real), g.inject); assert.ok(start.pos.cart.lines.length > 0); assert.equal(g.taughtBy, 'unpublished'); assert.ok(receipts.show.steps.some(s => s.id === 'unpublished'));
  for (const gl of [...receipts.check1, ...receipts.check2]) { assert.equal(gl.at?.sheets, true, gl.id); assert.ok(gl.at?.routes?.includes('pay'), gl.id); assert.ok(isKnownSpot(gl.reveal!), gl.id); }
});

test('practice gives the Receipt window a made-up server (so it offers the QR code) and the real address is never used', () => {
  const sb = sandboxSettings(real.settings); assert.equal(sb.receipt.serverUrl, PRACTICE_RECEIPT_URL); assert.notEqual(sb.receipt.serverUrl, real.settings.receipt.serverUrl); assert.ok(!/real\.example/.test(sb.receipt.serverUrl));
});

test('in practice the Email, Text and Share buttons never open another app', () => {
  const src = fs.readFileSync('src/screens/Receipt.tsx', 'utf8');
  assert.ok(src.includes('isTraining()')); const open = src.slice(src.indexOf('const open = async'), src.indexOf('const showQr'));
  assert.ok(open.indexOf('if (practice)') >= 0 && open.indexOf('if (practice)') < open.indexOf('Linking.openURL'), 'the practice check comes before the app opens');
  const share = src.slice(src.indexOf('spot={SPOT.receiptShare}'), src.indexOf('<HelpButton'));
  assert.ok(share.indexOf('if (practice)') >= 0 && share.indexOf('if (practice)') < share.indexOf('Share.share'), 'the practice check comes before the share sheet');
});
