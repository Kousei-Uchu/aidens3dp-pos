// Location: src/lib/trainingProbe.ts
// A small read-only window onto Checkout's own screen state (B6): which tab and level it is on, and what has been typed.
// Checkout publishes here; training reads it. Checkout also registers a reset so a practice run always starts from a clean Checkout.
export type Typed = { search?: string; keypad?: string };
export type CheckoutWhere = { tab: 'keypad' | 'quick' | 'all'; depth: number; sizes: boolean };
let openLine: string | undefined; export const setOpenLine = (k: string | undefined): void => { openLine = k; }; export const getOpenLine = (): string | undefined => openLine;
/** A screen that replaces a page without being a window (the Return page, shown in place of Orders). It names its graph
 * screen here so guidance knows where the person is; cleared when it unmounts. */
let runtimeScreen: string | undefined; export const setRuntimeScreen = (id: string | undefined): void => { runtimeScreen = id; }; export const getRuntimeScreen = (): string | undefined => runtimeScreen;
let payOpen: 'cash' | 'gift' | 'split' | undefined; export const setPayOpen = (m: typeof payOpen): void => { payOpen = m; }; export const getPayOpen = (): typeof payOpen => payOpen;
let customerQuery = ''; export const setCustomerQuery = (q: string): void => { customerQuery = q; }; export const getCustomerQuery = (): string => customerQuery;
export type CashProbe = { received: number; due: number; step: 'receive' | 'change' };
let cashProbe: CashProbe | undefined; export const setCashProbe = (c: CashProbe | undefined): void => { cashProbe = c; }; export const getCashProbe = (): CashProbe | undefined => cashProbe;
const priceDrafts: Record<string, string> = {}; export const setPriceDraft = (source: string, v: string): void => { priceDrafts[source] = v; }; export const getPriceDraft = (): string => Object.values(priceDrafts).find(Boolean) ?? '';
export type CustomerDraft = { first: string; last: string; email: string; phone: string };
let customerDraft: CustomerDraft | undefined; export const setCustomerDraftProbe = (d: CustomerDraft | undefined): void => { customerDraft = d; }; export const getCustomerDraft = (): CustomerDraft | undefined => customerDraft;
let noteDraft = ''; export const setNoteDraftProbe = (q: string): void => { noteDraft = q; }; export const getNoteDraft = (): string => noteDraft;
let typed: Typed = {}; let where: CheckoutWhere | undefined; const resets = new Set<() => void>();
export const setProbe = (t: Typed, w: CheckoutWhere): void => { typed = t; where = w; };
export const clearProbe = (): void => { typed = {}; where = undefined; };
export const getTyped = (): Typed => typed;
export const getWhere = (): CheckoutWhere | undefined => where;
/** Several screens hold "how a run starts" state (Checkout itself, and the cart pane's "I have seen this review" note). Each registers its own reset. */
export const registerCheckoutReset = (f: () => void): (() => void) => { resets.add(f); return () => { resets.delete(f); }; };
/** Puts Checkout back to how a practice run starts: Quick Menu, first page, nothing typed, and no note that a price review has been seen. Does nothing when none of it is mounted. */
export const resetCheckout = (): void => { for (const f of resets) { try { f(); } catch { /* a reset must never break training */ } } };
