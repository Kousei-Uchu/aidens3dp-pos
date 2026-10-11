// Location: tests/training.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateModule, needsSandbox, STAGES, type Scene, type TrainingModule } from '../src/lib/trainingModule';
import { sceneAt, beatMs } from '../src/lib/trainingScene';
import { freshHints, nextHint, hintView, shouldNudge, NUDGE_AFTER_MS } from '../src/lib/trainingHints';
import { advanceGoal, advanceStep, canOpenStage, finishStage, seeIntro, showsIntro, skipStep, startRun, useHint as bumpHint } from '../src/lib/trainingRun';
import { completeModule, completedCount, emptyProgress, isComplete, nextSuggested, readProgress, recordStage, resetModule, staffKey, stagesDone } from '../src/lib/trainingProgress';
import { isMet, noEvents, snapOf } from '../src/lib/trainingConds';
import { blockers, grow, onScreen, placeBubble, same } from '../src/lib/trainingGeometry';
import { makeConfetti } from '../src/lib/confetti';
import { isKnownSpot, tileSpotId } from '../src/lib/trainingSpots';
import { welcome } from '../src/training/modules/welcome';

const scene: Scene = {
  actors: [{ id: 'a', icon: 'person', x: 10, y: 50 }, { id: 'b', icon: 'cart', x: 80, y: 50, hidden: true }],
  beats: [{ say: 'one', pulse: ['a'] }, { say: 'two', place: { a: { x: 50 } }, show: ['b'], tone: { b: 'good' } }, { say: 'three', hide: ['a'], place: { a: { y: 20 } } }],
};
test('a scene is replayed from the start to the beat asked for', () => {
  const v0 = sceneAt(scene, 0); assert.equal(v0.say, 'one'); assert.equal(v0.actors[1].hidden, true); assert.equal(v0.actors[0].pulse, true); assert.equal(v0.last, false);
  const v1 = sceneAt(scene, 1); assert.equal(v1.actors[0].x, 50); assert.equal(v1.actors[1].hidden, false); assert.equal(v1.actors[1].tone, 'good'); assert.equal(v1.actors[0].pulse, false);
  const v2 = sceneAt(scene, 2); assert.equal(v2.actors[0].hidden, true); assert.equal(v2.actors[0].x, 50); assert.equal(v2.actors[0].y, 20); assert.equal(v2.last, true);
  assert.equal(sceneAt(scene, 99).index, 2); assert.equal(sceneAt(scene, -3).index, 0);
  assert.equal(scene.actors[0].x, 10, 'the module data is never changed');
});
test('beat hold time follows the sentence length with a floor', () => { assert.equal(beatMs('Hi'), 2200); assert.ok(beatMs('word '.repeat(30)) > 8000); });

const ladder = ['pointer', 'clearer', 'specific'];
test('hints climb one rung per press, then reveal, and restart on a new goal', () => {
  let h = freshHints(); assert.deepEqual(hintView(h, 'g', ladder), { level: 0, reveal: false, left: 3 });
  h = nextHint(h, 'g', ladder); assert.equal(hintView(h, 'g', ladder).text, 'pointer');
  h = nextHint(h, 'g', ladder); assert.equal(hintView(h, 'g', ladder).text, 'clearer');
  h = nextHint(h, 'g', ladder); assert.equal(hintView(h, 'g', ladder).text, 'specific'); assert.equal(hintView(h, 'g', ladder).reveal, false);
  h = nextHint(h, 'g', ladder); assert.equal(hintView(h, 'g', ladder).reveal, true);
  h = nextHint(h, 'g', ladder); assert.equal(h.level, 4, 'stops at the reveal');
  assert.equal(hintView(h, 'other', ladder).level, 0); assert.equal(nextHint(h, 'other', ladder).level, 1);
});
test('the idle nudge only shows before any hint was used', () => { assert.equal(shouldNudge(NUDGE_AFTER_MS, 0), true); assert.equal(shouldNudge(NUDGE_AFTER_MS - 1, 0), false); assert.equal(shouldNudge(NUDGE_AFTER_MS * 3, 1), false); });

test('stages open in order, finished ones can be replayed, modules are never locked', () => {
  assert.equal(canOpenStage([], 'info'), true); assert.equal(canOpenStage([], 'show'), false); assert.equal(canOpenStage(['info'], 'show'), true); assert.equal(canOpenStage(['info'], 'guide'), false);
  assert.equal(canOpenStage(['info', 'show', 'guide', 'check1'], 'info'), true); assert.equal(canOpenStage(['info', 'show', 'guide', 'check1'], 'gratify'), false); assert.equal(canOpenStage(['info', 'show', 'guide', 'check1', 'check2'], 'gratify'), true);
});
test('run steps, goals, intro and counters', () => {
  let r = startRun('m', 'guide', 1000); assert.equal(showsIntro(r), true); r = seeIntro(r); assert.equal(showsIntro(r), false);
  assert.equal(showsIntro(startRun('m', 'info')), false, 'info has no practice-data card');
  assert.deepEqual(advanceStep(r, 2).done, false); assert.equal(advanceStep(advanceStep(r, 2).run, 2).done, true);
  assert.equal(advanceGoal(r, 1).done, true); assert.equal(skipStep(r).skips, 1); assert.equal(bumpHint(r).hints, 1);
  const f = finishStage({ ...r, stepIndex: 3, goalIndex: 2 }); assert.equal(f.stage, 'check1'); assert.equal(f.stepIndex, 0); assert.equal(finishStage({ ...r, stage: 'gratify' }).stage, 'gratify');
  assert.deepEqual(STAGES.filter(needsSandbox), ['guide', 'check1', 'check2']);
});

test('progress is per person, earned only by finishing both checks, and survives bad data', () => {
  let p = emptyProgress(); const who = staffKey('s1');
  p = recordStage(p, who, 'm', 'info'); p = completeModule(p, who, 'm', { hints: 1, secs: 9 }); assert.equal(isComplete(p, who, 'm'), false, 'no tick without the checks');
  p = recordStage(recordStage(p, who, 'm', 'check1'), who, 'm', 'check2'); p = completeModule(p, who, 'm', { hints: 2, secs: 60 }, new Date('2026-10-11T00:00:00Z'));
  assert.equal(isComplete(p, who, 'm'), true); assert.equal(isComplete(p, staffKey('s2'), 'm'), false); assert.equal(completedCount(p, who), 1); assert.ok(stagesDone(p, who, 'm').includes('gratify'));
  assert.equal(staffKey(undefined), '_shared'); assert.equal(staffKey(''), '_shared');
  assert.equal(completeModule(p, who, 'm', { hints: 9, secs: 9 }).by[who].m.done, '2026-10-11T00:00:00.000Z', 'the first finish date is kept');
  assert.deepEqual(readProgress({ by: { s: { m: { stages: ['info', 'nope', 'info'], hints: 'x', done: 5 } }, bad: 4 } }).by.s.m, { stages: ['info'], done: undefined, hints: 0, secs: 0, runs: 0 });
  for (const junk of [null, 3, 'x', { by: 3 }, {}]) assert.deepEqual(readProgress(junk), emptyProgress());
  assert.equal(resetModule(recordStage(emptyProgress(), who, 'z', 'info'), who, 'z').by[who].z.stages.length, 0);
  const mods = [{ id: 'a' }, { id: 'b', suggestedFirst: true }, { id: 'c' }]; assert.equal(nextSuggested(mods, emptyProgress(), who), 'b'); assert.equal(nextSuggested(mods, emptyProgress(), who, 'b'), 'a');
});

test('step conditions: press, visible, state, and next never completes by itself', () => {
  const snap = snapOf({ tab: 'checkout', route: '', cart: { lines: [{ qty: 2 }, { qty: 1 }], customer: undefined, tenders: [] }, sales: 0, paying: false });
  assert.equal(snap.lines, 2); assert.equal(snap.qty, 3); assert.equal(snap.hasCustomer, false);
  const ev = { pressed: new Set(['x']), visible: new Set(['y']) };
  assert.equal(isMet({ kind: 'press', id: 'x' }, snap, ev), true); assert.equal(isMet({ kind: 'press', id: 'z' }, snap, ev), false); assert.equal(isMet({ kind: 'visible', id: 'y' }, snap, ev), true);
  assert.equal(isMet({ kind: 'next' }, snap, ev), false); assert.equal(isMet({ kind: 'state', test: s => s.lines === 2 }, snap, noEvents()), true);
  assert.equal(isMet({ kind: 'state', test: () => { throw new Error('x'); } }, snap, noEvents()), false, 'a broken test is never "done"');
});

test('spotlight maths: blockers tile the screen minus the hole, bubble stays on screen', () => {
  const screen = { w: 800, h: 600 }; const hole = { x: 100, y: 200, w: 200, h: 100 };
  const area = (rs: { w: number; h: number }[]) => rs.reduce((a, r) => a + r.w * r.h, 0); assert.equal(area(blockers(hole, screen)), 800 * 600 - 200 * 100);
  const edge = { x: -50, y: 550, w: 200, h: 100 }; assert.equal(area(blockers(edge, screen)), 800 * 600 - 150 * 50, 'a hole that hangs off the screen is clipped');
  const b = placeBubble(hole, screen, { w: 300, h: 120 }); assert.equal(b.side, 'below'); assert.ok(b.y >= hole.y + hole.h);
  const low = placeBubble({ x: 100, y: 540, w: 100, h: 50 }, screen, { w: 300, h: 120 }); assert.equal(low.side, 'above'); assert.ok(low.y + 120 <= 590);
  const right = placeBubble({ x: 760, y: 100, w: 40, h: 40 }, screen, { w: 300, h: 120 }); assert.ok(right.x + 300 <= 800 - 12); assert.ok(right.arrowX >= 18 && right.arrowX <= 282);
  assert.equal(onScreen({ x: 0, y: 0, w: 0, h: 0 }, screen), false, 'a hidden screen measures 0 by 0'); assert.equal(onScreen({ x: 900, y: 0, w: 50, h: 50 }, screen), false); assert.equal(onScreen(hole, screen), true); assert.equal(onScreen(null, screen), false);
  assert.deepEqual(grow({ x: 10, y: 10, w: 10, h: 10 }, 4), { x: 6, y: 6, w: 18, h: 18 }); assert.equal(same({ x: 1, y: 1, w: 5, h: 5 }, { x: 1.4, y: 1, w: 5, h: 5 }), true); assert.equal(same(null, null), true);
});

test('confetti is repeatable and bounded', () => {
  assert.deepEqual(makeConfetti(40, 7, 6), makeConfetti(40, 7, 6)); assert.notDeepEqual(makeConfetti(40, 7, 6), makeConfetti(40, 8, 6));
  const ps = makeConfetti(500, 1, 6); assert.equal(ps.length, 200); for (const p of ps) { assert.ok(p.x >= 0 && p.x <= 1 && p.color >= 0 && p.color < 6 && p.dur >= 1800); }
  assert.equal(makeConfetti(-3, 1, 6).length, 0);
});

test('spot ids: static and per-record', () => {
  assert.equal(isKnownSpot('cart.charge'), true); assert.equal(isKnownSpot('grid.item:abc'), true); assert.equal(isKnownSpot('grid.item:'), false); assert.equal(isKnownSpot('nope'), false);
  assert.equal(tileSpotId({ type: 'item', variantId: 'v1', productId: 'p1' }), 'grid.item:v1'); assert.equal(tileSpotId({ type: 'item', productId: 'p1' }), 'grid.item:p1');
  assert.equal(tileSpotId({ type: 'category', collectionId: 'c' }), 'grid.cat:c'); assert.equal(tileSpotId({ type: 'action', action: 'lock_pos' }), 'grid.action:lock_pos'); assert.equal(tileSpotId({ type: 'group' }), undefined);
});

const ok = (m: TrainingModule) => validateModule(m, isKnownSpot);
const clone = (): TrainingModule => JSON.parse(JSON.stringify({ ...welcome, check1: welcome.check1.map(g => ({ ...g, until: { kind: 'press', id: 'grid.item:x' } })), check2: welcome.check2.map(g => ({ ...g, until: { kind: 'press', id: 'grid.item:x' } })), guide: welcome.guide.map(s => ({ ...s, until: s.until.kind === 'state' ? { kind: 'next' } : s.until })) }));
test('the welcome module passes the checker', () => assert.deepEqual(ok(welcome), []));
test('the checker refuses each kind of badly written module', () => {
  const m0 = clone(); assert.deepEqual(ok(m0), []);
  const bad = (f: (m: TrainingModule) => void) => { const m = clone(); f(m); return ok(m); };
  assert.ok(bad(m => { m.id = 'Bad Id'; }).length); assert.ok(bad(m => { m.info.beats = m.info.beats.slice(0, 2); }).some(e => e.includes('3 beats')));
  assert.ok(bad(m => { m.show.beats[0].pulse = ['ghost']; }).some(e => e.includes('ghost'))); assert.ok(bad(m => { m.guide = []; }).some(e => e.includes('needs steps')));
  assert.ok(bad(m => { m.guide[0] = { id: 'x', say: 'tap', until: { kind: 'press', id: 'cart.charge' } }; }).some(e => e.includes('points at nothing')));
  assert.ok(bad(m => { m.guide[1].target = 'nonsense.spot'; }).some(e => e.includes('unknown spot')));
  assert.ok(bad(m => { m.check1[0].ladder = ['only one']; }).some(e => e.includes('2 hints'))); assert.ok(bad(m => { m.check1[0].reveal = undefined; }).some(e => e.includes('highlight')));
  assert.ok(bad(m => { m.check1[0].until = { kind: 'next' }; }).some(e => e.includes('Next button')));
  assert.ok(bad(m => { m.check2[0].inject = undefined; }).some(e => e.includes('go wrong'))); assert.ok(bad(m => { m.check2[0].taughtBy = undefined; }).some(e => e.includes('where it was taught')));
  assert.ok(bad(m => { m.check2[0].taughtBy = 'nowhere'; }).some(e => e.includes('does not exist'))); assert.ok(bad(m => { m.recap = []; }).some(e => e.includes('recap')));
  assert.ok(bad(m => { m.tabs = ['more']; }).some(e => e.includes('checkout')));
});
