// Location: src/lib/trainingDemo.ts
// The Show stage (B6): works out what an animated demonstration looks like at each step. Pure: DemoView just draws and animates what this returns.
// A demo is simplified copies of real screens in a fixed canvas. Steps change them and a camera, a pointer and a spotlight guide the eye.
import type { Demo, DemoNode } from './trainingModule';
import { grow, placeBubble, type Rect } from './trainingGeometry';
import { isGesture, type Gesture } from './pointerGesture';

export type NodeView = DemoNode & { hidden: boolean; screen: string };
export type DemoState = { screen: string; nodes: Map<string, NodeView> };

/** The deepest the camera zooms. Beyond this the mock turns soft and the surroundings are lost. */
export const MAX_ZOOM = 2.2;
/**
 * How many layout points one canvas unit gets: the overall scale at maximum zoom (`MAX_ZOOM` times the fit of the canvas into `viewW`).
 * The canvas is laid out at this size and the camera only ever shrinks it, so text and edges are drawn at full resolution
 * instead of being stretched up (which is what made zoomed-in text look pixelated).
 */
export const renderScale = (viewW: number, canvasW: number): number => Math.max(0.25, (viewW / Math.max(1, canvasW)) * MAX_ZOOM);
/** How much of the view a zoomed-in target may fill. */
const FILL = 0.5;
/** Room kept round a target inside the view, in canvas units. */
const VIEW_MARGIN = 14;

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
  // Whatever zoom was asked for, the target itself must stay fully in view with a little room round it.
  const fits = Math.min(canvas.w / (rect.w + 2 * VIEW_MARGIN), canvas.h / (rect.h + 2 * VIEW_MARGIN));
  const z = Math.max(1, Math.min(MAX_ZOOM, zoom ?? auto, fits));
  const hw = canvas.w / (2 * z); const hh = canvas.h / (2 * z);
  return { zoom: z, cx: Math.max(hw, Math.min(canvas.w - hw, rect.x + rect.w / 2)), cy: Math.max(hh, Math.min(canvas.h - hh, rect.y + rect.h / 2)) };
}
/** The biggest copy of the canvas, same shape, that fits in `avail`. Zero when nothing has been measured yet. */
export function fitBox(avail: { w: number; h: number }, canvas: { w: number; h: number }): { w: number; h: number } {
  if (!(avail.w > 0 && avail.h > 0 && canvas.w > 0 && canvas.h > 0)) return { w: 0, h: 0 };
  const w = Math.min(avail.w, (avail.h * canvas.w) / canvas.h); return { w, h: (w * canvas.h) / canvas.w };
}
/**
 * How the Info and Show page is arranged so the whole picture, the words and the buttons are on screen at once with no scrolling:
 * wide windows (landscape) put the words and buttons in a column beside the picture, tall windows put them underneath.
 */
export const demoLayout = (win: { w: number; h: number }): 'side' | 'stack' => (win.w > win.h ? 'side' : 'stack');
/** The part of the canvas a camera can see. */
export const viewRect = (canvas: { w: number; h: number }, cam: Camera): Rect => ({ x: cam.cx - canvas.w / (2 * cam.zoom), y: cam.cy - canvas.h / (2 * cam.zoom), w: canvas.w / cam.zoom, h: canvas.h / cam.zoom });

export type NoteSide = 'above' | 'below' | 'left' | 'right';
/** `arrow` is how far along the note's edge the arrow sits: across for above and below, down for left and right. */
export type Note = { text: string; x: number; y: number; w: number; h: number; side: NoteSide; arrow: number };
const NOTE_W = 150; const NOTE_GAP = 10; const NOTE_EDGE = 6;
/** Room for `text` at the note's size (canvas units): about 20 characters to a line. */
export const noteSize = (text: string): { w: number; h: number } => ({ w: NOTE_W, h: 18 + Math.max(1, Math.ceil(text.length / 20)) * 17 });
const inside = (r: Rect, v: Rect, e: number): boolean => r.x >= v.x + e && r.y >= v.y + e && r.x + r.w <= v.x + v.w - e && r.y + r.h <= v.y + v.h - e;
/**
 * A small label with an arrow, put beside the ringed area where it is fully inside `view` (the part of the canvas the camera can see,
 * not the whole canvas). Tries below, above, right, then left. Returns null when no side has room, so the caller can zoom out a little.
 */
export function noteFor(view: Rect, focus: Rect, text: string): Note | null {
  const { w, h } = noteSize(text); const f = grow(focus, 6); const cx = focus.x + focus.w / 2; const cy = focus.y + focus.h / 2;
  const clampX = (x: number) => Math.max(view.x + NOTE_EDGE, Math.min(x, view.x + view.w - w - NOTE_EDGE)); const clampY = (y: number) => Math.max(view.y + NOTE_EDGE, Math.min(y, view.y + view.h - h - NOTE_EDGE));
  const tries: { side: NoteSide; x: number; y: number }[] = [
    { side: 'below', x: clampX(cx - w / 2), y: f.y + f.h + NOTE_GAP }, { side: 'above', x: clampX(cx - w / 2), y: f.y - NOTE_GAP - h },
    { side: 'right', x: f.x + f.w + NOTE_GAP, y: clampY(cy - h / 2) }, { side: 'left', x: f.x - NOTE_GAP - w, y: clampY(cy - h / 2) },
  ];
  for (const t of tries) {
    const r = { x: t.x, y: t.y, w, h }; if (!inside(r, view, NOTE_EDGE)) continue;
    const across = t.side === 'above' || t.side === 'below';
    return { text, x: t.x, y: t.y, w, h, side: t.side, arrow: across ? Math.max(14, Math.min(cx - t.x, w - 14)) : Math.max(14, Math.min(cy - t.y, h - 14)) };
  }
  return null;
}

/**
 * Where the camera settles on `focus` so that the target AND its note are both fully visible: starts at the wanted zoom and eases out until both fit.
 * At zoom 1 the whole canvas is visible, so a note always fits there; the last resort puts it in the nearest corner of the canvas.
 */
export function settleOn(canvas: { w: number; h: number }, focus: Rect | null, text: string | undefined, zoom?: number): { cam: Camera; note: Note | null } {
  if (!focus) return { cam: cameraFor(canvas, null), note: null };
  let z = cameraFor(canvas, focus, zoom).zoom;
  for (;;) {
    const cam = cameraFor(canvas, focus, z);
    if (!text) return { cam, note: null };
    const note = noteFor(viewRect(canvas, cam), focus, text);
    if (note) return { cam, note };
    if (cam.zoom <= 1) break;
    z = Math.max(1, cam.zoom - 0.1);
  }
  const cam = cameraFor(canvas, focus, 1); const { w, h } = noteSize(text!); const cx = focus.x + focus.w / 2;
  const x = Math.max(NOTE_EDGE, Math.min(cx - w / 2, canvas.w - w - NOTE_EDGE)); const below = focus.y + focus.h / 2 < canvas.h / 2;
  return { cam, note: { text: text!, x, y: below ? canvas.h - h - NOTE_EDGE : NOTE_EDGE, w, h, side: below ? 'above' : 'below', arrow: Math.max(14, Math.min(cx - x, w - 14)) } };
}

export type StepPlan = {
  index: number; say: string; title?: string;
  /** Where the camera and ring go first (the tapped control, else the focus), or null for the whole screen. */
  look: Rect | null; lookCam: Camera;
  /** The control the pointer taps, and the point it moves to. */
  tap: Rect | null; tapId: string | null; tapPoint: { x: number; y: number } | null;
  /** How the pointer reaches the control: a tap unless the step says otherwise. */
  gesture: Gesture;
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
  const look = tap ?? focus; const settled = settleOn(demo.canvas, focus, st.note, st.zoom);
  return {
    index, say: st.say, title: st.title,
    look, lookCam: cameraFor(demo.canvas, look, st.zoom), tap, tapId: tapN ? tapN.id : null, tapPoint: tap ? { x: tap.x + tap.w / 2, y: tap.y + tap.h / 2 } : null, gesture: st.gesture ?? 'tap',
    focus, focusCam: settled.cam,
    note: settled.note,
    changes: !!st.screen || Object.keys(st.set ?? {}).length > 0,
  };
}

/** Average width of a glyph as a share of the font size, for the bold UI text used in the mock. A little generous on purpose. */
const GLYPH = 0.58; const LINE = 1.3;
const tw = (t: string | undefined, size: number): number => (t ? t.length * size * GLYPH : 0);
/**
 * Where text will not fit its box, as plain sentences. This is an estimate (real widths depend on the font), checked when a course is written
 * so a label is never cut off on screen: one line labels must fit their width, wrapping text must fit its height.
 */
export function textProblems(n: DemoNode): string[] {
  const out: string[] = []; const one = (what: string, text: string | undefined, size: number, avail: number) => { if (text && tw(text, size) > avail) out.push(`"${n.id}": the ${what} "${text}" is too long for its box (about ${Math.round(tw(text, size))} wide, ${Math.max(0, Math.round(avail))} available)`); };
  const sz = n.size;
  switch (n.kind) {
    case 'button': one('label', n.label, sz ?? 12, n.w - 12 - (n.icon ? 19 : 0)); break;
    case 'tile': one('label', n.label, 11, n.w - 14); one('second line', n.sub, 10, n.w - 14); break;
    case 'row': { const avail = n.w - 16 - (n.icon ? 24 : 0) - (n.value ? tw(n.value, 12) + 8 : 0); one('label', n.label, 12, avail); one('second line', n.sub, 10, avail); if (n.sub && n.h < 30) out.push(`"${n.id}": a row with a second line needs a height of at least 30`); break; }
    case 'bar': one('title', n.label, 15, n.w - 24 - tw(n.sub, 11) - 12); break;
    case 'chip': one('label', n.label, 11, n.w - 12); break;
    case 'field': one('text', n.value ?? n.label, sz ?? 12, n.w - 18); break;
    case 'toggle': one('label', n.label, 12, n.w - 16 - 46); break;
    case 'panel': one('label', n.label, 10, n.w - 16); break;
    case 'text': {
      const size = sz ?? 13; const lines = (t: string | undefined, fs: number) => (t ? Math.max(1, Math.ceil(tw(t, fs) / Math.max(1, n.w))) * fs * LINE : 0);
      const need = lines(n.label, size) + lines(n.sub, Math.max(9, size - 2));
      if (need > n.h + 2) out.push(`"${n.id}": the text needs about ${Math.round(need)} of height but the box is ${n.h}`);
      break;
    }
  }
  return out;
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
    for (const e of textProblems(n)) at(e);
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
    if (st.gesture !== undefined && !isGesture(st.gesture)) at(`${w8} has the unknown gesture "${String(st.gesture)}"`);
    if (st.gesture !== undefined && !st.tap) at(`${w8} has a gesture but nothing to do it on (add a tap)`);
    // What is on screen when the step plays: the pointer taps before the step's changes, the ring settles after them.
    const before = demoStateAfter(demo, i - 1); const after = demoStateAfter(demo, i);
    const t = st.tap ? before.nodes.get(st.tap) : undefined;
    if (t && (t.screen !== before.screen || t.hidden)) at(`${w8} taps "${st.tap}", which is not on screen at that moment`);
    const f = st.focus ? after.nodes.get(st.focus) : undefined;
    if (f && (f.screen !== after.screen || f.hidden)) at(`${w8} focuses "${st.focus}", which is not on screen once the step has happened`);
    for (const [id, fx] of Object.entries(st.set ?? {})) {
      if (fx.icon && !isIcon(fx.icon)) at(`${w8} gives "${id}" the icon "${fx.icon}", which does not exist`);
      const nv = after.nodes.get(id); if (nv && (fx.label !== undefined || fx.sub !== undefined || fx.value !== undefined)) for (const e of textProblems(nv)) at(`${w8} makes ${e}`);
    }
  });
  return bad;
}
