// Location: src/lib/cloudkit/pushPoll.ts
// CloudKit sync, patch 8b: CloudKit tells this iPad when the shop's records changed (a silent push), and the app reads the shop's shared
// records straight away instead of waiting for the next 25 second tick. This file is only the decisions, so it is tested without an iPad
// (tests/pushpoll.test.ts): subscribe once, turn a burst of pushes into one read, never read twice at the same time, and say plainly
// whether pushes are on. The 25 second tick is NOT removed by this patch: iOS may delay or drop silent pushes, so the tick stays as the
// fallback until T111 shows pushes arrive reliably. Decisions: dev_docs/CLOUDKIT_SYNC_DECISIONS.md (the 8b row).

export type PushState = 'off' | 'listening' | 'unavailable';

export type PushPollDeps = {
  /** True only while the CloudKit backend is the active one. */
  active: () => boolean;
  /** True in practice mode: nothing is subscribed or read then. */
  training: () => boolean;
  /** Ask CloudKit for change pushes on both databases. Resolves true when both are in place, false when not. May throw. */
  subscribe: () => Promise<boolean>;
  /** Listen for the module's change event. Returns an unsubscribe function. */
  listen: (onChange: () => void) => () => void;
  /** The read to run: the shop's shared records. Must not throw (an error here is swallowed and the next push or tick tries again). */
  run: () => Promise<void>;
  /** The least time between the start of two reads caused by pushes. */
  minGapMs?: number;
  now?: () => number;
  /** Call `fn` after `ms`. Replaced in tests. */
  later?: (fn: () => void, ms: number) => unknown;
};

export const PUSH_MIN_GAP_MS = 2000;

export function createPushPoll(d: PushPollDeps) {
  const gap = d.minGapMs ?? PUSH_MIN_GAP_MS; const now = d.now ?? Date.now; const later = d.later ?? ((fn, ms) => setTimeout(fn, ms));
  let state: PushState = 'off'; let unlisten: (() => void) | null = null; let starting: Promise<PushState> | null = null;
  // running: a read is in progress. again: a push arrived during it, so one more read is owed. timer: a read is already scheduled for later.
  let running = false; let again = false; let timer = false; let lastStart = -Infinity; let events = 0; let lastEventAt = 0; let reads = 0;

  async function go(): Promise<void> {
    if (running) { again = true; return; }
    if (state !== 'listening' || !d.active() || d.training()) return;
    const wait = lastStart + gap - now();
    if (wait > 0) { if (!timer) { timer = true; later(() => { timer = false; void go(); }, wait); } return; }
    running = true; lastStart = now(); reads += 1;
    try { await d.run(); } catch { /* the next push or the 25 second tick tries again */ }
    running = false;
    if (again) { again = false; void go(); }
  }

  const onChange = () => { events += 1; lastEventAt = now(); void go(); };

  /** Subscribe once and start listening. Safe to call on every tick: it does nothing once listening, and tries again after a failure. */
  function start(): Promise<PushState> {
    if (state === 'listening') return Promise.resolve(state);
    if (starting) return starting;
    if (!d.active() || d.training()) return Promise.resolve(state);
    starting = (async () => {
      try {
        const ok = await d.subscribe();
        if (ok) { if (!unlisten) unlisten = d.listen(onChange); state = 'listening'; } else state = 'unavailable';
      } catch { state = 'unavailable'; }
      starting = null; return state;
    })();
    return starting;
  }

  function stop(): void { unlisten?.(); unlisten = null; state = 'off'; again = false; }

  return { start, stop, onChange, status: () => ({ state, events, lastEventAt, reads }) };
}
export type PushPoll = ReturnType<typeof createPushPoll>;
