// Location: src/lib/trainingDemo.ts
// The Show stage (B6): works out what an animated demonstration looks like at each step. Pure: DemoView just draws and animates what this returns.
// A demo is simplified copies of real screens in a fixed canvas. Steps change them and a camera, a pointer and a spotlight guide the eye.
import type { Demo, DemoNode } from './trainingModule';
import { grow, placeBubble, type Rect } from './trainingGeometry';

export type NodeView = DemoNode & { hidden: boolean; screen: string };
export type DemoState = { screen: string; nodes: Map<string, NodeView> };

/** The deepest the camera zooms. Beyond this the mock turns soft and the surroundings are lost. */
export const MAX_ZOOM = 2.2;
/** How much of the view a zoomed-in target may fill. */
const FILL = 0.5;

/** Every node by id, with the screen it lives on. */
export function nodeIndex(demo: Demo): Map<string, NodeView> {
  const m = new Map<string, NodeView>();
  for (const sc of demo.screens) for (const n of sc.nodes) m.set(n.id, { ...n, hidden: !!n.hidden, screen: sc.id });
  return m;
}

/** The demo after steps 0 to `upto` (inclusive) have happened. -1 means none: the starting picture. Out of range is clamped. */
export function demoStateAfter(demo: Demo, upto: number): DemoState {
  const nodes = nodeIndex(demo); let screen = demo.screens[0]?.id ?? '';
  const last = Math.min(upto, demo.steps.length - 1);
  for (let i = 0; i <= last; i++) {
    const st = demo.steps[i];
    if (st.screen) screen = st.screen;
    for (const [id, fx] of Object.entries(st.set ?? {})) { const n = nodes.get(id); if (n) nodes.set(id, { ...n, ...fx, hidden: fx.hidden ?? n.hidden }); }
  }
  return { screen, nodes };
}

const rectOf = (n: DemoNode): Rect => ({ x: n.x, y: n.y, w: n.w, h: n.h });
export type Camera = { zoom: number; cx: number; cy: number };

/**
 * Where the camera should be to look at `rect` (or the whole canvas when there is none): how far in, and which canvas point sits in the middle.
 * The view never slides past the edge of the canvas, so there is never empty space around the mock.
 */
export function cameraFor(canvas: { w: number; h: number }, rect: Rect | null, zoom?: number): Camera {
  if (!rect) return { zoom: 1, cx: canvas.w / 2, cy: canvas.h / 2 };
  const auto = Math.min((canvas.w * FILL) / Math.max(1, rect.w), (canvas.h * FILL) / Math.max(1, rect.h));
  const z = Math.max(1, Math.min(MAX_ZOOM, zoom ?? auto));
  const hw = canvas.w / (2 * z); const hh = canvas.h / (2 * z);
  return { zoom: z, cx: Math.max(hw, Math.min(canvas.w - hw, rect.x + rect.w / 2)), cy: Math.max(hh, Math.min(canvas.h - hh, rect.y + rect.h / 2)) };
}

export type Note = { text: string; x: number; y: number; w: number; h: number; side: 'above' | 'below'; arrowX: number };
const NOTE_W = 150;
/** A small label with an arrow, put next to the ringed area, kept inside the canvas. */
export function noteFor(canvas: { w: number; h: number }, focus: Rect, text: string): Note {
  const lines = Math.max(1, Math.ceil(text.length / 20)); const h = 18 + lines * 17;
  const b = placeBubble(grow(focus, 6), canvas, { w: NOTE_W, h }, 10, 6);
  return { text, x: b.x, y: b.y, w: NOTE_W, h, side: b.side, arrowX: b.arrowX };
}

export type StepPlan = {
  index: number; say: string; title?: string;
  /** Where the camera and ring go first (the tapped control, else the focus), or null for the whole screen. */
  look: Rect | null; lookCam: Camera;
  /** The control the pointer taps, and the point it moves to. */
  tap: Rect | null; tapId: string | null; tapPoint: { x: number; y: number } | null;
  /** Where the camera and ring settle once the step has happened, or null for the whole screen. */
  focus: Rect | null; focusCam: Camera;
  note: Note | null;
  /** True when the step changes the screen or any node, so there is something to wait for after the tap. */
  changes: boolean;
};

/** Everything DemoView needs to play step `i`. Out of range indexes are clamped. */
export function planStep(demo: Demo, i: number): StepPlan {
  const index = Math.max(0, Math.min(i, demo.steps.length - 1)); const st = demo.steps[index]; const nodes = nodeIndex(demo);
  const tapN = st.tap ? nodes.get(st.tap) : undefined; const focusN = st.focus ? nodes.get(st.focus) : undefined;
  const tap = tapN ? rectOf(tapN) : null; const focus = focusN ? rectOf(focusN) : tap;
  const look = tap ?? focus;
  return {
    index, say: st.say, title: st.title,
    look, lookCam: cameraFor(demo.canvas, look, st.zoom), tap, tapId: tapN ? tapN.id : null, tapPoint: tap ? { x: tap.x + tap.w / 2, y: tap.y + tap.h / 2 } : null,
    focus, focusCam: cameraFor(demo.canvas, focus, st.zoom),
    note: st.note && focus ? noteFor(demo.canvas, focus, st.note) : null,
    changes: !!st.screen || Object.keys(st.set ?? {}).length > 0,
  };
}

/** Every problem with a demo, as plain sentences (the module checker adds the module id). Empty list = fine. */
export function validateDemo(demo: Demo, isIcon: (name: string) => boolean = () => true): string[] {
  const bad: string[] = []; const at = (t: string) => bad.push(t);
  const { w, h } = demo.canvas;
  if (!(w > 0 && h > 0)) at('the canvas needs a width and a height');
  if (!demo.screens.length) at('needs at least one screen');
  const screenIds = new Set(demo.screens.map(s => s.id)); if (screenIds.size !== demo.screens.length) at('screen ids repeat');
  const seen = new Set<string>();
  for (const sc of demo.screens) for (const n of sc.nodes) {
    if (seen.has(n.id)) at(`the id "${n.id}" is used twice (ids are shared by every screen)`); seen.add(n.id);
    if (n.x < 0 || n.y < 0 || n.x + n.w > w + 0.5 || n.y + n.h > h + 0.5) at(`"${n.id}" does not fit inside the canvas`);
    if (n.icon && !isIcon(n.icon)) at(`"${n.id}" uses the icon "${n.icon}", which does not exist`);
  }
  if (demo.steps.length < 3) at('needs at least 3 steps');
  const ids = new Set<string>();
  demo.steps.forEach((st, i) => {
    const n = i + 1; const w8 = `step ${n}`;
    if (!st.say.trim()) at(`${w8} says nothing`);
    if (st.id) { if (ids.has(st.id)) at(`${w8} repeats the id "${st.id}"`); ids.add(st.id); }
    if (st.screen && !screenIds.has(st.screen)) at(`${w8} goes to the unknown screen "${st.screen}"`);
    for (const [what, id] of [['focus', st.focus], ['tap', st.tap]] as const) if (id && !seen.has(id)) at(`${w8} has a ${what} on the unknown item "${id}"`);
    for (const id of Object.keys(st.set ?? {})) if (!seen.has(id)) at(`${w8} changes the unknown item "${id}"`);
    if (st.zoom !== undefined && !(st.zoom >= 1 && st.zoom <= MAX_ZOOM)) at(`${w8} zoom must be between 1 and ${MAX_ZOOM}`);
    if (st.note && !st.focus && !st.tap) at(`${w8} has a note but nothing to point at`);
    // What is on screen when the step plays: the pointer taps before the step's changes, the ring settles after them.
    const before = demoStateAfter(demo, i - 1); const after = demoStateAfter(demo, i);
    const t = st.tap ? before.nodes.get(st.tap) : undefined;
    if (t && (t.screen !== before.screen || t.hidden)) at(`${w8} taps "${st.tap}", which is not on screen at that moment`);
    const f = st.focus ? after.nodes.get(st.focus) : undefined;
    if (f && (f.screen !== after.screen || f.hidden)) at(`${w8} focuses "${st.focus}", which is not on screen once the step has happened`);
    for (const [id, fx] of Object.entries(st.set ?? {})) { if (fx.icon && !isIcon(fx.icon)) at(`${w8} gives "${id}" the icon "${fx.icon}", which does not exist`); }
  });
  return bad;
}
