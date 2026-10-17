// Location: src/lib/scanBridge.ts
// With the grid and the cart side by side there is ONE Bluetooth scan box (Checkout's). The cart pane cannot own a second one: two boxes fight
// for focus and the scan lands in either. Instead the cart pane registers here, and Checkout hands it the scans that need the cart's windows
// (gift cards, discounts) and asks whether a cart window is open (then Checkout's box stays quiet). Tiny store, no React import beyond the hook.
import { useSyncExternalStore } from 'react';

export type CartScan = {
  /** A cart window is open (menu, a sheet, the camera, the line editor, a review): the scan box must not listen. */
  blocked: boolean;
  /** Handle a gift card or discount scan. Returns the short confirmation shown by the camera screen, or null. */
  scan: (code: string) => string | null;
};

let current: CartScan | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

/** The cart pane calls this when it is shown beside the grid; the returned function removes it. */
export function registerCartScan(c: CartScan): () => void {
  current = c; emit();
  return () => { if (current === c) { current = null; emit(); } };
}
export const getCartScan = (): CartScan | null => current;
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** True while a cart pane is beside the grid and one of its windows is open. */
export const useCartScanBlocked = (): boolean => useSyncExternalStore(subscribe, () => !!current?.blocked);
/** Test helper. */
export const resetCartScan = (): void => { current = null; subs.clear(); };
