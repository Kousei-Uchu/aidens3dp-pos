// Location: src/ui/DemoView.tsx
// Draws the Show stage (B6): simplified copies of the real screens in a fixed canvas, with a camera that zooms and pans, a pointer that taps,
// a spotlight and a note. It plays one step at a time and then waits: the person moves on with Next. Nothing here advances by itself.
// It fills whatever space its parent gives it and fits the picture inside (same shape, never cropped), so the whole screen is visible at once.
// What each step looks like is worked out by src/lib/trainingDemo.ts. This file only draws it and animates between steps.
// Sharpness: the picture is laid out once at the biggest size it is ever shown (render scale `k`) and the camera only ever scales it DOWN.
// Stretching a drawn view up makes text and edges pixelated, so zooming in never enlarges anything, it just shrinks less.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TILE_COLORS, useTheme, type Colors } from './theme';
import { tap } from './kit';
import { useSpotlight } from './spotlight';
import { MAX_ZOOM, demoStateAfter, fitBox, planStep, renderScale, type Note, type NodeView } from '../lib/trainingDemo';
import type { Demo } from '../lib/trainingModule';
import { gesturePlan, isPress } from '../lib/pointerGesture';
import { TerminalBody, useFaceBrand } from './VirtualTerminal';
import { BODY_ASPECT, isVtScreen, previewState } from '../lib/virtualTerminal';

const BIG = 3000;
const toneColor = (c: Colors, t?: string, fallback?: string) => (t === 'good' ? c.good : t === 'bad' ? c.bad : t === 'accent' ? c.accent : fallback ?? c.text);

/** Fades a node in or out when a step shows or hides it, dips it when the pointer taps it, and draws it by kind. */
function MockNode({ n, press, k }: { n: NodeView; press: number; k: number }) {
  const { c } = useTheme(); const sp = useSpotlight(); const brand = useFaceBrand(); const u = (v: number) => v * k; const o = useRef(new Animated.Value(n.hidden ? 0 : 1)).current; const s = useRef(new Animated.Value(1)).current; const knob = useRef(new Animated.Value(n.on ? 1 : 0)).current;
  useEffect(() => { Animated.timing(o, { toValue: n.hidden ? 0 : 1, duration: 280, useNativeDriver: false }).start(); }, [n.hidden]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { Animated.timing(knob, { toValue: n.on ? 1 : 0, duration: 260, useNativeDriver: false }).start(); }, [n.on]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (press > 0) Animated.sequence([Animated.timing(s, { toValue: 0.93, duration: 110, useNativeDriver: false }), Animated.spring(s, { toValue: 1, friction: 5, useNativeDriver: false })]).start(); }, [press]); // eslint-disable-line react-hooks/exhaustive-deps
  const box = { position: 'absolute' as const, left: u(n.x), top: u(n.y), width: u(n.w), height: u(n.h), opacity: o, transform: [{ scale: s }] };
  const txt = { allowFontScaling: false as const };
  const one = { allowFontScaling: false as const, numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.7 }; // a single line shrinks a little rather than being cut off
  let body: React.ReactNode = null;
  switch (n.kind) {
    case 'terminal': { const w = Math.min(u(n.w), u(n.h) / BODY_ASPECT); const sc = isVtScreen(n.value ?? 'sleep') ? (n.value as any) : 'sleep'; body = <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none"><TerminalBody s={previewState(sc, !!n.on, n.amount ?? 4500)} w={w} brand={brand} /></View>; break; }
    case 'panel': body = <View style={{ flex: 1, backgroundColor: c.card, borderRadius: u(12), borderWidth: u(1), borderColor: c.line, padding: u(8) }}>{n.label ? <Text {...one} style={{ color: c.sub, fontSize: u(10), fontWeight: '700' }}>{n.label}</Text> : null}</View>; break;
    case 'bar': body = <View style={{ flex: 1, backgroundColor: c.card, borderBottomWidth: u(1), borderBottomColor: c.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: u(12) }}><Text {...one} style={{ color: c.text, fontSize: u(15), fontWeight: '700', flexShrink: 1 }}>{n.label}</Text>{n.sub ? <Text {...txt} style={{ color: c.sub, fontSize: u(11) }}>{n.sub}</Text> : null}</View>; break;
    case 'text': body = <View style={{ flex: 1, justifyContent: 'center' }}><Text {...txt} style={{ color: toneColor(c, n.tone), fontSize: u(n.size ?? 13), fontWeight: '600', textAlign: n.align ?? 'left' }}>{n.label}</Text>{n.sub ? <Text {...txt} style={{ color: c.sub, fontSize: u(Math.max(9, (n.size ?? 13) - 2)), textAlign: n.align ?? 'left' }}>{n.sub}</Text> : null}</View>; break;
    case 'button': { const solid = n.tone === undefined || n.tone === 'accent'; const bg = solid ? c.accent : n.tone === 'good' ? c.good : n.tone === 'bad' ? c.bad : c.fill; const fg = solid ? c.onAccent : n.tone === 'good' || n.tone === 'bad' ? '#FFFFFF' : c.text;
      body = <View style={{ flex: 1, backgroundColor: bg, borderRadius: u(10), flexDirection: 'row', gap: u(5), alignItems: 'center', justifyContent: 'center', paddingHorizontal: u(6) }}>{n.icon ? <Ionicons name={n.icon as any} size={u(14)} color={fg} /> : null}<Text {...one} style={{ color: fg, fontSize: u(n.size ?? 12), fontWeight: '700' }}>{n.label}</Text></View>; break; }
    case 'tile': body = <View style={{ flex: 1, backgroundColor: n.color ?? TILE_COLORS[3], borderRadius: u(10), padding: u(7), justifyContent: 'space-between', borderWidth: n.tone === 'accent' ? u(3) : 0, borderColor: sp.ring }}>{n.icon ? <Ionicons name={n.icon as any} size={u(16)} color="#111" /> : <View />}<View><Text {...one} style={{ color: '#111', fontSize: u(11), fontWeight: '700' }}>{n.label}</Text>{n.sub ? <Text {...txt} style={{ color: '#374151', fontSize: u(10) }}>{n.sub}</Text> : null}</View></View>; break;
    case 'row': body = <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: u(8), paddingHorizontal: u(8), borderBottomWidth: u(1), borderBottomColor: c.line }}>{n.icon ? <Ionicons name={n.icon as any} size={u(16)} color={c.sub} /> : null}<View style={{ flex: 1 }}><Text {...one} style={{ color: c.text, fontSize: u(12), fontWeight: '700' }}>{n.label}</Text>{n.sub ? <Text {...one} style={{ color: c.sub, fontSize: u(10) }}>{n.sub}</Text> : null}</View>{n.value ? <Text {...txt} style={{ color: toneColor(c, n.tone), fontSize: u(12), fontWeight: '700' }}>{n.value}</Text> : null}</View>; break;
    case 'toggle': body = <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: u(8) }}><Text {...txt} style={{ color: c.text, fontSize: u(12), fontWeight: '600', flex: 1 }}>{n.label}</Text>
      <Animated.View style={{ width: u(38), height: u(22), borderRadius: u(11), backgroundColor: knob.interpolate({ inputRange: [0, 1], outputRange: [c.line, c.good] }), justifyContent: 'center' }}><Animated.View style={{ width: u(18), height: u(18), borderRadius: u(9), backgroundColor: '#fff', transform: [{ translateX: knob.interpolate({ inputRange: [0, 1], outputRange: [u(2), u(18)] }) }] }} /></Animated.View></View>; break;
    case 'field': body = <View style={{ flex: 1, backgroundColor: c.fill, borderRadius: u(8), borderWidth: u(1), borderColor: c.line, paddingHorizontal: u(8), justifyContent: 'center' }}><Text {...one} style={{ color: n.value ? c.text : c.sub, fontSize: u(n.size ?? 12) }}>{n.value ?? n.label}</Text></View>; break;
    case 'chip': { const solid = n.tone === 'accent' || n.tone === 'good'; const bg = n.tone === 'good' ? c.good : n.tone === 'accent' ? c.accent : c.fill; const fg = n.tone === 'good' ? '#FFFFFF' : n.tone === 'accent' ? c.onAccent : c.text;
      body = <View style={{ flex: 1, borderRadius: u(999), backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Text {...one} style={{ color: fg, fontSize: u(11), fontWeight: solid ? '800' : '700' }}>{n.label}</Text></View>; break; }
    case 'icon': body = <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={(n.icon ?? 'ellipse') as any} size={u(n.size ?? Math.min(n.w, n.h))} color={toneColor(c, n.tone)} /></View>; break;
  }
  return <Animated.View pointerEvents="none" style={box}>{body}</Animated.View>;
}

/** One screen of the mock. All screens stay mounted and cross-fade, so a change of screen is a dissolve rather than a jump. */
function MockScreen({ nodes, on, press, k }: { nodes: NodeView[]; on: boolean; press: { id: string; n: number }; k: number }) {
  const o = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => { Animated.timing(o, { toValue: on ? 1 : 0, duration: 380, useNativeDriver: false }).start(); }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, opacity: o }}>{nodes.map(n => <MockNode key={n.id} n={n} press={press.id === n.id ? press.n : 0} k={k} />)}</Animated.View>;
}

function NoteBubble({ note, k }: { note: Note; k: number }) {
  const { c } = useTheme(); const sp = useSpotlight(); const o = useRef(new Animated.Value(0)).current; const u = (v: number) => v * k;
  useEffect(() => { Animated.timing(o, { toValue: 1, duration: 300, useNativeDriver: false }).start(); }, [o]);
  const bw = u(2);
  const arrow = { position: 'absolute' as const, width: u(12), height: u(12), backgroundColor: c.card, borderColor: sp.ring, transform: [{ rotate: '45deg' }] };
  const place = note.side === 'below' ? { left: u(note.arrow - 6), top: u(-7), borderLeftWidth: bw, borderTopWidth: bw }
    : note.side === 'above' ? { left: u(note.arrow - 6), bottom: u(-7), borderRightWidth: bw, borderBottomWidth: bw }
    : note.side === 'right' ? { top: u(note.arrow - 6), left: u(-7), borderLeftWidth: bw, borderBottomWidth: bw }
    : { top: u(note.arrow - 6), right: u(-7), borderRightWidth: bw, borderTopWidth: bw };
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: u(note.x), top: u(note.y), width: u(note.w), minHeight: u(note.h), opacity: o, backgroundColor: c.card, borderRadius: u(10), borderWidth: u(2), borderColor: sp.ring, padding: u(7), justifyContent: 'center' }}>
      <View style={[arrow, place]} />
      <Text allowFontScaling={false} style={{ color: c.text, fontSize: u(12), fontWeight: '700', textAlign: 'center' }}>{note.text}</Text>
    </Animated.View>
  );
}

const ease = Easing.inOut(Easing.cubic);
/**
 * `index` is the step to show. Moving forward one step plays it (camera, pointer, tap, change, settle). Going back, jumping, or a new `replay`
 * count: back and jumps settle straight on the finished picture, and a replay plays the step again from the one before it.
 */
export default function DemoView({ demo, index, replay = 0 }: { demo: Demo; index: number; replay?: number }) {
  const { c } = useTheme(); const sp = useSpotlight(); const CW = demo.canvas.w; const CH = demo.canvas.h;
  const [area, setArea] = useState({ w: 0, h: 0 }); const box = fitBox(area, demo.canvas); const vw = box.w; const vh = box.h; const b = vw / CW; const k = renderScale(vw, CW);
  const [applied, setApplied] = useState(-1); const [note, setNote] = useState<Note | null>(null); const [press, setPress] = useState({ id: '', n: 0 }); const [reduce, setReduce] = useState(false);
  const zoom = useRef(new Animated.Value(1)).current; const cx = useRef(new Animated.Value(CW / 2)).current; const cy = useRef(new Animated.Value(CH / 2)).current;
  const hx = useRef(new Animated.Value(0)).current; const hy = useRef(new Animated.Value(0)).current; const hw = useRef(new Animated.Value(CW)).current; const hh = useRef(new Animated.Value(CH)).current; const dim = useRef(new Animated.Value(0)).current;
  const px = useRef(new Animated.Value(CW / 2)).current; const py = useRef(new Animated.Value(CH / 2)).current; const po = useRef(new Animated.Value(0)).current; const rip = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.5)).current;
  const token = useRef(0); const prev = useRef(-1); const lastReplay = useRef(replay); const cursorShown = useRef(false);
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {}); }, []);
  useEffect(() => { const l = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: false }), Animated.timing(pulse, { toValue: 0.5, duration: 650, useNativeDriver: false })])); l.start(); return () => l.stop(); }, [pulse]);

  useEffect(() => {
    const me = ++token.current; const dead = () => token.current !== me; const plan = planStep(demo, index);
    const replaying = replay !== lastReplay.current; lastReplay.current = replay;
    const forward = replaying || index === prev.current + 1; prev.current = index;
    const d = (ms: number) => (reduce ? 0 : ms);
    const go = (v: Animated.Value, to: number, ms: number, e = ease) => new Promise<void>(res => { if (ms <= 0) { v.setValue(to); res(); } else Animated.timing(v, { toValue: to, duration: ms, easing: e, useNativeDriver: false }).start(() => res()); });
    const wait = (ms: number) => new Promise<void>(res => setTimeout(res, d(ms)));
    const camTo = (cam: { zoom: number; cx: number; cy: number }, hole: { x: number; y: number; w: number; h: number } | null, ms: number) => Promise.all([
      go(zoom, cam.zoom, ms), go(cx, cam.cx, ms), go(cy, cam.cy, ms),
      ...(hole ? [go(hx, hole.x - 5, ms), go(hy, hole.y - 5, ms), go(hw, hole.w + 10, ms), go(hh, hole.h + 10, ms), go(dim, 1, ms)] : [go(dim, 0, ms)]),
    ]);
    void (async () => {
      setNote(null);
      if (!forward) { // going back or jumping: show the finished picture, no pointer
        setApplied(index); void go(po, 0, 150); cursorShown.current = false;
        await camTo(plan.focusCam, plan.focus, d(500)); if (dead()) return; setNote(plan.note); return;
      }
      setApplied(index - 1); // the picture before this step (also what a replay starts from)
      await camTo(plan.lookCam, plan.look, d(750)); if (dead()) return;
      if (plan.tap && plan.tapPoint) {
        // The cursor plays the step's gesture (src/lib/pointerGesture.ts): a tap, a double or triple tap, press and hold, a swipe or a scroll.
        const gp = gesturePlan(plan.gesture, plan.tap);
        if (!cursorShown.current) { px.setValue(gp.start.x); py.setValue(gp.start.y); }
        void go(po, 1, 200); cursorShown.current = true;
        for (const m of gp.moves) {
          const ms = d(m.ms); const e = m.drag ? ease : Easing.out(Easing.cubic);
          const arrive = Promise.all([go(px, m.x, ms, e), go(py, m.y, ms, e)]);
          if (m.ripple) { rip.setValue(0); void go(rip, 1, d(450), Easing.out(Easing.quad)); if (isPress(plan.gesture)) { tap(); setPress(p => ({ id: plan.tapId ?? '', n: p.n + 1 })); } }
          if (m.hold) { rip.setValue(0); void go(rip, 1, ms, Easing.linear); }
          await arrive; if (dead()) return;
        }
        await wait(160); if (dead()) return;
      } else { void go(po, 0, 200); cursorShown.current = false; await wait(plan.changes ? 150 : 0); if (dead()) return; }
      setApplied(index); // the step's changes happen here (a new screen, a line appearing, a switch flipping)
      await wait(plan.changes ? 520 : 0); if (dead()) return;
      await camTo(plan.focusCam, plan.focus, d(750)); if (dead()) return;
      setNote(plan.note);
    })();
    return () => { token.current += 1; };
  }, [demo, index, replay, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  const st = demoStateAfter(demo, applied); const byScreen = new Map<string, NodeView[]>(demo.screens.map(sc => [sc.id, []]));
  for (const n of st.nodes.values()) byScreen.get(n.screen)?.push(n);
  const order = new Map(demo.screens.flatMap(sc => sc.nodes.map((n, i) => [n.id, i] as const))); for (const l of byScreen.values()) l.sort((a, z) => (order.get(a.id) ?? 0) - (order.get(z.id) ?? 0));
  // The canvas is laid out at k per canvas unit (the largest it is ever shown), so the camera only scales by zoom / MAX_ZOOM, never above 1.
  const S = Animated.multiply(zoom, 1 / MAX_ZOOM);
  const tx = Animated.multiply(Animated.subtract(CW / 2, cx), Animated.multiply(S, k)); const ty = Animated.multiply(Animated.subtract(CH / 2, cy), Animated.multiply(S, k));
  const panel = { position: 'absolute' as const, backgroundColor: sp.dim };
  const lbl = demo.steps[Math.max(0, Math.min(index, demo.steps.length - 1))];
  return (
    <View onLayout={e => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} style={{ flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
    {vw > 0 ? <View accessible accessibilityLabel={`Animated demonstration. ${lbl.say}`}
      style={{ width: vw, height: vh, borderRadius: 20, backgroundColor: c.bg, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
      <Animated.View style={{ position: 'absolute', left: (vw - CW * k) / 2, top: (vh - CH * k) / 2, width: CW * k, height: CH * k, transform: [{ translateX: tx }, { translateY: ty }, { scale: S }] }}>
        {demo.screens.map(sc => <MockScreen key={sc.id} nodes={byScreen.get(sc.id) ?? []} on={sc.id === st.screen} press={press} k={k} />)}
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: CW * k, height: CH * k, opacity: dim }}>
          <Animated.View style={[panel, { left: -BIG, top: -BIG, width: CW * k + BIG * 2, height: Animated.add(Animated.multiply(hy, k), BIG) }]} />
          <Animated.View style={[panel, { left: -BIG, top: Animated.add(Animated.multiply(hy, k), Animated.multiply(hh, k)), width: CW * k + BIG * 2, height: BIG * 2 }]} />
          <Animated.View style={[panel, { left: -BIG, top: Animated.multiply(hy, k), width: Animated.add(Animated.multiply(hx, k), BIG), height: Animated.multiply(hh, k) }]} />
          <Animated.View style={[panel, { left: Animated.add(Animated.multiply(hx, k), Animated.multiply(hw, k)), top: Animated.multiply(hy, k), width: BIG * 2, height: Animated.multiply(hh, k) }]} />
          <Animated.View style={{ position: 'absolute', left: Animated.multiply(hx, k), top: Animated.multiply(hy, k), width: Animated.multiply(hw, k), height: Animated.multiply(hh, k), borderRadius: 12 * k, borderWidth: 3 * k, borderColor: sp.ring, opacity: pulse }} />
        </Animated.View>
        {note ? <NoteBubble key={`${index}-${replay}`} note={note} k={k} /> : null}
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: Animated.subtract(Animated.multiply(px, k), 22 * k), top: Animated.subtract(Animated.multiply(py, k), 22 * k), width: 44 * k, height: 44 * k, alignItems: 'center', justifyContent: 'center', opacity: po }}>
          <Animated.View style={{ position: 'absolute', width: 44 * k, height: 44 * k, borderRadius: 22 * k, borderWidth: 3 * k, borderColor: '#FFFFFF', backgroundColor: 'rgba(245,158,11,0.35)', opacity: rip.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.9, 0] }), transform: [{ scale: rip.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.5] }) }] }} />
          <View style={{ transform: [{ rotate: '-90deg' }] }}><Ionicons name="navigate" size={26 * k} color="#111" style={{ textShadowColor: '#fff', textShadowRadius: 3 * k }} /></View>
        </Animated.View>
      </Animated.View>
    </View> : null}
    </View>
  );
}
