// Location: src/state/demoSession.ts
// Demo mode (F8): locks the till onto practice fixtures so every feature can be shown without touching anything real.
// It is separate from a training course run: there is no course, it stays on until the person leaves it, and its home
// screen lists every feature. The swap is the same as training's (src/lib/trainingSandbox.ts), so the card reader,
// scanner, drawer, receipts and every sync seam behave exactly as they do in practice: nothing is written or sent.
import { create } from 'zustand';
import { useApp, flushPersist } from './store';
import { setDemoGuard } from '../lib/trainingGuard';
import { buildSandbox, takeSnapshot } from '../lib/trainingSandbox';
import { resetTrainingTerminal } from '../lib/trainingTerminal';
import { resetCheckout } from '../lib/trainingProbe';
import { resetPracticeOrders } from '../lib/trainingOrders';
import { resetPracticeGifts } from '../lib/trainingGifts';
import { resetPass } from '../lib/trainingPass';
import { demoSales, demoRollups, demoNotices, demoStaff, DEMO_OWNER_ID } from '../lib/demoFixtures';
import { isPractising } from './trainingSession';

/** The real state, kept in memory only while Demo mode is on. A crash just reopens the normal till. */
let real: ReturnType<typeof takeSnapshot> | null = null;

type DemoState = {
  active: boolean;
  /** Enter Demo mode. Returns a message when it cannot start, or null on success. */
  enter: () => Promise<string | null>;
  leave: () => void;
};
export const useDemo = create<DemoState>((set, get) => ({
  active: false,
  enter: async () => {
    if (get().active) return null;
    if (isPractising()) return 'Finish the training course first, then start Demo mode.';
    await flushPersist(); // anything still waiting for its 400 ms timer is written now, so no timer fires inside the sandbox
    real = takeSnapshot(useApp.getState());
    setDemoGuard(true);
    resetTrainingTerminal(); resetPass(); resetCheckout(); resetPracticeOrders(); resetPracticeGifts();
    const sb = buildSandbox(real, { sync: 'idle', outbox: { stuck: 1, queued: 3 } });
    const sales = demoSales(sb.settings.registerId, sb.settings.registerName);
    // Signed in as a made-up owner with no PIN, so every feature is on show and the demo can never lock itself out.
    const settings = { ...sb.settings, staff: demoStaff(), requirePin: false };
    useApp.setState({ ...sb, settings, staffId: DEMO_OWNER_ID, unlocked: true, pos: { ...sb.pos, sales, rollups: demoRollups(sales), notices: demoNotices() } });
    set({ active: true });
    return null;
  },
  leave: () => {
    if (real) {
      const back = real; real = null;
      useApp.setState(back);
      resetTrainingTerminal(); resetPass(); resetCheckout(); resetPracticeOrders(); resetPracticeGifts();
    }
    setDemoGuard(false); // restore first, then drop the guard
    set({ active: false });
  },
}));
