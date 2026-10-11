// Location: src/ui/TrainingHost.tsx
// Wraps the whole app. Outside training it renders its children and nothing else.
// During Guide and Check it keeps the person inside the module's screens, watches the real app state about every 300 ms
// (advancing at most one step per tick), measures the spot to point at, and hands the overlay and dock what to draw.
import React, { useEffect, useRef } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useNav, type Tab } from './nav';
import { useApp } from '../state/store';
import { useTraining, type DockView } from '../state/trainingSession';
import { getModule } from '../training';
import { measureSpot, onSpotPressed } from './Spot';
import { confirm } from './kit';
import TrainingOverlay from './TrainingOverlay';
import TrainingDock from './TrainingDock';
import { Enter } from './Motion';
import { Veil, dipThrough } from './Veil';
import { trainingActions } from './trainingActions';
import { ROOT_LAYER } from '../lib/trainingLayers';
import { onScreen, type Rect } from '../lib/trainingGeometry';
import { isMet, snapOf, type Events } from '../lib/trainingConds';
import { hintView, shouldNudge } from '../lib/trainingHints';
import { advanceGoal, advanceStep } from '../lib/trainingRun';
import { idleMs } from '../lib/idle';
import type { Goal, Step, TrainingModule } from '../lib/trainingModule';

const mutable = (): { pressed: Set<string>; visible: Set<string> } => ({ pressed: new Set(), visible: new Set() });

export default function TrainingHost({ children }: { children: React.ReactNode }) {
  const nav = useNav(); const win = useWindowDimensions(); const sandbox = useTraining(s => s.sandbox);
  const navRef = useRef(nav); navRef.current = nav; const winRef = useRef(win); winRef.current = win;
  const ev = useRef(mutable()); const key = useRef(''); const busy = useRef(false); const nextTap = useRef(false); const sig = useRef(''); const leaving = useRef(false);

  useEffect(() => onSpotPressed(id => { ev.current.pressed.add(id); }), []);

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
    trainingActions.hint = () => { const cur = current(); if (cur?.goal) useTraining.getState().pressHint(cur.goal.id, cur.goal.ladder); };
    trainingActions.skip = () => { const st = useTraining.getState(); st.patchRun(r => ({ ...r, skips: r.skips + 1 })); advance(); };
    trainingActions.exit = () => {
      void confirm('Leave training?', 'Your real till is exactly as you left it. You can pick this course up again from More, Training.', 'Leave', true).then(ok => {
        if (!ok) return;
        leavePractice(() => { useTraining.getState().leave(); navRef.current.reset(); navRef.current.setTab('more'); navRef.current.push('training'); });
      });
    };
    const spot = async (id?: string): Promise<Rect | null> => { if (!id) return null; const r = await measureSpot(id); return onScreen(r, { w: winRef.current.width, h: winRef.current.height }) ? r : null; };

    const tick = async () => {
      if (busy.current || leaving.current) return; busy.current = true;
      try {
        const st = useTraining.getState(); if (!st.sandbox || !st.run) return;
        const cur = current(); if (!cur) return; const { mod } = cur; const n = navRef.current; const top = n.stack[n.stack.length - 1];
        if (!mod.tabs.includes(n.tab)) { n.setTab(mod.tabs[0] as Tab); return; }          // stay inside the module's screens
        if (top && !mod.routes.includes(top.name)) { n.pop(); return; }
        const item = cur.step ?? cur.goal; if (!item) return;
        const k = `${st.run.stage}:${cur.i}`;
        if (key.current !== k) { key.current = k; ev.current = mutable(); nextTap.current = false; if (cur.goal) st.inject(cur.goal.inject); return; } // a new step or goal starts from a clean slate
        const app = useApp.getState();
        const snap = snapOf({ tab: n.tab, route: top?.name ?? '', cart: app.pos.cart, sales: app.pos.sales.length, paying: top?.name === 'pay' });
        const until = item.until;
        if (until.kind === 'visible' && (await spot(until.id))) ev.current.visible.add(until.id);
        const met = until.kind === 'next' ? nextTap.current : isMet(until, snap, ev.current as Events);
        if (met) { advance(); return; }
        let view: DockView;
        if (cur.step) {
          const step = cur.step; let say = step.say; let rect = await spot(step.target);
          if (step.target && !rect && step.recover) { say = step.recover.say; rect = await spot(step.recover.target); }
          view = { mode: 'guide', stage: 'guide', title: step.title ?? mod.title, say, rect, next: step.until.kind === 'next', reveal: false, nudge: false, hintLevel: 0, hintsLeft: 0, canSkip: true, counter: `Step ${cur.i + 1} of ${cur.n}` };
        } else {
          const goal = cur.goal!; const hv = hintView(st.hint, goal.id, goal.ladder); let rect: Rect | null = null; let say = hv.text ?? '';
          if (hv.reveal) { rect = await spot(goal.reveal); if (!rect) { rect = await spot(goal.via); if (rect) say = 'Open this first, then the answer will be shown.'; } }
          view = { mode: 'check', stage: st.run.stage, title: goal.title, objective: goal.title, say, rect, next: false, reveal: hv.reveal && !!rect, nudge: shouldNudge(idleMs(), hv.level), hintLevel: hv.level, hintsLeft: hv.left, canSkip: hv.reveal, counter: `Goal ${cur.i + 1} of ${cur.n}` };
        }
        const s = JSON.stringify(view, (_k, v) => (typeof v === 'number' ? Math.round(v) : v));
        if (s !== sig.current) { sig.current = s; useTraining.getState().setView(view); }
      } finally { busy.current = false; }
    };
    if (!sandbox) return undefined;
    const t = setInterval(() => void tick(), 300); void tick();
    return () => clearInterval(t);
  }, [sandbox]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>{children}{sandbox ? <Enter from="none" duration={420} pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}><TrainingOverlay layer={ROOT_LAYER} /></Enter> : null}</View>
      {sandbox ? <TrainingDock /> : null}
      <Veil />
    </View>
  );
}
