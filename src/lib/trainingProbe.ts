// Location: src/lib/trainingProbe.ts
// A small read-only window onto Checkout's own screen state (B6): which tab and level it is on, and what has been typed.
// Checkout publishes here; training reads it. Checkout also registers a reset so a practice run always starts from a clean Checkout.
import type { GiftCheck, GiftSale, InvSnap, LookupMode } from './trainingModule';
export type Typed = { search?: string; keypad?: string };
/** The Inventory screen publishes here so training can tell which filter is on, what is searched, and what is keyed in the item window. */
let inv: InvSnap | undefined; export const setInvProbe = (x: InvSnap): void => { inv = x; }; export const clearInvProbe = (): void => { inv = undefined; }; export const getInvProbe = (): InvSnap | undefined => inv;
export type CheckoutWhere = { tab: 'keypad' | 'quick' | 'all'; depth: number; sizes: boolean };
let openLine: string | undefined; export const setOpenLine = (k: string | undefined): void => { openLine = k; }; export const getOpenLine = (): string | undefined => openLine;
/** A screen that replaces a page without being a window (the Return page, shown in place of Orders). It names its graph
 * screen here so guidance knows where the person is; cleared when it unmounts. */
let runtimeScreen: string | undefined; export const setRuntimeScreen = (id: string | undefined): void => { runtimeScreen = id; }; export const getRuntimeScreen = (): string | undefined => runtimeScreen;
let payOpen: 'cash' | 'gift' | 'split' | undefined; export const setPayOpen = (m: typeof payOpen): void => { payOpen = m; }; export const getPayOpen = (): typeof payOpen => payOpen;
/** The Sell gift card window publishes the last card it added here, so training can tell a handover card from an emailed one. */
let lastGift: GiftSale | undefined; export const setLastGiftProbe = (g: GiftSale | undefined): void => { lastGift = g; }; export const getLastGiftProbe = (): GiftSale | undefined => lastGift;
/** The Check gift card window publishes what is typed in its code box, and the last card it looked up, so training can watch a balance check. */
let giftCode = ''; export const setGiftCodeProbe = (v: string): void => { giftCode = v; }; export const getGiftCodeProbe = (): string => giftCode;
let giftCheck: GiftCheck | undefined; export const setGiftCheckProbe = (g: GiftCheck | undefined): void => { giftCheck = g; }; export const getGiftCheckProbe = (): GiftCheck | undefined => giftCheck;
let customerQuery = ''; export const setCustomerQuery = (q: string): void => { customerQuery = q; }; export const getCustomerQuery = (): string => customerQuery;
/** The Lookup sheet publishes its mode (price/stock) and the variant that was found. */
let lookupMode: LookupMode | undefined; export const setLookupModeProbe = (m: LookupMode | undefined): void => { lookupMode = m; }; export const getLookupModeProbe = (): LookupMode | undefined => lookupMode;
let lookupResult: { variantId: string; productTitle: string; stock: number | null; priceCents: number } | undefined; export const setLookupResultProbe = (r: typeof lookupResult): void => { lookupResult = r; }; export const getLookupResultProbe = (): typeof lookupResult => lookupResult;
export type CashProbe = { received: number; due: number; step: 'receive' | 'change' };
let cashProbe: CashProbe | undefined; export const setCashProbe = (c: CashProbe | undefined): void => { cashProbe = c; }; export const getCashProbe = (): CashProbe | undefined => cashProbe;
const priceDrafts: Record<string, string> = {}; export const setPriceDraft = (source: string, v: string): void => { priceDrafts[source] = v; }; export const getPriceDraft = (): string => Object.values(priceDrafts).find(Boolean) ?? '';
/** What is keyed in the open Discount window (the digits only, before Apply). */
let discountDraft = ''; export const setDiscountDraftProbe = (v: string): void => { discountDraft = v; }; export const getDiscountDraft = (): string => discountDraft;
export type CustomerDraft = { first: string; last: string; email: string; phone: string };
let customerDraft: CustomerDraft | undefined; export const setCustomerDraftProbe = (d: CustomerDraft | undefined): void => { customerDraft = d; }; export const getCustomerDraft = (): CustomerDraft | undefined => customerDraft;
let noteDraft = ''; export const setNoteDraftProbe = (q: string): void => { noteDraft = q; }; export const getNoteDraft = (): string => noteDraft;
/** What is typed in the Save cart window's Name box (empty when that window is closed). */
let savedName = ''; export const setSavedNameProbe = (v: string): void => { savedName = v; }; export const getSavedNameProbe = (): string => savedName;
let typed: Typed = {}; let where: CheckoutWhere | undefined; const resets = new Set<() => void>();
export const setProbe = (t: Typed, w: CheckoutWhere): void => { typed = t; where = w; };
export const clearProbe = (): void => { typed = {}; where = undefined; };
export const getTyped = (): Typed => typed;
export const getWhere = (): CheckoutWhere | undefined => where;
/** Several screens hold "how a run starts" state (Checkout itself, and the cart pane's "I have seen this review" note). Each registers its own reset. */
export const registerCheckoutReset = (f: () => void): (() => void) => { resets.add(f); return () => { resets.delete(f); }; };
/** Puts Checkout back to how a practice run starts: Quick Menu, first page, nothing typed, and no note that a price review has been seen. Does nothing when none of it is mounted. */
export const resetCheckout = (): void => { giftCode = ''; giftCheck = undefined; lookupMode = undefined; lookupResult = undefined; savedName = ''; for (const f of resets) { try { f(); } catch { /* a reset must never break training */ } } };
