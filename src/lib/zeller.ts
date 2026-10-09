// Zeller Payments SDK wrapper (research doc §6.8). Errors are RETURNED by the SDK, never thrown.
// Everything outside this file talks to PaymentResult – never to raw SDK results.
import { lookupResponse, type Category } from './responseCodes';
import type { CardInfo } from './types';

export type ZellerEvent = { type: string; message?: string };
export type ZellerTxn = {
  $type?: 'Approved' | 'Declined'; type?: 'PURCHASE' | 'REFUND'; status?: 'APPROVED' | 'DECLINED' | 'FAILED';
  amount: number; currency?: string; responseCode?: string; responseText?: string; timestampLocal?: string;
  transactionUuid?: string; approvalCode?: string; cardMedia?: string; externalReference?: string; panMasked?: string;
  receiptLink?: string; rrn?: string; scheme?: string; tipAmount?: number; surchargeAmount?: number; taxAmount?: number;
  sessionUuid?: string;
};
export type ZellerError = Error & { type: string };
type Op<T> = Promise<T | ZellerError> & { cancel?: () => void; onEvent?: (cb: (e: ZellerEvent) => void) => unknown };

export interface TerminalLike {
  initialise(): Op<true>;
  setup(opts?: Record<string, unknown>): Op<true>;
  configure(opts: Record<string, unknown>): Op<true>;
  purchase(o: {
    amount: number; reference: string; sessionUuid?: string; tipAmount?: number; terminalReceipt?: boolean;
    terminalReceiptPrint?: boolean; terminalContact?: boolean; terminalNote?: boolean; fullscreen?: boolean;
    virtualTerminal?: boolean; theme?: string;
  }): Op<ZellerTxn>;
  refund(o: { purchase: string; amount: number; reference?: string; sessionUuid?: string; amountAdjustable?: boolean }): Op<ZellerTxn>;
  getTransactions(o?: { reference?: string }): Op<ZellerTxn[]>;
}

export type NotReadyReason = 'SETUP_REQUIRED' | 'OFFLINE' | 'TERMINAL_UNAVAILABLE' | 'BUSY' | 'INVALID_REQUEST';
export type PaymentResult =
  | { kind: 'APPROVED'; txn: ZellerTxn }
  | { kind: 'DECLINED'; code?: string; text: string; category: Category; retryable: boolean; txn?: ZellerTxn }
  | { kind: 'CANCELLED' }
  | { kind: 'UNKNOWN'; reason: string } // must reconcile before ANY retry
  | { kind: 'NOT_READY'; reason: NotReadyReason; message: string };

export const attemptRef = (saleUuid: string, n: number) => `${saleUuid}-${n}`;
const isErr = (r: unknown): r is ZellerError => r instanceof Error;

export function describeEvent(e: ZellerEvent): string {
  switch (e.type) {
    case 'AWAITING_PAYMENT_METHOD': return 'Tap, insert or swipe card on the terminal';
    case 'AWAITING_APPLICATION_SELECTION': return 'Customer is choosing the card application';
    case 'AWAITING_ACCOUNT_SELECTION': return 'Customer is choosing the account';
    case 'AWAITING_PIN_ENTRY': return 'Customer is entering their PIN';
    case 'AWAITING_SIGNATURE': return 'Waiting for signature';
    case 'SIGNATURE_SUBMITTED': return 'Signature received';
    case 'SIGNATURE_CLEARED': return 'Signature cleared — sign again';
    case 'RETRYING_PAYMENT_METHOD': return 'Retrying — present the card again';
    case 'PROCESSING': return 'Processing…';
    case 'DISPLAYING_PAYMENT_MESSAGE': return e.message || 'Showing result on the terminal';
    case 'AWAITING_TIP_ENTRY': return 'Customer is choosing a tip';
    case 'TIP_PROVIDED': return 'Tip chosen';
    default: return e.message || e.type;
  }
}

export function txnToCard(t: ZellerTxn): CardInfo {
  return {
    transactionUuid: t.transactionUuid, externalReference: t.externalReference, approvalCode: t.approvalCode,
    scheme: t.scheme, panMasked: t.panMasked, cardMedia: t.cardMedia, rrn: t.rrn, receiptLink: t.receiptLink,
    responseCode: t.responseCode, timestampLocal: t.timestampLocal, tipAmount: t.tipAmount, surchargeAmount: t.surchargeAmount,
  };
}

type Seen = { any: boolean; processing: boolean };

/** Error | ClientTransaction → PaymentResult. `seen` tells us whether money may already have moved. */
export function normalise(r: ZellerTxn | ZellerError, seen: Seen): PaymentResult {
  if (isErr(r)) {
    const type = (r as ZellerError).type ?? 'Operation Failure';
    const m = r.message || type;
    switch (type) {
      case 'Setup Required': return { kind: 'NOT_READY', reason: 'SETUP_REQUIRED', message: 'Terminal not paired — open Diagnostics ▸ Zeller ▸ Setup.' };
      case 'Network Failure': return seen.any ? { kind: 'UNKNOWN', reason: 'Network failed during payment' } : { kind: 'NOT_READY', reason: 'OFFLINE', message: 'No internet — card payments need a connection. Cash still works.' };
      case 'Operation Busy': return { kind: 'NOT_READY', reason: 'BUSY', message: 'Terminal is busy. Please wait and try again.' };
      case 'Paired Device Busy': return { kind: 'NOT_READY', reason: 'BUSY', message: 'The terminal is serving another register.' };
      case 'Paired Device Not Available': return { kind: 'NOT_READY', reason: 'TERMINAL_UNAVAILABLE', message: 'Can’t reach the terminal — check its power and Wi‑Fi.' };
      case 'Connection Failure': return seen.any ? { kind: 'UNKNOWN', reason: 'Connection dropped during payment' } : { kind: 'NOT_READY', reason: 'TERMINAL_UNAVAILABLE', message: 'Couldn’t connect to the terminal.' };
      case 'Operation Request Invalid': return { kind: 'NOT_READY', reason: 'INVALID_REQUEST', message: m };
      case 'Cancelled': return { kind: 'CANCELLED' };
      case 'Inactivity Timeout': return { kind: 'DECLINED', text: 'Customer didn’t respond — try again.', category: 'DECLINED_CUSTOMER_ACTION', retryable: true };
      case 'Card Declined': case 'Transaction Declined': return { kind: 'DECLINED', text: 'Card declined. Try another card.', category: 'DECLINED_TRY_OTHER_CARD', retryable: true };
      case 'Card Blocked': return { kind: 'DECLINED', text: 'Card blocked. Try another card.', category: 'DECLINED_TRY_OTHER_CARD', retryable: true };
      case 'Card Not Supported': return { kind: 'DECLINED', text: 'Card not supported. Try another card.', category: 'DECLINED_TRY_OTHER_CARD', retryable: true };
      case 'Card Read Failure': return { kind: 'DECLINED', text: 'Card read failed — tap, insert or swipe again.', category: 'DECLINED_CUSTOMER_ACTION', retryable: true };
      case 'Card Insert Required': return { kind: 'DECLINED', text: 'Please insert the card.', category: 'DECLINED_CUSTOMER_ACTION', retryable: true };
      default: return { kind: 'UNKNOWN', reason: `${type}: ${m}` }; // incl. Operation Interrupted & Transaction * timeouts
    }
  }
  const approved = r.$type === 'Approved' || r.status === 'APPROVED';
  if (approved) return { kind: 'APPROVED', txn: r };
  const info = lookupResponse(r.responseCode, r.responseText);
  if (info.category === 'CANCELLED') return { kind: 'CANCELLED' };
  if (info.unknownOutcome) return { kind: 'UNKNOWN', reason: info.message };
  return { kind: 'DECLINED', code: r.responseCode, text: info.message, category: info.category, retryable: info.retryable, txn: r };
}

/** Look a payment up by its reference (our `externalReference`). */
export async function reconcile(terminal: TerminalLike, reference: string): Promise<PaymentResult | { kind: 'NOT_FOUND' }> {
  const r = await terminal.getTransactions({ reference });
  if (isErr(r)) return { kind: 'UNKNOWN', reason: `Lookup failed: ${r.type ?? ''} ${r.message}` };
  const t = r.find(x => x.externalReference === reference) ?? (r.length === 1 ? r[0] : undefined);
  if (!t) return { kind: 'NOT_FOUND' };
  return normalise(t, { any: true, processing: true });
}

export type ChargeOpts = { amountCents: number; reference: string; sessionUuid?: string; terminalReceipt?: boolean };
export type ChargeHooks = { onStarted?: () => void | Promise<void>; onEvent?: (e: ZellerEvent) => void };

/**
 * Take a card payment. Persist the attempt BEFORE the SDK call (hooks.onStarted).
 * If the outcome is anything but a clean decline, reconcile with getTransactions before returning.
 */
export function startCharge(terminal: TerminalLike, o: ChargeOpts, hooks: ChargeHooks = {}) {
  let op: ReturnType<TerminalLike['purchase']> | undefined;
  let cancelled = false;
  const promise = (async (): Promise<PaymentResult> => {
    await hooks.onStarted?.();
    const seen: Seen = { any: false, processing: false };
    op = terminal.purchase({
      amount: o.amountCents, reference: o.reference, sessionUuid: o.sessionUuid,
      terminalReceipt: o.terminalReceipt ?? true,
    });
    op.onEvent?.(e => {
      seen.any = true;
      if (e.type === 'PROCESSING') seen.processing = true;
      hooks.onEvent?.(e);
    });
    const r = await op;
    let res = normalise(r, seen);
    if (res.kind === 'CANCELLED' || res.kind === 'UNKNOWN' || (res.kind === 'DECLINED' && seen.processing) || cancelled) {
      // "Cancel" only ATTEMPTS to cancel – the payment may still have completed.
      if (res.kind !== 'APPROVED' && (seen.any || res.kind === 'UNKNOWN')) {
        const rec = await reconcile(terminal, o.reference);
        if (rec.kind === 'APPROVED') res = rec;
        else if (rec.kind === 'UNKNOWN' && (seen.processing || res.kind === 'UNKNOWN')) res = { kind: 'UNKNOWN', reason: rec.reason };
      }
    }
    return res;
  })();
  return { promise, cancel: () => { cancelled = true; op?.cancel?.(); } };
}

export type RefundResult =
  | { kind: 'APPROVED'; txn: ZellerTxn }
  | { kind: 'FAILED'; text: string }
  | { kind: 'CANCELLED' }
  | { kind: 'UNKNOWN'; reason: string };

export function startRefund(terminal: TerminalLike, o: { purchaseRef: string; amountCents: number; reference: string }, hooks: ChargeHooks = {}) {
  let op: ReturnType<TerminalLike['refund']> | undefined;
  const promise = (async (): Promise<RefundResult> => {
    await hooks.onStarted?.();
    const seen: Seen = { any: false, processing: false };
    op = terminal.refund({ purchase: o.purchaseRef, amount: o.amountCents, reference: o.reference });
    op.onEvent?.(e => { seen.any = true; if (e.type === 'PROCESSING') seen.processing = true; hooks.onEvent?.(e); });
    const r = await op;
    if (isErr(r)) {
      const type = (r as ZellerError).type;
      if (type === 'Transaction Not Found') return { kind: 'FAILED', text: 'Zeller can’t find the original payment for this refund.' };
      if (type === 'Cancelled' && !seen.processing) return { kind: 'CANCELLED' };
      if (type === 'Setup Required') return { kind: 'FAILED', text: 'Terminal not paired.' };
      if (type === 'Operation Busy') return { kind: 'FAILED', text: 'Terminal is busy — try again.' };
      const rec = await reconcile(terminal, o.reference);
      if (rec.kind === 'APPROVED') return { kind: 'APPROVED', txn: rec.txn };
      if (rec.kind === 'NOT_FOUND' && !seen.processing) return { kind: 'FAILED', text: r.message || type };
      return { kind: 'UNKNOWN', reason: `${type}: ${r.message}` };
    }
    if (r.$type === 'Approved' || r.status === 'APPROVED') return { kind: 'APPROVED', txn: r };
    return { kind: 'FAILED', text: lookupResponse(r.responseCode, r.responseText).message };
  })();
  return { promise, cancel: () => op?.cancel?.() };
}
