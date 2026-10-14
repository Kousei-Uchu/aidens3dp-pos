// Location: tests/trainingsoftlocks.test.ts
// 0113: the soft locks found on a device. Windows never open in the same moment another closes, typing steps and Next that waits on a filled in form,
// the scan window's order and result box, and the courses' fixed steps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHEET_GAP_MS, noteSheetHide, resetSheetGate, sheetOpenDelay } from '../src/lib/sheetGate';
import { customer } from '../src/training/modules/customer';
import { priceAdjust } from '../src/training/modules/price-adjust';
import { scanning } from '../src/training/modules/scanning';
import { MODULES } from '../src/training';
import { validateModule, type Step, type TrainSnap } from '../src/lib/trainingModule';
import { isKnownSpot, isWindowSpot, scanCardSpot, SPOT } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf } from '../src/lib/trainingConds';
import { PRACTICE_SCANS } from '../src/lib/trainingScan';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const snap = (o: { noteDraft?: string; customerDraft?: TrainSnap['customerDraft']; sheets?: number } = {}): TrainSnap => snapOf({ tab: 'checkout', route: '', sheets: o.sheets ?? 0, noteDraft: o.noteDraft, customerDraft: o.customerDraft, cart: { lines: [] }, sales: 0, paying: false });
const guide = (m: { guide: Step[] }, id: string): Step => m.guide.find(s => s.id === id)!;
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

test('a window waits for the one before it to finish closing, and opens at once when nothing closed', () => {
  resetSheetGate(); assert.equal(sheetOpenDelay(1000), 0, 'nothing has closed');
  noteSheetHide(1000); assert.equal(sheetOpenDelay(1000), SHEET_GAP_MS); assert.equal(sheetOpenDelay(1000 + SHEET_GAP_MS - 1), 1); assert.equal(sheetOpenDelay(1000 + SHEET_GAP_MS), 0); assert.equal(sheetOpenDelay(5000), 0);
  assert.ok(SHEET_GAP_MS >= 300 && SHEET_GAP_MS <= 700, 'longer than the slide, short enough to feel instant'); resetSheetGate();
});

test('every Sheet goes through the gate, and its training layer follows the window that is really showing', () => {
  const kit = src('src/ui/kit.tsx'); assert.match(kit, /noteSheetHide/); assert.match(kit, /sheetOpenDelay/); assert.match(kit, /<Modal visible=\{shown\}/); assert.match(kit, /<TrainingLayer visible=\{shown\}[^>]*\/>/);
});

test('the overlay never blocks the whole screen when there is no target, and a typing step lets touches through and draws no cursor', () => {
  const o = src('src/ui/TrainingOverlay.tsx');
  assert.match(o, /const dim = guide && !!hole && !view\?\.scroll\?\.fully/); assert.doesNotMatch(o, /<View style=\{\[StyleSheet\.absoluteFill, \{ backgroundColor: sp\.dim \}\]\} \/>/, 'no full-screen block when there is no target');
  assert.match(o, /view\.next && !view\.typing/); assert.match(o, /!view\.next && !view\.typing \? <Pointer/);
  assert.match(o, /outputRange: \[0, 0\.8\]/, 'the cursor is a little see-through'); assert.match(o, /name="navigate" size=\{28\} color=\{color\}/, 'and the ring\'s orange');
  assert.equal((o.match(/pointerEvents="none"/g) ?? []).length >= 4, true, 'the cursor, ring, burst and cue never take a touch');
  const host = src('src/ui/TrainingHost.tsx'); assert.match(host, /typing: !!step\.typing && !off/); assert.match(host, /!step\.typing && step\.until\.kind !== 'next'/);
});

test('a fallback never points at a spot on the page under an open window', () => {
  const host = src('src/ui/TrainingHost.tsx'); assert.match(host, /const behind = \(t\?: string\) => !!t && snap\.sheets > 0 && !isWindowSpot\(t\)/); assert.match(host, /if \(behind\(r\.target\)\) continue/); assert.match(host, /!behind\(step\.recover\.target\)/);
});

test('the validator rejects a typing step with no target and Next-ready on a step that does not wait on Next', () => {
  const base = { ...customer, guide: [{ id: 'x', say: 'Type here.', typing: true, until: { kind: 'next' } } as Step, ...customer.guide.slice(1)] };
  assert.ok(validateModule(base, isKnownSpot).some(e => /types, so it needs a target/.test(e)));
  const bad = { ...customer, guide: [{ id: 'y', say: 'Go.', target: SPOT.customerForm, ready: () => true, until: { kind: 'press', id: SPOT.customerForm } } as Step, ...customer.guide.slice(1)] };
  assert.ok(validateModule(bad, isKnownSpot).some(e => /ready/.test(e)));
});

test('Customers: the note step needs Gift wrap typed, and the form step lets you type and needs a real name and a way to reach you', () => {
  const note = guide(customer, 'g-note'); assert.equal(note.typing, true);
  assert.ok(!isMet(note.until, snap({ noteDraft: '' }), noEvents())); assert.ok(!isMet(note.until, snap({ noteDraft: 'hello' }), noEvents())); assert.ok(isMet(note.until, snap({ noteDraft: 'Gift wrap' }), noEvents())); assert.ok(isMet(note.until, snap({ noteDraft: ' gift  wrap please' }), noEvents()));
  const form = guide(customer, 'g-form'); assert.equal(form.typing, true); assert.equal(form.until.kind, 'next'); assert.match(form.say, /Nothing is kept/); assert.match(form.say, /your own/);
  const d = (o: Partial<NonNullable<TrainSnap['customerDraft']>>) => snap({ customerDraft: { first: '', last: '', email: '', phone: '', ...o } });
  assert.ok(!form.ready!(snap()), 'form not open'); assert.ok(!form.ready!(d({})), 'empty'); assert.ok(!form.ready!(d({ first: 'Sam' })), 'a name alone cannot be reached'); assert.ok(!form.ready!(d({ email: 'sam@x.com' })), 'no name');
  assert.ok(!form.ready!(d({ first: 'Sam', email: 'sam@' })), 'not an email yet'); assert.ok(!form.ready!(d({ first: 'Sam', phone: '0412' })), 'too short for a mobile');
  assert.ok(form.ready!(d({ first: 'Sam', email: 'sam@x.com' }))); assert.ok(form.ready!(d({ first: 'Sam', phone: '0412 345 678' })));
  const sheets = src('src/screens/sheets.tsx'); assert.match(sheets, /setCustomerDraftProbe\(creating \? f : undefined\)/);
});

test('Price: the reason box can be typed in, and Remove adjustment falls back to reopening the window', () => {
  assert.equal(guide(priceAdjust, 'g-reason').typing, true); assert.equal(guide(priceAdjust, 'g-reason').until.kind, 'next');
  const rm = guide(priceAdjust, 'g-line-rm'); assert.ok((rm.recoverFrom ?? []).length >= 2); assert.equal(rm.recoverFrom![0].target.startsWith('line.adjust:'), true);
});

test('Scan: the cards the Guide asks for come first, the result box is always there, and the cards are compact', () => {
  assert.deepEqual(PRACTICE_SCANS.slice(0, 4).map(s => s.key), ['bee', 'dragon', 'torn', 'gift']);
  const used = scanning.guide.map(s => s.target).filter((t): t is string => !!t && t.startsWith('scan.card:')); for (const t of used) assert.ok(PRACTICE_SCANS.findIndex(s => scanCardSpot(s.key) === t) < 4, `${t} must be near the top`);
  const ui = src('src/ui/PracticeScan.tsx'); assert.match(ui, /Nothing scanned yet/); assert.doesNotMatch(ui, /\{last \? <Spot id=\{SPOT\.scanResult\}/); assert.match(ui, /height=\{30\}/);
  assert.ok(isWindowSpot(SPOT.scanResult));
});

test('Deals: the last Check 2 goal ends when Payment is open, and a delayed push to Payment cannot land after practice ended', () => {
  const cart = src('src/screens/CartPane.tsx'); assert.match(cart, /const practising = isTraining\(\); setTimeout\(\(\) => \{ if \(isTraining\(\) === practising\) nav\.push\('pay'\)/);
});

test('every course still validates', () => { for (const m of MODULES) assert.deepEqual(validateModule(m, isKnownSpot), [], m.id); });
