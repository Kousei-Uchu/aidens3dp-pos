// Location: src/lib/virtualTerminalSession.ts
// A virtual terminal you can hold: its current screen, a way to send it actions, and (when nobody is in charge) the timers that move a message screen on.
// No React and no app imports, so it runs in the node tests. The React side is `useVt` in src/ui/VirtualTerminal.tsx.
import { autoAction, DWELL_MS, vtInitial, vtReduce, type VtAction, type VtState } from './virtualTerminal';

export type VtController = {
  get: () => VtState;
  subscribe: (cb: (s: VtState, prev: VtState) => void) => () => void;
  dispatch: (a: VtAction) => VtState;
  /** Manual: the person plays the customer (taps or inserts the card, keys the PIN, takes the card out). Automatic: the terminal plays the customer. */
  manual: boolean;
  /** Stops every timer the controller started. */
  dispose: () => void;
};
type Timers = { set: (f: () => void, ms: number) => unknown; clear: (h: unknown) => void };
const realTimers: Timers = { set: (f, ms) => { const h: any = setTimeout(f, ms); h?.unref?.(); return h; }, clear: h => clearTimeout(h as any) };

export function createVt(o: { dark?: boolean; manual?: boolean; timers?: Timers } = {}): VtController {
  const timers = o.timers ?? realTimers; let state = vtInitial(!!o.dark); let pending: unknown = null; const subs = new Set<(s: VtState, prev: VtState) => void>();
  const stop = () => { if (pending !== null) { timers.clear(pending); pending = null; } };
  // A message screen moves on by itself (approved, declined, cancelled, receipt, removeCard) so the terminal never sticks, unless the screen is one the person is meant to act on.
  const schedule = () => {
    stop(); const a = autoAction(state); if (!a) return;
    // In manual mode the person takes the card out themselves; every other message screen still moves on by itself.
    if (c.manual && state.screen === 'removeCard') return;
    pending = timers.set(() => { pending = null; c.dispatch(a); }, DWELL_MS[state.screen]);
  };
  const c: VtController = {
    manual: !!o.manual,
    get: () => state,
    subscribe: cb => { subs.add(cb); return () => { subs.delete(cb); }; },
    dispatch: a => { const prev = state; const next = vtReduce(prev, a); if (next === prev) return state; state = next; schedule(); subs.forEach(cb => cb(state, prev)); return state; },
    dispose: () => { stop(); subs.clear(); },
  };
  return c;
}
