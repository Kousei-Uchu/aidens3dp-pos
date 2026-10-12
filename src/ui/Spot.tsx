// Location: src/ui/Spot.tsx
// Spots: buttons, tiles and rows training can point at. A spot registers its view under an id, can be measured on screen,
// and tells training when it is tapped. Nothing here changes how anything looks or behaves.
import React, { useCallback, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { Rect } from '../lib/trainingGeometry';

const refs = new Map<string, Set<any>>();
const presses = new Set<(id: string) => void>();

/** Attach to any view's `ref`. With no id it does nothing. */
export function useSpotRef(id?: string): (node: any) => void {
  const last = useRef<{ id?: string; node: any }>({ node: null });
  return useCallback((node: any) => {
    const p = last.current; if (p.id && p.node) { refs.get(p.id)?.delete(p.node); if (!refs.get(p.id)?.size) refs.delete(p.id); }
    last.current = { id, node };
    if (id && node) { let set = refs.get(id); if (!set) { set = new Set(); refs.set(id, set); } set.add(node); }
  }, [id]);
}
/** The same registration without a hook, for views drawn inside a loop or a function (the terminal's screen). One stable callback per id. */
const forId = new Map<string, (node: any) => void>();
export function spotRefFor(id: string): (node: any) => void {
  let f = forId.get(id);
  if (!f) { let last: any = null; f = node => { if (last) { refs.get(id)?.delete(last); if (!refs.get(id)?.size) refs.delete(id); } last = node; if (node) { let set = refs.get(id); if (!set) { set = new Set(); refs.set(id, set); } set.add(node); } }; forId.set(id, f); }
  return f;
}
/** Call from an onPress. Cheap when training is not listening. */
export const spotPressed = (id?: string): void => { if (id) presses.forEach(f => f(id)); };
export const onSpotPressed = (f: (id: string) => void): (() => void) => { presses.add(f); return () => { presses.delete(f); }; };
export const spotMounted = (id: string): boolean => (refs.get(id)?.size ?? 0) > 0;

const measure = (node: any): Promise<Rect | null> => new Promise(res => { try { node.measureInWindow((x: number, y: number, w: number, h: number) => res(w > 0 && h > 0 ? { x, y, w, h } : null)); } catch { res(null); } });
/** Where this spot is in the window right now. A hidden or unmounted spot gives null. If several share an id, the first one on screen wins. */
export async function measureSpot(id: string): Promise<Rect | null> {
  const nodes = [...(refs.get(id) ?? [])]; if (!nodes.length) return null;
  for (const r of await Promise.all(nodes.map(measure))) if (r) return r;
  return null;
}
/** A plain wrapper for things that cannot take a ref themselves (a swipe row, a tab). */
export function Spot({ id, style, children }: { id?: string; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const ref = useSpotRef(id);
  return <View ref={ref} collapsable={false} style={style}>{children}</View>;
}
