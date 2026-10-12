// Location: src/training/aims.ts
// Shared `aim` helpers for Guide steps (see Step.aim in trainingModule.ts): what to say and point at right now when Checkout is not where the step needs it.
import type { TrainSnap } from '../lib/trainingModule';
import { SPOT, findTabSpot } from '../lib/trainingSpots';

/** Where Checkout has to be for a step on the grid. Returns the next move to get there (the practice may have left Checkout on another tab, inside a category or in the sizes), or null when it is already right. */
export const gridAim = (want: 'top' | 'inside' | 'sizes') => (s: TrainSnap): { say: string; target: string } | null => {
  const w = s.where; if (!w) return null;
  if (w.tab !== 'quick') return { say: 'Tap Quick Menu to get back to the grid.', target: findTabSpot('quick') };
  if (w.sizes && want !== 'sizes') return { say: 'The sizes are open. Tap the back arrow to close them.', target: SPOT.findBack };
  if (w.depth > 0 && want === 'top') return { say: 'You are inside a category. Tap the back arrow to go up to the first page.', target: SPOT.findBack };
  return null;
};
/** For a step on the Keypad | Quick Menu | All products switch: the switch is hidden while the sizes are open, so close them first. */
export const tabsAim = (s: TrainSnap): { say: string; target: string } | null => (s.where?.sizes ? { say: 'The sizes are open. Tap the back arrow to close them first.', target: SPOT.findBack } : null);
