// Location: src/ui/DemoView.tsx
// Draws the Show stage (B6): simplified copies of the real screens in a fixed canvas, with a camera that zooms and pans, a pointer that taps,
// a spotlight and a note. It plays one step at a time and then waits: the person moves on with Next. Nothing here advances by itself.
// What each step looks like is worked out by src/lib/trainingDemo.ts. This file only draws it and animates between steps.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TILE_COLORS, useTheme, type Colors } from './theme';
import { tap } from './kit';
import { demoStateAfter, planStep, type Note, type NodeView } from '../lib/trainingDemo';
import type { Demo } from '../lib/trainingModule';

const RING = '#F59E0B'; const DIM = 'rgba(0,0,0,0.62)'; const BIG = 3000;
const toneColor = (c: Colors, t?: string, fallback?: string) => (t === 'good' ? c.good : t === 'bad' ? c.bad : t === 'accent' ? c.accent : fallback ?? c.text);

/** Fades a node in or out when a step shows or hides it, dips it when the pointer taps it, and draws it by kind. */
function MockNode({ n, press }: { n: NodeView; press: number }) {
  const { c } = useTheme(); const o = useRef(new Animated.Value(n.hidden ? 0 : 1)).current; const s = useRef(new Animated.Value(1)).current; const k = useRef(new Animated.Value(n.on ? 1 : 0)).current;
  useEffect(() => { Animated.timing(o, { toValue: n.hidden ? 0 : 1, duration: 280, useNativeDriver: false }).start(); }, [n.hidden]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { Animated.timing(k, { toValue: n.on ? 1 : 0, duration: 260, useNativeDriver: false }).start(); }, [n.on]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (press > 0) Animated.sequence([Animated.timing(s, { toValue: 0.93, duration: 110, useNativeDriver: false }), Animated.spring(s, { toValue: 1, friction: 5, useNativeDriver: false })]).start(); }, [press]); // eslint-disable-line react-hooks/exhaustive-deps
  const box = { position: 'absolute' as const, left: n.x, top: n.y, width: n.w, height: n.h, opacity: o, transform: [{ scale: s }] };
  const txt = { allowFontScaling: false as const };
  let body: React.ReactNode = null;
  switch (n.kind) {
    case 'panel': body = <View style={{ flex: 1, backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.line, padding: 8 }}>{n.label ? <Text {...txt} style={{ color: c.sub, fontSize: 10, fontWeight: '700' }}>{n.label}</Text> : null}</View>; break;
    case 'bar': body = <View style={{ flex: 1, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 }}><Text {...txt} style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>{n.label}</Text>{n.sub ? <Text {...txt} style={{ color: c.sub, fontSize: 11 }}>{n.sub}</Text> : null}</View>; break;
    case 'text': body = <View style={{ flex: 1, justifyContent: 'center' }}><Text {...txt} style={{ color: toneColor(c, n.tone), fontSize: n.size ?? 13, fontWeight: '600', textAlign: n.align ?? 'left' }}>{n.label}</Text>{n.sub ? <Text {...txt} style={{ color: c.sub, fontSize: Math.max(9, (n.size ?? 13) - 2), textAlign: n.align ?? 'left' }}>{n.sub}</Text> : null}</View>; break;
    case 'button': { const solid = n.tone === undefined || n.tone === 'accent'; const bg = solid ? c.accent : n.tone === 'good' ? c.good : n.tone === 'bad' ? c.bad : c.fill; const fg = solid ? c.onAccent : n.tone === 'good' || n.tone === 'bad' ? '#FFFFFF' : c.text;
      body = <View style={{ flex: 1, backgroundColor: bg, borderRadius: 10, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>{n.icon ? <Ionicons name={n.icon as any} size={14} color={fg} /> : null}<Text {...txt} numberOfLines={1} style={{ color: fg, fontSize: n.size ?? 12, fontWeight: '700' }}>{n.label}</Text></View>; break; }
    case 'tile': body = <View style={{ flex: 1, backgroundColor: n.color ?? TILE_COLORS[3], borderRadius: 10, padding: 7, justifyContent: 'space-between', borderWidth: n.tone === 'accent' ? 3 : 0, borderColor: RING }}>{n.icon ? <Ionicons name={n.icon as any} size={16} color="#111" /> : <View />}<View><Text {...txt} numberOfLines={1} style={{ color: '#111', fontSize: 11, fontWeight: '700' }}>{n.label}</Text>{n.sub ? <Text {...txt} style={{ color: '#374151', fontSize: 10 }}>{n.sub}</Text> : null}</View></View>; break;
    case 'row': body = <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: c.line }}>{n.icon ? <Ionicons name={n.icon as any} size={16} color={c.sub} /> : null}<View style={{ flex: 1 }}><Text {...txt} numberOfLines={1} style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>{n.label}</Text>{n.sub ? <Text {...txt} numberOfLines={1} style={{ color: c.sub, fontSize: 10 }}>{n.sub}</Text> : null}</View>{n.value ? <Text {...txt} style={{ color: toneColor(c, n.tone), fontSize: 12, fontWeight: '700' }}>{n.value}</Text> : null}</View>; break;
    case 'toggle': body = <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }}><Text {...txt} style={{ color: c.text, fontSize: 12, fontWeight: '600', flex: 1 }}>{n.label}</Text>
      <Animated.View style={{ width: 38, height: 22, borderRadius: 11, backgroundColor: k.interpolate({ inputRange: [0, 1], outputRange: [c.line, c.good] }), justifyContent: 'center' }}><Animated.View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', transform: [{ translateX: k.interpolate({ inputRange: [0, 1], outputRange: [2, 18] }) }] }} /></Animated.View></View>; break;
    case 'field': body = <View style={{ flex: 1, backgroundColor: c.fill, borderRadius: 8, borderWidth: 1, borderColor: c.line, paddingHorizontal: 8, justifyContent: 'center' }}><Text {...txt} numberOfLines={1} style={{ color: n.value ? c.text : c.sub, fontSize: n.size ?? 12 }}>{n.value ?? n.label}</Text></View>; break;
    case 'chip': body = <View style={{ flex: 1, borderRadius: 999, backgroundColor: n.tone === 'accent' ? c.accent : c.fill, alignItems: 'center', justifyContent: 'center' }}><Text {...txt} numberOfLines={1} style={{ color: n.tone === 'accent' ? c.onAccent : c.text, fontSize: 11, fontWeight: '700' }}>{n.label}</Text></View>; break;
    case 'icon': body = <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={(n.icon ?? 'ellipse') as any} size={n.size ?? Math.min(n.w, n.h)} color={toneColor(c, n.tone)} /></View>; break;
  }
  return <Animated.View pointerEvents="none" style={box}>{body}</Animated.View>;
}

/** One screen of the mock. All screens stay mounted and cross-fade, so a change of screen is a dissolve rather than a jump. */
function MockScreen({ nodes, on, press }: { nodes: NodeView[]; on: boolean; press: { id: string; n: number } }) {
  const o = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => { Animated.timing(o, { toValue: on ? 1 : 0, duration: 380, useNativeDriver: false }).start(); }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, opacity: o }}>{nodes.map(n => <MockNode key={n.id} n={n} press={press.id === n.id ? press.n : 0} />)}</Animated.View>;
}

function NoteBubble({ note }: { note: Note }) {
  const { c } = useTheme(); const o = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(o, { toValue: 1, duration: 300, useNativeDriver: false }).start(); }, [o]);
  const arrow = { position: 'absolute' as const, left: note.arrowX - 6, width: 12, height: 12, backgroundColor: c.card, borderColor: RING, transform: [{ rotate: '45deg' }] };
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: note.x, top: note.y, width: note.w, minHeight: note.h, opacity: o, backgroundColor: c.card, borderRadius: 10, borderWidth: 2, borderColor: RING, padding: 7, justifyContent: 'center' }}>
      <View style={[arrow, note.side === 'below' ? { top: -7, borderLeftWidth: 2, borderTopWidth: 2 } : { bottom: -7, borderRightWidth: 2, borderBottomWidth: 2 }]} />
      <Text allowFontScaling={false} style={{ color: c.text, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{note.text}</Text>
    </Animated.View>
  );
}

const ease = Easing.inOut(Easing.cubic);
/**
 * `index` is the step to show. Moving forward one step plays it (camera, pointer, tap, change, settle). Going back, jumping, or a new `replay`
 * count: back and jumps settle straight on the finished picture, and a replay plays the step again from the one before it.
 */
export default function DemoView({ demo, index, replay = 0 }: { demo: Demo; index: number; replay?: number }) {
  const { c } = useTheme(); const CW = demo.canvas.w; const CH = demo.canvas.h;
  const [vw, setVw] = useState(CW); const vh = vw * (CH / CW); const b = vw / CW;
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
      if (plan.tapPoint) {
        if (!cursorShown.current) { px.setValue(plan.tapPoint.x + 70); py.setValue(plan.tapPoint.y + 55); }
        void go(po, 1, 200); cursorShown.current = true;
        await Promise.all([go(px, plan.tapPoint.x, d(700)), go(py, plan.tapPoint.y, d(700))]); if (dead()) return;
        await wait(150); if (dead()) return;
        rip.setValue(0); void go(rip, 1, d(450), Easing.out(Easing.quad)); tap(); setPress(p => ({ id: plan.tapId ?? '', n: p.n + 1 }));
        await wait(220); if (dead()) return;
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
  const S = Animated.multiply(zoom, b);
  const tx = Animated.multiply(Animated.subtract(CW / 2, cx), S); const ty = Animated.multiply(Animated.subtract(CH / 2, cy), S);
  const panel = { position: 'absolute' as const, backgroundColor: DIM };
  const lbl = demo.steps[Math.max(0, Math.min(index, demo.steps.length - 1))];
  return (
    <View onLayout={e => setVw(Math.max(200, e.nativeEvent.layout.width))} accessible accessibilityLabel={`Animated demonstration. ${lbl.say}`}
      style={{ width: '100%', maxWidth: 760, alignSelf: 'center', height: vh, borderRadius: 20, backgroundColor: c.bg, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
      <Animated.View style={{ position: 'absolute', left: (vw - CW) / 2, top: (vh - CH) / 2, width: CW, height: CH, transform: [{ translateX: tx }, { translateY: ty }, { scale: S }] }}>
        {demo.screens.map(sc => <MockScreen key={sc.id} nodes={byScreen.get(sc.id) ?? []} on={sc.id === st.screen} press={press} />)}
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: CW, height: CH, opacity: dim }}>
          <Animated.View style={[panel, { left: -BIG, top: -BIG, width: CW + BIG * 2, height: Animated.add(hy, BIG) }]} />
          <Animated.View style={[panel, { left: -BIG, top: Animated.add(hy, hh), width: CW + BIG * 2, height: BIG * 2 }]} />
          <Animated.View style={[panel, { left: -BIG, top: hy, width: Animated.add(hx, BIG), height: hh }]} />
          <Animated.View style={[panel, { left: Animated.add(hx, hw), top: hy, width: BIG * 2, height: hh }]} />
          <Animated.View style={{ position: 'absolute', left: hx, top: hy, width: hw, height: hh, borderRadius: 12, borderWidth: 3, borderColor: RING, opacity: pulse }} />
        </Animated.View>
        {note ? <NoteBubble key={`${index}-${replay}`} note={note} /> : null}
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: Animated.subtract(px, 22), top: Animated.subtract(py, 22), width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: po }}>
          <Animated.View style={{ position: 'absolute', width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: 'rgba(245,158,11,0.35)', opacity: rip.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.9, 0] }), transform: [{ scale: rip.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.5] }) }] }} />
          <View style={{ transform: [{ rotate: '-90deg' }] }}><Ionicons name="navigate" size={26} color="#111" style={{ textShadowColor: '#fff', textShadowRadius: 3 }} /></View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
