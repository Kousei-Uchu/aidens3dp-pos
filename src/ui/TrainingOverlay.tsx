// Location: src/ui/TrainingOverlay.tsx
// Draws the spotlight, the ring, the pointer and the speech bubble. The pointer is the ring's orange, a little see-through, and never takes a touch; it is left out on steps that wait for Next or where the person types (0113). Guide dims everything but the target (taps pass through the hole).
// Check never dims: it only rings the answer when the hints run out. Only the topmost layer (the page, or the newest sheet) draws.
// Uses plain React Native views, not ../ui/kit, because kit imports this file.
//
// Animated (0074). The spotlight glides from one target to the next (it closes in from a wider ring the first time), the ring pulses, a pointer glides
// along and taps, the bubble glides and swaps its words with a fade, a small green burst marks each finished step, and a bar shows how far along you are.
// The dim blocks use layout values (they must block touches exactly where they are drawn), so they animate on the JS thread: that is four views.
// Everything else (ring pulse, pointer, burst, bubble words) uses the native driver.
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from './theme';
import { useSpotlight } from './spotlight';
import Swap from './Swap';
import HintToast from './HintToast';
import { Enter, useReduceMotion } from './Motion';
import { ROOT_LAYER, layersVersion, subscribeLayers, topLayer } from '../lib/trainingLayers';
import { centred, grow, onScreen, placeBubble, placeNotice, type Rect, type Size, type Slot } from '../lib/trainingGeometry';
import { HOLD_MS, glideMs, irisStart, isTinyMove, segments } from '../lib/guideMotion';
import { GESTURE_LABEL, gesturePlan, tapCount, type Gesture } from '../lib/pointerGesture';
import { useTraining, type DockView } from '../state/trainingSession';
import { trainingActions } from './trainingActions';

export const useIsTopLayer = (layer: string): boolean => { useSyncExternalStore(subscribeLayers, layersVersion, layersVersion); return topLayer() === layer; };
const clampPos = (v: Animated.AnimatedInterpolation<number> | Animated.AnimatedSubtraction<number> | Animated.AnimatedAddition<number> | Animated.Value) => v.interpolate({ inputRange: [0, 100000], outputRange: [0, 100000], extrapolate: 'clamp' });
type RectVals = { x: Animated.Value; y: Animated.Value; w: Animated.Value; h: Animated.Value };

/** Moves four values to follow `rect`: closes in from a wider ring the first time, glides after that, snaps for tiny re-measures, and does nothing while rect is null. */
function useRectGlide(rect: Rect | null, screen: Size, reduce: boolean): RectVals {
  const v = useRef<RectVals>({ x: new Animated.Value(0), y: new Animated.Value(0), w: new Animated.Value(0), h: new Animated.Value(0) }).current;
  const last = useRef<Rect | null>(null);
  const key = rect ? `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.w)},${Math.round(rect.h)}` : '';
  useEffect(() => {
    if (!rect) { last.current = null; return undefined; }
    const set = (r: Rect) => { v.x.setValue(r.x); v.y.setValue(r.y); v.w.setValue(r.w); v.h.setValue(r.h); };
    const prev = last.current; last.current = rect;
    if (reduce || isTinyMove(prev, rect)) { set(rect); return undefined; }
    if (!prev) set(irisStart(rect, screen));
    const ms = glideMs(prev, rect); const e = Easing.bezier(0.22, 1, 0.36, 1);
    const a = Animated.parallel([v.x, v.y, v.w, v.h].map((val, i) => Animated.timing(val, { toValue: [rect.x, rect.y, rect.w, rect.h][i], duration: ms, easing: e, useNativeDriver: false })));
    a.start(); return () => a.stop();
  }, [key, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

/** Shown at the top or bottom edge when the spot is off screen or cut off: which way to scroll. It never takes touches. */
function ScrollCue({ dir, color, on }: { dir: 'up' | 'down'; color: string; on: string }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, [dir === 'down' ? 'bottom' : 'top']: dir === 'down' ? 96 : 70, alignItems: 'center' }}>
      <View accessible accessibilityLabel={`Scroll ${dir}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: color, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
        <Ionicons name={dir === 'down' ? 'chevron-down' : 'chevron-up'} size={18} color={on} />
        <Text style={{ color: on, fontSize: 14, fontWeight: '800' }}>Scroll {dir}</Text>
      </View>
    </View>
  );
}
/** The ring: it pulses (native), and its box follows the glide (layout, so it sits in an outer view). */
function Ring({ vals, color }: { vals: RectVals; color: string }) {
  const a = useRef(new Animated.Value(0.5)).current;
  useEffect(() => { const l = Animated.loop(Animated.sequence([Animated.timing(a, { toValue: 1, duration: 650, useNativeDriver: true }), Animated.timing(a, { toValue: 0.5, duration: 650, useNativeDriver: true })])); l.start(); return () => l.stop(); }, [a]);
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: Animated.subtract(vals.x, 6), top: Animated.subtract(vals.y, 6), width: Animated.add(vals.w, 12), height: Animated.add(vals.h, 12) }}>
      <Animated.View style={{ flex: 1, borderRadius: 14, borderWidth: 3, borderColor: color, opacity: a, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }} />
    </Animated.View>
  );
}

/**
 * The animated cursor. It glides in and then loops the gesture the step asks for (see src/lib/pointerGesture.ts): a tap, a double or triple tap
 * with a count by the cursor, press and hold with a ring that fills, a swipe that drags across the target, or a two-stroke scroll.
 * All native driven. The ripple and the hold ring ride with the cursor, so they always land where the finger is.
 */
function Pointer({ hole, color, on, reduce, gesture }: { hole: Rect; color: string; on: string; reduce: boolean; gesture: Gesture }) {
  const key = `${gesture}|${Math.round(hole.x)},${Math.round(hole.y)},${Math.round(hole.w)},${Math.round(hole.h)}`;
  const plan = useMemo(() => gesturePlan(gesture, hole), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const px = useRef(new Animated.Value(plan.start.x)).current; const py = useRef(new Animated.Value(plan.start.y)).current; const o = useRef(new Animated.Value(0)).current;
  const down = useRef(new Animated.Value(0)).current; const rip = useRef(new Animated.Value(0)).current; const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const quick = (v: Animated.Value, to: number, ms: number, easing?: (t: number) => number) => Animated.timing(v, { toValue: to, duration: ms, easing, useNativeDriver: true });
    const fade = quick(o, 1, 220);
    if (reduce) { const c = plan.moves[plan.moves.length - 1] ?? plan.start; px.setValue(c.x); py.setValue(c.y); down.setValue(0); fade.start(); return () => fade.stop(); }
    const move = Easing.bezier(0.22, 1, 0.36, 1);
    const seq: Animated.CompositeAnimation[] = [Animated.parallel([quick(px, plan.start.x, 1), quick(py, plan.start.y, 1), quick(down, 0, 1), quick(rip, 0, 1), quick(ring, 0, 1)])];
    for (const m of plan.moves) {
      const par: Animated.CompositeAnimation[] = [quick(px, m.x, m.ms, m.drag ? Easing.inOut(Easing.quad) : move), quick(py, m.y, m.ms, m.drag ? Easing.inOut(Easing.quad) : move), quick(down, m.down ? 1 : 0, Math.min(m.ms, 140))];
      if (m.ripple) par.push(Animated.sequence([quick(rip, 0, 1), quick(rip, 1, 460, Easing.out(Easing.quad))]));
      if (m.hold) par.push(Animated.sequence([quick(ring, 0, 1), quick(ring, 1, m.ms, Easing.linear)]));
      seq.push(Animated.parallel(par));
    }
    seq.push(Animated.delay(plan.restMs));
    const loop = Animated.loop(Animated.sequence(seq)); fade.start(); loop.start(); return () => { fade.stop(); loop.stop(); };
  }, [plan, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = tapCount(gesture);
  return (
    <Animated.View accessibilityLabel={GESTURE_LABEL[gesture]} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, opacity: o.interpolate({ inputRange: [0, 1], outputRange: [0, 0.8] }), transform: [{ translateX: px }, { translateY: py }] }}>
      <Animated.View style={{ position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: color, opacity: rip.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.9, 0] }), transform: [{ scale: rip.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.6] }) }] }} />
      {gesture === 'hold' ? <Animated.View style={{ position: 'absolute', left: -26, top: -26, width: 52, height: 52, borderRadius: 26, borderWidth: 4, borderColor: color, opacity: ring.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 0.9, 0.9] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.15] }) }] }} /> : null}
      <Animated.View style={{ position: 'absolute', left: -12, top: -12, width: 28, height: 28, transform: [{ scale: down.interpolate({ inputRange: [0, 1], outputRange: [1, 0.84] }) }] }}>
        <View style={{ transform: [{ rotate: '-90deg' }] }}><Ionicons name="navigate" size={28} color={color} style={{ textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 3 }} /></View>
      </Animated.View>
      {n > 1 ? <View style={{ position: 'absolute', left: 14, top: -30, backgroundColor: color, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 }}><Text style={{ color: on, fontSize: 12, fontWeight: '800' }}>×{n}</Text></View> : null}
    </Animated.View>
  );
}

/** A green ring and tick that bloom where the last target was, each time a step is finished. */
function Burst({ rect, good }: { rect: Rect; good: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { const a = Animated.timing(v, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }); a.start(); return () => a.stop(); }, [v]);
  const cx = rect.x + rect.w / 2; const cy = rect.y + rect.h / 2; const d = Math.max(60, Math.min(rect.w, rect.h) + 30);
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: cx - d / 2, top: cy - d / 2, width: d, height: d, alignItems: 'center', justifyContent: 'center', opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.5] }) }] }}>
      <View style={{ position: 'absolute', width: d, height: d, borderRadius: d / 2, borderWidth: 4, borderColor: good }} />
      <Ionicons name="checkmark-circle" size={Math.min(52, d * 0.6)} color={good} />
    </Animated.View>
  );
}

/**
 * A card that floats at the edge of the screen and moves itself out of the way of what the person needs to tap (`avoid`).
 * It keeps its place while that stays clear, and glides to a new one when the target moves under it.
 */
function Floating({ avoid, screen, top, bottom, prefer, maxW = 520, pointerEvents, children }: { avoid: Rect[]; screen: Size; top?: number; bottom?: number; prefer?: 'top' | 'bottom'; maxW?: number; pointerEvents: 'box-none' | 'none'; children: React.ReactNode }) {
  // The measured area stays about the same while the width glides, so the 600 threshold below stops it re-rendering every frame.
  const reduce = useReduceMotion(); const [m, setM] = useState<Size>({ w: Math.min(maxW, screen.w - 24), h: 110 }); const stick = useRef<Slot | undefined>(undefined);
  const p = placeNotice({ screen, size: m, avoid, prefer, top, bottom, maxW, stick: stick.current }); stick.current = p.slot;
  const ax = useRef(new Animated.Value(p.x)).current; const ay = useRef(new Animated.Value(p.y)).current; const aw = useRef(new Animated.Value(p.w)).current; const placed = useRef(false);
  useEffect(() => {
    if (!placed.current || reduce) { ax.setValue(p.x); ay.setValue(p.y); aw.setValue(p.w); placed.current = true; return undefined; }
    const e = Easing.bezier(0.22, 1, 0.36, 1);
    const a = Animated.parallel([ax, ay, aw].map((v, i) => Animated.timing(v, { toValue: [p.x, p.y, p.w][i], duration: 360, easing: e, useNativeDriver: false })));
    a.start(); return () => a.stop();
  }, [Math.round(p.x), Math.round(p.y), Math.round(p.w), reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View pointerEvents={pointerEvents} onLayout={e => { const { width, height } = e.nativeEvent.layout; if (width > 0 && height > 0 && Math.abs(width * height - m.w * m.h) > 600) setM({ w: width, h: height }); }} style={{ position: 'absolute', left: ax, top: ay, width: aw }}>
      {children}
    </Animated.View>
  );
}

type StrayView = NonNullable<DockView['stray']>;
/**
 * The off-course card. It says what happened and, when this person has not finished the module that teaches the fix, shows the steps at once.
 * If they have finished it, the steps wait behind a small "?" button (and Hint opens them too), so nobody who did the module a while ago is left stuck.
 */
function StrayCard({ stray }: { stray: StrayView }) {
  const { c } = useTheme(); const [open, setOpen] = useState(stray.showHow); const nonce = useTraining(s => s.howNonce); const seen = useRef(nonce);
  useEffect(() => { if (nonce !== seen.current) { seen.current = nonce; setOpen(true); } }, [nonce]);
  const canHelp = stray.how.length > 0;
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 16, borderWidth: 2, borderColor: c.warn, padding: 14, gap: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="compass" size={20} color={c.warn} />
        <Text style={{ color: c.warn, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', flex: 1 }}>Off course: {stray.title}</Text>
        {canHelp ? <Pressable onPress={() => setOpen(o => !o)} hitSlop={8} accessibilityRole="button" accessibilityLabel={open ? 'Hide the steps' : 'How do I do this?'} accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name={open ? 'chevron-up-circle' : 'help-circle'} size={24} color={c.warn} />{open ? null : <Text style={{ color: c.warn, fontSize: 12, fontWeight: '700' }}>How?</Text>}</Pressable> : null}
      </View>
      <Text style={{ color: c.text, fontSize: 16, lineHeight: 22 }}>{stray.say}</Text>
      {canHelp && open ? (
        <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 8 }}>
          <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>How to put it right</Text>
          {stray.how.map((h, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.warn, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}><Text style={{ color: '#111', fontSize: 12, fontWeight: '800' }}>{i + 1}</Text></View>
              <Text style={{ color: c.text, fontSize: 15, lineHeight: 21, flex: 1 }}>{h}</Text>
            </View>
          ))}
          {stray.taught ? <Text style={{ color: c.sub, fontSize: 12 }}>{stray.taught.done ? `You have finished ${stray.taught.title}, where this is taught.` : `This is taught in ${stray.taught.title}.`}</Text> : null}
        </View>
      ) : null}
      {stray.offerRestart ? <Pressable onPress={() => trainingActions.restart()} accessibilityRole="button" accessibilityLabel="Start this part again" style={{ alignSelf: 'flex-end', backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 }}><Text style={{ color: c.onAccent, fontWeight: '700' }}>Start this part again</Text></Pressable> : null}
    </View>
  );
}

export default function TrainingOverlay({ layer }: { layer: string }) {
  const { c } = useTheme(); const sp = useSpotlight(); const view = useTraining(s => s.view); const top = useIsTopLayer(layer); const win = useWindowDimensions(); const reduce = useReduceMotion();
  const box = useRef<View>(null); const [origin, setOrigin] = useState({ x: 0, y: 0 }); const [size, setSize] = useState({ w: win.width, h: win.height }); const [bh, setBh] = useState(150);
  // The press whose hint toast has been closed (by the person, or by its timer on the main screen). Each layer keeps its own, so a window shows the current hint when it opens.
  const [shut, setShut] = useState(-1);
  const measure = () => box.current?.measureInWindow((x, y, w, h) => { setOrigin({ x, y }); if (w > 0 && h > 0) setSize({ w, h }); });
  // Window coordinates from the driver become local to this layer, and a target outside this layer's frame counts as not there.
  const local: Rect | null = view?.rect ? { x: view.rect.x - origin.x, y: view.rect.y - origin.y, w: view.rect.w, h: view.rect.h } : null;
  const fresh = onScreen(local, size) ? local : null;
  // A target that is not there for a moment (a page still opening) keeps the last spotlight instead of flashing to a fully dark screen.
  const lastHole = useRef<Rect | null>(null); const [expired, setExpired] = useState(false);
  useEffect(() => { if (fresh) { lastHole.current = fresh; setExpired(false); return undefined; } const t = setTimeout(() => setExpired(true), HOLD_MS); return () => clearTimeout(t); }, [fresh ? `${Math.round(fresh.x)},${Math.round(fresh.y)},${Math.round(fresh.w)},${Math.round(fresh.h)}` : '']); // eslint-disable-line react-hooks/exhaustive-deps
  // Off course with nothing to point at: no stale spotlight from the last step.
  const hole = view?.stray && !view.rect ? null : fresh ?? (!expired ? lastHole.current : null);
  const vals = useRectGlide(hole, size, reduce);
  const guide = view?.mode === 'guide'; const showRing = !!hole && (guide || !!view?.reveal);
  // In Guide the screen dims and only the target takes taps. While off course the dim stays when there is a fix to point at (only that takes taps, so nothing else can be
  // opened by accident); it lifts only when there is nothing to point at, because then the fix could be anywhere.
  // With no target on screen nothing is dimmed or blocked (0113): a full-screen block over a target that is gone (a window closed, a page changed) was a soft lock that even Exit could not escape.
  const dim = guide && !!hole && !view?.scroll?.fully; // a spot that is off screen leaves the screen free to scroll

  // Dim fades in the first time guide mode shows, and out when it ends.
  const dimO = useRef(new Animated.Value(0)).current;
  useEffect(() => { const a = Animated.timing(dimO, { toValue: dim ? 1 : 0, duration: reduce ? 0 : 320, useNativeDriver: true }); a.start(); return () => a.stop(); }, [dim, reduce, dimO]);

  // The bubble glides to its place and swaps its words with a fade. A step change plays a haptic tick and a green burst where the old target was.
  const bw = Math.min(360, size.w - 24);
  const bub = hole ? placeBubble(grow(hole, 6), size, { w: bw, h: bh }) : { ...centred(size, { w: bw, h: bh }), side: 'below' as const, arrowX: bw / 2 };
  const bx = useRef(new Animated.Value(bub.x)).current; const by = useRef(new Animated.Value(bub.y)).current; const ax = useRef(new Animated.Value(bub.arrowX)).current; const placed = useRef(false);
  useEffect(() => {
    if (!placed.current) { bx.setValue(bub.x); by.setValue(bub.y); ax.setValue(bub.arrowX); placed.current = true; return undefined; }
    const e = Easing.bezier(0.22, 1, 0.36, 1); const ms = reduce ? 0 : 420;
    const a = Animated.parallel([Animated.timing(bx, { toValue: bub.x, duration: ms, easing: e, useNativeDriver: false }), Animated.timing(by, { toValue: bub.y, duration: ms, easing: e, useNativeDriver: false }), Animated.timing(ax, { toValue: bub.arrowX, duration: ms, easing: e, useNativeDriver: false })]);
    a.start(); return () => a.stop();
  }, [Math.round(bub.x), Math.round(bub.y), Math.round(bub.arrowX), bub.side, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevCounter = useRef<string | null>(null); const prevHole = useRef<Rect | null>(null); const [burst, setBurst] = useState<{ id: number; rect: Rect } | null>(null);
  useEffect(() => {
    const n = view?.counter ?? null;
    if (n && prevCounter.current && prevCounter.current !== n && guide) { try { void Haptics.selectionAsync(); } catch {} if (prevHole.current && !reduce) { const id = Date.now(); setBurst({ id, rect: prevHole.current }); setTimeout(() => setBurst(b => (b?.id === id ? null : b)), 700); } }
    prevCounter.current = n;
  }, [view?.counter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { prevHole.current = hole; });

  // Hooks above must run on every render, so the early return is here.
  const dimBlocks = useMemo(() => ({
    top: clampPos(vals.y), bottom: clampPos(Animated.subtract(size.h, Animated.add(vals.y, vals.h))), left: clampPos(vals.x), right: clampPos(Animated.subtract(size.w, Animated.add(vals.x, vals.w))),
    below: clampPos(Animated.add(vals.y, vals.h)), after: clampPos(Animated.add(vals.x, vals.w)),
  }), [vals, size.w, size.h]);
  if (!view || !top) return null;
  const isRoot = layer === ROOT_LAYER; const seg = segments(view.index, view.total);
  // What a floating card must never cover: the control to tap (and the pointer that sits on it), and the Hint and Exit buttons a sheet carries.
  const avoid: Rect[] = [...(hole ? [grow(hole, 6)] : []), ...(!isRoot ? [{ x: size.w - 200, y: 6, w: 194, h: 48 }] : [])];
  return (
    <View ref={box} onLayout={measure} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {dim ? (
        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { opacity: dimO }]}>
          {hole ? <>
            <Animated.View style={{ position: 'absolute', left: 0, top: 0, right: 0, height: dimBlocks.top, backgroundColor: sp.dim }} />
            <Animated.View style={{ position: 'absolute', left: 0, top: dimBlocks.below, right: 0, height: dimBlocks.bottom, backgroundColor: sp.dim }} />
            <Animated.View style={{ position: 'absolute', left: 0, top: vals.y, width: dimBlocks.left, height: vals.h, backgroundColor: sp.dim }} />
            <Animated.View style={{ position: 'absolute', left: dimBlocks.after, top: vals.y, width: dimBlocks.right, height: vals.h, backgroundColor: sp.dim }} />
            {view.next && !view.typing ? <Animated.View style={{ position: 'absolute', left: vals.x, top: vals.y, width: vals.w, height: vals.h }} /> : null}
          </> : null}
        </Animated.View>
      ) : null}
      {showRing && hole ? <Ring vals={vals} color={sp.ring} /> : null}
      {view?.scroll ? <ScrollCue dir={view.scroll.dir} color={sp.ring} on={sp.onRing} /> : null}
      {burst ? <Burst key={burst.id} rect={burst.rect} good={c.good} /> : null}
      {showRing && hole && !view.next && !view.typing ? <Pointer hole={hole} color={sp.ring} on={sp.onRing} reduce={reduce} gesture={view.gesture ?? 'tap'} /> : null}
      {guide && !view.stray ? (
        <Animated.View onLayout={e => setBh(Math.round(e.nativeEvent.layout.height))} style={{ position: 'absolute', left: bx, top: by, width: bw, backgroundColor: c.card, borderRadius: 16, padding: 14, gap: 8, borderWidth: 1, borderColor: c.line, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
          {hole ? <Animated.View style={{ position: 'absolute', [bub.side === 'below' ? 'top' : 'bottom']: -8, left: Animated.subtract(ax, 8), width: 16, height: 16, backgroundColor: c.card, borderColor: c.line, borderTopWidth: bub.side === 'below' ? 1 : 0, borderLeftWidth: bub.side === 'below' ? 1 : 0, borderBottomWidth: bub.side === 'above' ? 1 : 0, borderRightWidth: bub.side === 'above' ? 1 : 0, transform: [{ rotate: '45deg' }] }} /> : null}
          <View style={{ flexDirection: 'row', gap: 4 }}>{seg.map((s, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: s === 'todo' ? c.line : s === 'done' ? c.good : sp.ring }} />)}</View>
          <Swap k={`${view.counter}|${view.say}`} dy={8} out={120} inn={260} appear style={{ gap: 8 }}>
            <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{view.counter}</Text>
            <Text style={{ color: c.text, fontSize: 16, lineHeight: 22 }}>{view.say}</Text>
          </Swap>
          {view.next ? <Pressable onPress={() => trainingActions.next()} disabled={view.nextBlocked} accessibilityRole="button" accessibilityLabel="Next" accessibilityState={{ disabled: !!view.nextBlocked }} style={{ alignSelf: 'flex-end', backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 10, opacity: view.nextBlocked ? 0.4 : 1 }}><Text style={{ color: c.onAccent, fontWeight: '700', fontSize: 15 }}>Next</Text></Pressable> : null}
        </Animated.View>
      ) : null}
      {view.stray ? (
        <Floating avoid={avoid} screen={size} top={isRoot ? 12 : 56} pointerEvents="box-none">
          <Swap k={view.stray.title} dy={-10} appear style={{ width: '100%' }}>
            <StrayCard stray={view.stray} />
          </Swap>
        </Floating>
      ) : null}
      {!isRoot ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 8 }}>
          {view.mode === 'check' ? <Pressable onPress={() => trainingActions.hint()} accessibilityRole="button" accessibilityLabel="Hint" style={{ flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }}><Ionicons name="help-circle" size={18} color={c.onAccent} /><Text style={{ color: c.onAccent, fontWeight: '700' }}>Hint</Text></Pressable> : null}
          <Pressable onPress={() => trainingActions.exit()} accessibilityRole="button" accessibilityLabel="Exit training" style={{ backgroundColor: c.fill, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }}><Text style={{ color: c.text, fontWeight: '700' }}>Exit</Text></Pressable>
        </View>
      ) : null}
      {/* The hint toast. It shows on every layer, not just windows, and an off-course notice always wins over it (the notice is the thing to act on). */}
      {view.mode === 'check' && view.hintLevel > 0 && !!view.say && !view.stray && shut !== (view.hintPress ?? 0)
        ? <Floating avoid={avoid} screen={size} top={isRoot ? 12 : 56} prefer={isRoot ? 'top' : 'bottom'} pointerEvents="box-none"><Enter from="up" distance={18} duration={300}><HintToast view={view} persist={!isRoot} onClose={() => setShut(view.hintPress ?? 0)} /></Enter></Floating> : null}
    </View>
  );
}
