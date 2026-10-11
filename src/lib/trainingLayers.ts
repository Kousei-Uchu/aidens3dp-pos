// Location: src/lib/trainingLayers.ts
// A native Modal (our Sheet) is drawn above everything, including the training overlay in App.tsx.
// So every layer that can show the overlay registers here, and only the newest one draws it.
const stack: string[] = []; const subs = new Set<() => void>(); let version = 0;
const bump = () => { version++; subs.forEach(f => f()); };
export const ROOT_LAYER = 'root';
export function pushLayer(id: string): void { if (!stack.includes(id)) { stack.push(id); bump(); } }
export function popLayer(id: string): void { const i = stack.indexOf(id); if (i >= 0) { stack.splice(i, 1); bump(); } }
export const topLayer = (): string => stack[stack.length - 1] ?? ROOT_LAYER;
export const layerDepth = (): number => stack.length;
export const subscribeLayers = (f: () => void): (() => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const layersVersion = (): number => version;
