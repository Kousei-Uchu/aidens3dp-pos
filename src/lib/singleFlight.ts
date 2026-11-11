// Location: src/lib/singleFlight.ts
// Wrap an async function so that a call made while a run is still going joins that run (it gets the same promise) instead of starting a
// second one. The shared poll makes about twenty iCloud round trips, so on a slow connection it can take longer than the 25 second tick; without
// this, ticks, change pushes and the Sync now button stacked more polls on top of it, all fighting over iCloud and over the same local state.
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | null = null;
  return () => {
    if (running) return running;
    const p = (async () => { try { return await fn(); } finally { running = null; } })();
    running = p;
    return p;
  };
}
