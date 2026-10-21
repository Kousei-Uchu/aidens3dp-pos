// Location: src/state/demoSession.ts
// Demo mode (F8): runs the till on a COPY of its own data (patch 0187), so every feature can be shown on the shop's real catalogue
// without touching anything real. Practice data fills in only what the till has none of (src/lib/demoData.ts).
// It is separate from a training course run: there is no course, it stays on until the person leaves it, and its home
// screen lists every feature. The guard is the same as training's (src/lib/trainingGuard.ts), so the card reader,
// scanner, receipts and every sync seam behave exactly as they do in practice: nothing is written or sent, and
// leaving puts the real state back exactly.
import { create } from 'zustand';
import { useApp, flushPersist } from './store';
import { setDemoGuard } from '../lib/trainingGuard';
import { takeSnapshot, trainingBlocker } from '../lib/trainingSandbox';
import { resetTrainingTerminal } from '../lib/trainingTerminal';
import { resetCheckout } from '../lib/trainingProbe';
import { resetPracticeOrders } from '../lib/trainingOrders';
import { resetPracticeGifts } from '../lib/trainingGifts';
import { resetPass } from '../lib/trainingPass';
import { buildDemoSwap, type DemoSource } from '../lib/demoData';
import { isPractising } from './trainingSession';

/** The real state, kept in memory only while Demo mode is on. A crash just reopens the normal till. */
let real: ReturnType<typeof takeSnapshot> | null = null;

type DemoState = {
  active: boolean;
  /** What the demo was built from (the till's own data, or practice where it had none). Null when Demo mode is off. */
  source: DemoSource | null;
  /** Enter Demo mode. Returns a message when it cannot start, or null on success. */
  enter: () => Promise<string | null>;
  leave: () => void;
};
export const useDemo = create<DemoState>((set, get) => ({
  active: false,
  source: null,
  enter: async () => {
    if (get().active) return null;
    if (isPractising()) return 'Finish the training course first, then start Demo mode.';
    // A card payment that is really in flight, or a part-paid sale, belongs to the real till: finish it first (the same rule training has).
    const blocker = trainingBlocker(useApp.getState());
    if (blocker) return blocker.replace('start training', 'start Demo mode');
    await flushPersist(); // anything still waiting for its 400 ms timer is written now, so no timer fires inside the sandbox
    real = takeSnapshot(useApp.getState());
    setDemoGuard(true);
    resetTrainingTerminal(); resetPass(); resetCheckout(); resetPracticeOrders(); resetPracticeGifts();
    const { swap, source } = buildDemoSwap(real);
    useApp.setState({ ...swap });
    set({ active: true, source });
    return null;
  },
  leave: () => {
    if (real) {
      const back = real; real = null;
      useApp.setState(back);
      resetTrainingTerminal(); resetPass(); resetCheckout(); resetPracticeOrders(); resetPracticeGifts();
    }
    setDemoGuard(false); // restore first, then drop the guard
    set({ active: false, source: null });
  },
}));
