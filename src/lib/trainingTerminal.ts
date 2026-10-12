// Location: src/lib/trainingTerminal.ts
// A pretend Zeller terminal for training. It sends the same event names as the real one and either approves or declines (code 51).
// It plugs in wherever a TerminalLike is expected, so Pay and startCharge run exactly as they do in production.
import type { TerminalLike, ZellerEvent, ZellerTxn } from './zeller';
import { lookupResponse } from './responseCodes';
import { eventFor, type VtState } from './virtualTerminal';
import { createVt, type VtController } from './virtualTerminalSession';

export type Outcome = 'approve' | 'decline';
type Op<T> = Promise<T | (Error & { type: string })> & { cancel?: () => void; onEvent?: (cb: (e: ZellerEvent) => void) => unknown };
const err = (type: string): Error & { type: string } => Object.assign(new Error(type), { type });

export const timing = { stepMs: 600 };
/** The PIN an unattended virtual terminal keys for the customer when the amount needs one. */
const AUTO_PIN = ['1', '2', '3', '4', 'ok'];
/**
 * `vt` is the virtual Zeller Terminal 2 drawn on screen (optional: without it the terminal has no picture and behaves exactly as before).
 * Automatic (`vt.manual` false): the terminal plays the customer, taps a card after one step and keys the PIN itself, and the timing is the same as ever.
 * Manual: the person plays the customer on the virtual terminal (taps or inserts the card, keys the PIN), or presses Cancel on it.
 * `declineCode` is the response code the terminal gives when the card is declined (51, insufficient funds, unless a course says otherwise).
 */
export function makeTrainingTerminal(opts: { next: () => Outcome; stepMs?: number; vt?: VtController; declineCode?: () => string }): TerminalLike & { approved: ZellerTxn[] } {
  const ms = () => opts.stepMs ?? timing.stepMs; const approved: ZellerTxn[] = []; let n = 0; const vt = opts.vt;
  const run = (o: { amount: number; reference?: string }, kind: 'PURCHASE' | 'REFUND'): Op<ZellerTxn> => {
    const subs: ((e: ZellerEvent) => void)[] = []; let timers: ReturnType<typeof setTimeout>[] = []; let finish: (v: ZellerTxn | (Error & { type: string })) => void = () => {}; let off: (() => void) | undefined; let done = false;
    const emit = (e: ZellerEvent) => subs.forEach(cb => cb(e));
    const p = new Promise<ZellerTxn | (Error & { type: string })>(res => { finish = v => { if (done) return; done = true; off?.(); res(v); }; }) as Op<ZellerTxn>;
    const outcome = opts.next(); const code = outcome === 'decline' ? (opts.declineCode?.() ?? '51') : '00';
    const text = outcome === 'decline' ? (code === '51' ? 'Insufficient funds' : lookupResponse(code).message.replace(/ — .*$/, '').replace(/\.$/, '')) : undefined;
    const txn = (): ZellerTxn => ({
      type: kind, amount: o.amount, currency: 'AUD', externalReference: o.reference, transactionUuid: `train-txn-${++n}`, timestampLocal: new Date().toISOString(), scheme: 'Visa', cardMedia: vt?.get().media === 'INSERT' ? 'INSERT' : 'TAP', panMasked: 'XXXXXXXXXXXX0000',
      ...(outcome === 'approve' ? { $type: 'Approved' as const, status: 'APPROVED' as const, approvalCode: 'TRAIN1', responseCode: '00' } : { $type: 'Declined' as const, status: 'DECLINED' as const, responseCode: code, responseText: text }),
    });
    const settle = () => { const t = txn(); if (t.status === 'APPROVED') approved.push(t); finish(t); };
    if (!vt || kind === 'REFUND') {
      // No picture (refunds are not drawn yet): the same three beats as ever.
      timers = [setTimeout(() => emit({ type: 'AWAITING_PAYMENT_METHOD' }), 0), setTimeout(() => emit({ type: 'PROCESSING' }), ms()), setTimeout(settle, ms() * 2)];
    } else {
      // The virtual terminal is in charge: its screens decide when the till hears about each stage.
      let pinTimers: ReturnType<typeof setTimeout>[] = []; let processing = false;
      const onScreen = (s: VtState, prev: VtState) => {
        if (s.screen === prev.screen) return; const e = eventFor(s); if (e && s.screen !== 'approved' && s.screen !== 'declined') emit(e);
        if (s.screen === 'cancelled') { timers.forEach(clearTimeout); pinTimers.forEach(clearTimeout); finish(err('Cancelled')); }
        if (s.screen === 'pin' && !vt.manual) pinTimers = AUTO_PIN.map((k, i) => setTimeout(() => vt.dispatch({ t: 'key', key: k }), 250 * (i + 1)));
        if (s.screen === 'processing' && !processing) { processing = true; timers.push(setTimeout(() => { vt.dispatch({ t: 'result', approved: outcome === 'approve', text, code }); const e2 = eventFor(vt.get()); if (e2) emit(e2); settle(); }, ms())); }
      };
      off = vt.subscribe(onScreen); const stop = off; off = () => { stop(); pinTimers.forEach(clearTimeout); };
      // The request is made on the next tick, so the till has attached its event listener before the first event is sent.
      timers = [setTimeout(() => { vt.dispatch({ t: 'request', amountCents: o.amount }); timers.push(setTimeout(() => { if (!vt.manual) vt.dispatch({ t: 'present', media: 'TAP' }); }, ms())); }, 0)];
    }
    p.onEvent = cb => { subs.push(cb); };
    p.cancel = () => { timers.forEach(clearTimeout); if (vt && kind === 'PURCHASE' && !done) { vt.dispatch({ t: 'cancel' }); if (vt.get().screen === 'processing') vt.dispatch({ t: 'reset' }); } finish(err('Cancelled')); };
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
const queue: Outcome[] = []; let declineWith = '51';
/** The virtual terminal drawn on screen during training. Automatic until a course asks for the person to play the customer (`setManualCard`). */
export const trainingVt = createVt({ dark: true });
export const trainingTerminal = makeTrainingTerminal({ next: () => queue.shift() ?? 'approve', vt: trainingVt, declineCode: () => declineWith });
export const setDeclines = (times: number, code = '51'): void => { queue.length = 0; declineWith = code; for (let i = 0; i < Math.max(0, Math.min(5, times)); i++) queue.push('decline'); };
export const setManualCard = (manual: boolean): void => { trainingVt.manual = manual; };
export const resetTrainingTerminal = (): void => { queue.length = 0; declineWith = '51'; trainingTerminal.approved.length = 0; trainingVt.manual = false; trainingVt.dispatch({ t: 'reset' }); };
