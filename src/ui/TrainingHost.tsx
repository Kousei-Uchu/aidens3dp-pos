// Location: src/ui/TrainingHost.tsx
// Wraps the whole app. Outside training it renders its children and nothing else.
// During Guide and Check it keeps the person inside the module's screens, watches the real app state about every 300 ms
// (advancing at most one step per tick), measures the spot to point at, and hands the overlay and dock what to draw.
import React, { useEffect, useRef } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useNav, type Tab } from './nav';
import { useApp } from '../state/store';
import { useTraining, realStaffId, type DockView } from '../state/trainingSession';
import { isLockScreen } from '../lib/posLock';
import { getModule } from '../training';
import { measureSpot, onSpotPressed, mountedSpotIds } from './Spot';
import { confirm } from './kit';
import TrainingOverlay from './TrainingOverlay';
import TrainingDock from './TrainingDock';
import PracticeTerminal from './PracticeTerminal';
import { Enter } from './Motion';
import { Veil, dipThrough } from './Veil';
import { trainingActions } from './trainingActions';
import { SPOT } from '../lib/trainingSpots';
import { ROOT_LAYER } from '../lib/trainingLayers';
import { onScreen, scrollNeed, scrollSay, type Rect, type ScrollNeed } from '../lib/trainingGeometry';
import { isMet, snapOf, type Events } from '../lib/trainingConds';
import { getPriceDraft, getCashProbe, getCustomerQuery, getNoteDraft, getOpenLine, getPayOpen, getTyped, getWhere } from '../lib/trainingProbe';
import { getLastPracticeRefund } from '../lib/trainingOrders';
import { hintView, shouldNudge } from '../lib/trainingHints';
import { diagnose, freshStray, stepRules, trackStray, type Deviation, type StrayTracker } from '../lib/trainingCourse';
import { guidanceCandidates, registerRuntimeSpots, syncRuntimeFromSnap } from '../lib/appGraph';
import { gateFor, type Gesture } from '../lib/pointerGesture';
import { setGate } from '../lib/trainingGate';
import { layerDepth } from '../lib/trainingLayers';
import { moduleTitle, showHowAtOnce } from '../lib/trainingRemedies';
import { isComplete, staffKey } from '../lib/trainingProgress';
import { advanceGoal, advanceStep } from '../lib/trainingRun';
import { idleMs } from '../lib/idle';
import type { Goal, Step, TrainSnap, TrainingModule } from '../lib/trainingModule';

const mutable = (): { pressed: Set<string>; visible: Set<string> } => ({ pressed: new Set(), visible: new Set() });

/** What the customer handed over and the change given on the last finished sale's cash payment, or undefined if it had none. */
const lastCash = (sales: { tenders: { kind: string; tenderedCents?: number; changeCents?: number }[] }[]): { tendered: number; change: number } | undefined => {
  const t = sales.length ? [...sales[0].tenders].reverse().find(x => x.kind === 'cash') : undefined;
  return t ? { tendered: t.tenderedCents ?? 0, change: t.changeCents ?? 0 } : undefined;
};
export default function TrainingHost({ children }: { children: React.ReactNode }) {
  const nav = useNav(); const win = useWindowDimensions(); const sandbox = useTraining(s => s.sandbox);
  const navRef = useRef(nav); navRef.current = nav; const winRef = useRef(win); winRef.current = win;
  const ev = useRef(mutable()); const key = useRef(''); const busy = useRef(false); const nextTap = useRef(false); const sig = useRef(''); const leaving = useRef(false); const kickRef = useRef<(() => void) | null>(null);
  const base = useRef<TrainSnap | null>(null); const stray = useRef<StrayTracker>(freshStray());

  useEffect(() => onSpotPressed(id => { ev.current.pressed.add(id); kickRef.current?.(); }), []);
  useEffect(() => { kickRef.current?.(); }, [nav.tab, nav.stack.length]);

  useEffect(() => {
    const current = (): { mod: TrainingModule; step?: Step; goal?: Goal; n: number; i: number } | null => {
      const st = useTraining.getState(); const run = st.run; const mod = run && getModule(run.moduleId); if (!run || !mod) return null;
      if (run.stage === 'guide') return { mod, step: mod.guide[run.stepIndex], n: mod.guide.length, i: run.stepIndex };
      if (run.stage === 'check1' || run.stage === 'check2') { const list = run.stage === 'check1' ? mod.check1 : mod.check2; return { mod, goal: list[run.goalIndex], n: list.length, i: run.goalIndex }; }
      return null;
    };
    // Leaving practice changes the whole screen, so it dips to the page colour instead of cutting. `leaving` keeps the ticks quiet while it runs.
    const leavePractice = (change: () => void) => {
      if (leaving.current) return; leaving.current = true;
      void dipThrough(() => { change(); key.current = ''; sig.current = ''; }).finally(() => { leaving.current = false; });
    };
    const finish = () => leavePractice(() => { const st = useTraining.getState(); st.completeStage(); st.leave(); navRef.current.reset(); navRef.current.push('trainingRun'); });
    const advance = () => {
      const st = useTraining.getState(); const run = st.run; const cur = current(); if (!run || !cur) return;
      const r = cur.step ? advanceStep(run, cur.n) : advanceGoal(run, cur.n);
      if (r.done) finish(); else st.patchRun(() => r.run);
    };
    trainingActions.next = () => { nextTap.current = true; };
    // While off course the card is what is on screen, so Hint opens its steps instead of spending a hint the person cannot see.
    // A press asks for an immediate check, so the hint (and its toast and pulse) shows within a frame or two instead of waiting for the next poll.
    trainingActions.hint = () => { const t = useTraining.getState(); if (t.view?.stray?.how.length) { t.openHow(); return; } const cur = current(); if (cur?.goal) { t.pressHint(cur.goal.id, cur.goal.ladder); kickRef.current?.(); } };
    trainingActions.restart = () => {
      const cur = current(); if (!cur?.goal && !cur?.step) return; const st = useTraining.getState();
      if (!st.restartGoal(cur.goal?.inject)) return;
      ev.current = mutable(); stray.current = freshStray(); sig.current = ''; navRef.current.reset(); navRef.current.setTab(cur.mod.tabs[0] as Tab); kickRef.current?.();
    };
    trainingActions.skip = () => { const st = useTraining.getState(); st.patchRun(r => ({ ...r, skips: r.skips + 1 })); advance(); };
    trainingActions.exit = () => {
      void confirm('Leave training?', 'Your real till is exactly as you left it. You can pick this course up again from More, Training.', 'Leave', true).then(ok => {
        if (!ok) return;
        leavePractice(() => { useTraining.getState().leave(); navRef.current.reset(); navRef.current.setTab('more'); navRef.current.push('training'); });
      });
    };
    // The last spot measured says whether the person has to scroll: it can be wholly off screen (no ring, a cue at the edge) or cut off at the edge (ringed, with a cue).
    const need: { current: ScrollNeed | null } = { current: null };
    const spot = async (id?: string): Promise<Rect | null> => { if (!id) return null; const r = await measureSpot(id); const scr = { w: winRef.current.width, h: winRef.current.height }; need.current = scrollNeed(r, scr); return onScreen(r, scr) ? r : null; };

    const tick = async () => {
      if (busy.current || leaving.current) return; busy.current = true;
      try {
        const st = useTraining.getState(); if (!st.sandbox || !st.run) return;
        const cur = current(); if (!cur) return; const { mod } = cur; const n = navRef.current; const top = n.stack[n.stack.length - 1];
        if (!mod.tabs.includes(n.tab)) { n.setTab(mod.tabs[0] as Tab); return; }          // stay inside the module's screens
        if (top && !mod.routes.includes(top.name)) { n.pop(); return; }
        const item = cur.step ?? cur.goal; if (!item) return;
        need.current = null; const k = `${st.run.stage}:${cur.i}`;
        const fresh = key.current !== k;
        if (fresh) { key.current = k; ev.current = mutable(); nextTap.current = false; stray.current = freshStray(); base.current = null; if (cur.goal) st.inject(cur.goal.inject); } // a new step or goal starts from a clean slate, and carries straight on (no wasted tick)
        const app = useApp.getState();
        const snap = snapOf({ tab: n.tab, route: top?.name ?? '', sheets: layerDepth(), typed: getTyped(), where: getWhere(), openLine: getOpenLine(), customerQuery: getCustomerQuery(), noteDraft: getNoteDraft(), priceDraft: getPriceDraft(), cash: getCashProbe(), lastSaleCash: lastCash(app.pos.sales), payOpen: getPayOpen(), refund: getLastPracticeRefund(), lastSaleKinds: app.pos.sales.length ? app.pos.sales[0].tenders.map(t => t.kind) : undefined, staffId: app.staffId, locked: isLockScreen({ staffCount: app.settings.staff.length, unlocked: app.unlocked }), cart: app.pos.cart, sales: app.pos.sales.length, paying: top?.name === 'pay' });
        if (fresh || !base.current) { base.current = snap; useTraining.getState().captureGoalStart(); } // where this step or goal began, for spotting and undoing a stray
        syncRuntimeFromSnap(snap); registerRuntimeSpots(mountedSpotIds()); // put this sale's cart lines, and every control on screen right now, on the app graph
        const until = item.until;
        if (until.kind === 'visible' && (await spot(until.id))) ev.current.visible.add(until.id);
        const met = until.kind === 'next' ? nextTap.current : isMet(until, snap, ev.current as Events);
        if (met) { advance(); return; }
        // Off course? Compare with where this step or goal began. The person is told only after it has lasted a moment.
        const strayOf = async (dev: Deviation | null): Promise<{ rect: Rect | null; view: DockView['stray']; gesture: Gesture } | null> => {
          const tr = trackStray(stray.current, dev, Date.now()); stray.current = tr.tracker; if (!tr.show) return null;
          // Point at the first place that is really on screen, in the words that fit what is open now (the fix's own words first, then the app graph's walk back), so the card never contradicts itself.
          const cands = guidanceCandidates(tr.show, snap, snap.sheets > 0); let rect: Rect | null = null; let sayNow = cands[0].say; let gesture: Gesture = cands[0].gesture;
          for (const cnd of cands) { const r = await spot(cnd.target); if (r) { rect = r; sayNow = cnd.say; gesture = cnd.gesture; break; } }
          // Where the fix is taught, and whether this person has finished it. Finished: the steps wait behind a small button. Not finished: they show at once.
          const taughtIn = tr.show.taughtIn ?? (tr.show.kind === 'watch' ? mod.id : undefined);
          const done = taughtIn ? isComplete(st.progress, staffKey(realStaffId()), taughtIn) : false;
          const taught = taughtIn ? { id: taughtIn, title: moduleTitle(taughtIn, getModule(taughtIn)), done } : undefined;
          return { rect, gesture, view: { title: tr.show.title, say: sayNow, fix: tr.show.fix, offerRestart: tr.offerRestart, how: tr.show.how ?? [], taught, showHow: showHowAtOnce(taughtIn, done) } };
        };
        let view: DockView;
        if (cur.step) {
          const step = cur.step; let say = step.say; let rect: Rect | null = null;
          // `aim` says what to point at right now (the next key, the way back to the grid). It wins when what it points at is on screen.
          const aimed = step.aim?.(snap) ?? null; if (aimed) { rect = await spot(aimed.target); if (rect) say = aimed.say; }
          if (!rect) rect = await spot(step.target);
          if (step.target && !rect) for (const r of step.recoverFrom ?? []) { rect = await spot(r.target); if (rect) { say = r.say; break; } }
          if (step.target && !rect && step.recover) { say = step.recover.say; rect = await spot(step.recover.target); }
          const off = await strayOf(base.current ? diagnose(stepRules(step), { tabs: mod.tabs, routes: mod.routes }, base.current, snap) : null);
          if (off) { rect = off.rect; say = off.view!.say; }
          const gesture: Gesture = off ? off.gesture : step.gesture ?? 'tap';
          // Inside the ringed box only what this step asks for works: a swipe step never lets a tap open the line underneath (see lib/trainingGate.ts).
          setGate(!off && step.until.kind !== 'next' ? gateFor(step.gesture ?? 'tap', step.target) : null);
          view = { mode: 'guide', stage: 'guide', gesture, title: step.title ?? mod.title, say, rect, next: step.until.kind === 'next' && !off, reveal: false, nudge: false, hintLevel: 0, hintsLeft: 0, canSkip: !off, counter: `Step ${cur.i + 1} of ${cur.n}`, index: cur.i, total: cur.n, stray: off?.view };
        } else {
          const goal = cur.goal!; const hv = hintView(st.hint, goal.id, goal.ladder); let rect: Rect | null = null; let say = hv.text ?? '';
          if (hv.reveal) { rect = await spot(goal.reveal); if (!rect) { rect = await spot(goal.via); if (rect) say = 'Open this first, then the answer will be shown.'; } }
          // A hint never hides an off-course notice.
          const off = await strayOf(base.current ? diagnose(goal, { tabs: mod.tabs, routes: mod.routes }, base.current, snap) : null);
          let strayView: DockView['stray'];
          if (off) { rect = off.rect; say = off.view!.say; strayView = off.view; }
          setGate(null);
          view = { mode: 'check', stage: st.run.stage, gesture: off ? off.gesture : goal.gesture ?? 'tap', title: goal.title, objective: goal.title, say, rect, next: false, reveal: (hv.reveal || !!strayView) && !!rect, nudge: !strayView && shouldNudge(idleMs(), hv.level), hintLevel: hv.level, hintsLeft: hv.left, hintPress: st.hintPress, canSkip: hv.reveal, counter: `Goal ${cur.i + 1} of ${cur.n}`, index: cur.i, total: cur.n, stray: strayView };
        }
        if (need.current) view = { ...view, scroll: need.current, say: scrollSay(view.say, need.current) };
        const s = JSON.stringify(view, (_k, v) => (typeof v === 'number' ? Math.round(v) : v));
        if (s !== sig.current) { sig.current = s; useTraining.getState().setView(view); }
      } finally { busy.current = false; }
    };
    if (!sandbox) return undefined;
    // The poll is a safety net. Anything that can change the answer (a tap on a spot, the app's own state, the page or tab) asks for an immediate check instead,
    // so a finished step moves on within a frame or two rather than waiting for the next poll.
    let pending: ReturnType<typeof setTimeout> | null = null; let again = false;
    const kick = () => { if (busy.current) { again = true; return; } if (pending) return; pending = setTimeout(() => { pending = null; void tick().then(() => { if (again) { again = false; kick(); } }); }, 30); };
    kickRef.current = kick; const unsub = useApp.subscribe(kick);
    const t = setInterval(() => void tick(), 120); void tick();
    return () => { clearInterval(t); unsub(); if (pending) clearTimeout(pending); kickRef.current = null; setGate(null); };
  }, [sandbox]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>{children}{sandbox ? <PracticeTerminal /> : null}{sandbox ? <Enter from="none" duration={420} pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}><TrainingOverlay layer={ROOT_LAYER} /></Enter> : null}</View>
      {sandbox ? <TrainingDock /> : null}
      <Veil />
    </View>
  );
}
