// Location: src/lib/attemptShared.ts
// CloudKit sync, patch 4 (pull side): what this register does with the payment attempts it reads back from CloudKit.
// Two jobs, both pure so they are tested without an iPad (tests/attemptpull.test.ts):
//   1. If another register resolved a payment that this register still shows as "no result yet", take that resolution over.
//   2. Turn the shop-wide attempts into the rows the Diagnostics screen shows.
// Decisions: dev_docs/CLOUDKIT_SYNC_DECISIONS.md item 9 and Q10 (any register can resolve, the first resolution wins).
import type { Attempt } from '../state/store';
import { fmt } from './money';
import { unresolvedAttempts, type SharedAttempt } from './eventRecords';

const keyOf = (a: { saleUuid: string; ref: string }): string => `${a.saleUuid}|${a.ref}`;

/**
 * This register's own attempts, with any that another register has resolved marked resolved too.
 * Only an attempt that is `unknown` (no result yet) is changed. A `started` one is a charge that may still be running on this
 * register's reader, and a resolution from elsewhere must not clear that. Everything else is already settled.
 * `list` is the same array that came in when nothing changed, so a caller can tell by identity. `resolved` holds the attempts that changed.
 */
export function applyRemoteResolutions(local: Attempt[], cloud: SharedAttempt[]): { list: Attempt[]; resolved: Attempt[] } {
  const done = new Map<string, SharedAttempt>();
  for (const c of cloud) if (c.status === 'resolved' && c.resolvedBy) done.set(keyOf(c), c);
  if (!done.size) return { list: local, resolved: [] };
  const resolved: Attempt[] = [];
  const list = local.map(a => {
    if (a.status !== 'unknown') return a;
    const c = done.get(keyOf(a)); if (!c) return a;
    const next: Attempt = { ...a, status: 'resolved', resolvedBy: c.resolvedBy };
    resolved.push(next); return next;
  });
  return { list: resolved.length ? list : local, resolved };
}

/** The local notice shown when another register resolved a payment that was waiting on this one. The notice stays on this iPad (decisions item 10). */
export function resolvedElsewhereNotice(a: Attempt): { title: string; body: string } {
  return {
    title: 'Card payment resolved on another register',
    body: `${a.resolvedBy ?? 'Another register'} resolved the ${fmt(a.amountCents)} card payment that was waiting here. Check the terminal or Zeller dashboard that the sale matches what happened.`,
  };
}

export type AttemptRow = { key: string; title: string; sub: string };

/** How long a `started` attempt counts as a charge still running. The same window `paymentActive` (screensaver.ts) uses. */
export const LIVE_WINDOW_MS = 5 * 60_000;

/**
 * Payments that still need someone, from every register, newest first, as rows for the Diagnostics screen.
 * A `started` attempt older than the live window is not a charge still running (the register stopped part way, for example
 * the app closed mid-charge), so it is labelled that way instead of "in progress" for ever.
 */
export function unresolvedRows(shared: SharedAttempt[], limit = 8, nowMs = Date.now()): AttemptRow[] {
  const label = (a: SharedAttempt): string => (a.status !== 'started' ? 'no result yet' : nowMs - Date.parse(a.ts) < LIVE_WINDOW_MS ? 'in progress' : 'stopped part way');
  return unresolvedAttempts(shared).slice(0, limit).map(a => ({
    key: `${a.saleUuid}|${a.ref}`,
    title: `${fmt(a.amountCents)} · ${label(a)}`,
    sub: `${a.registerName || 'Unnamed register'} · ${new Date(a.ts).toLocaleString()}`,
  }));
}
