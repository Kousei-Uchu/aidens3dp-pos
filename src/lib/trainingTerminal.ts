// Location: src/lib/trainingTerminal.ts
// A pretend Zeller terminal for training. It sends the same event names as the real one and either approves or declines (code 51).
// It plugs in wherever a TerminalLike is expected, so Pay and startCharge run exactly as they do in production.
import type { TerminalLike, ZellerEvent, ZellerTxn } from './zeller';

export type Outcome = 'approve' | 'decline';
type Op<T> = Promise<T | (Error & { type: string })> & { cancel?: () => void; onEvent?: (cb: (e: ZellerEvent) => void) => unknown };
const err = (type: string): Error & { type: string } => Object.assign(new Error(type), { type });

export const timing = { stepMs: 600 };
export function makeTrainingTerminal(opts: { next: () => Outcome; stepMs?: number }): TerminalLike & { approved: ZellerTxn[] } {
  const ms = () => opts.stepMs ?? timing.stepMs; const approved: ZellerTxn[] = []; let n = 0;
  const run = (o: { amount: number; reference?: string }, kind: 'PURCHASE' | 'REFUND'): Op<ZellerTxn> => {
    const subs: ((e: ZellerEvent) => void)[] = []; let timers: ReturnType<typeof setTimeout>[] = []; let finish: (v: ZellerTxn | (Error & { type: string })) => void = () => {};
    const emit = (type: string) => subs.forEach(cb => cb({ type }));
    const p = new Promise<ZellerTxn | (Error & { type: string })>(res => { finish = res; }) as Op<ZellerTxn>;
    const outcome = opts.next();
    const txn = (): ZellerTxn => ({
      type: kind, amount: o.amount, currency: 'AUD', externalReference: o.reference, transactionUuid: `train-txn-${++n}`, timestampLocal: new Date().toISOString(), scheme: 'Visa', cardMedia: 'TAP', panMasked: 'XXXXXXXXXXXX0000',
      ...(outcome === 'approve' ? { $type: 'Approved' as const, status: 'APPROVED' as const, approvalCode: 'TRAIN1', responseCode: '00' } : { $type: 'Declined' as const, status: 'DECLINED' as const, responseCode: '51', responseText: 'Insufficient funds' }),
    });
    timers = [setTimeout(() => emit('AWAITING_PAYMENT_METHOD'), 0), setTimeout(() => emit('PROCESSING'), ms()), setTimeout(() => { const t = txn(); if (t.status === 'APPROVED') approved.push(t); finish(t); }, ms() * 2)];
    p.onEvent = cb => { subs.push(cb); };
    p.cancel = () => { timers.forEach(clearTimeout); finish(err('Cancelled')); };
    return p;
  };
  return {
    approved,
    initialise: () => Promise.resolve(true) as Op<true>, setup: () => Promise.resolve(true) as Op<true>, configure: () => Promise.resolve(true) as Op<true>,
    purchase: o => run(o, 'PURCHASE'), refund: o => run(o, 'REFUND'),
    // Only approved payments are listed, as a real terminal would: a declined card never shows up here.
    getTransactions: (o) => Promise.resolve(approved.filter(t => !o?.reference || t.externalReference === o.reference)) as Op<ZellerTxn[]>,
  };
}

/** The one terminal training uses. Check 2 sets how many cards it declines before it approves. */
const queue: Outcome[] = [];
export const trainingTerminal = makeTrainingTerminal({ next: () => queue.shift() ?? 'approve' });
export const setDeclines = (times: number): void => { queue.length = 0; for (let i = 0; i < Math.max(0, Math.min(5, times)); i++) queue.push('decline'); };
export const resetTrainingTerminal = (): void => { queue.length = 0; trainingTerminal.approved.length = 0; };
