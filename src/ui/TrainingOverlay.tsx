// Location: src/ui/TrainingOverlay.tsx
// Draws the spotlight, the ring and the speech bubble. Guide dims everything but the target (taps pass through the hole).
// Check never dims: it only rings the answer when the hints run out. Only the topmost layer (the page, or the newest sheet) draws.
// Uses plain React Native views, not ../ui/kit, because kit imports this file.
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from './theme';
import { ROOT_LAYER, layersVersion, subscribeLayers, topLayer } from '../lib/trainingLayers';
import { blockers, centred, grow, onScreen, placeBubble, type Rect } from '../lib/trainingGeometry';
import { useTraining } from '../state/trainingSession';
import { trainingActions } from './trainingActions';

const RING = '#F59E0B'; const DIM = 'rgba(0,0,0,0.62)';
export const useIsTopLayer = (layer: string): boolean => { useSyncExternalStore(subscribeLayers, layersVersion, layersVersion); return topLayer() === layer; };

function Ring({ r }: { r: Rect }) {
  const a = useRef(new Animated.Value(0.45)).current;
  useEffect(() => { const l = Animated.loop(Animated.sequence([Animated.timing(a, { toValue: 1, duration: 650, useNativeDriver: true }), Animated.timing(a, { toValue: 0.45, duration: 650, useNativeDriver: true })])); l.start(); return () => l.stop(); }, [a]);
  const g = grow(r, 6);
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', left: g.x, top: g.y, width: g.w, height: g.h, borderRadius: 14, borderWidth: 3, borderColor: RING, opacity: a }} />;
}

export default function TrainingOverlay({ layer }: { layer: string }) {
  const { c } = useTheme(); const view = useTraining(s => s.view); const top = useIsTopLayer(layer); const win = useWindowDimensions();
  const box = useRef<View>(null); const [origin, setOrigin] = useState({ x: 0, y: 0 }); const [size, setSize] = useState({ w: win.width, h: win.height }); const [bh, setBh] = useState(140);
  const measure = () => box.current?.measureInWindow((x, y, w, h) => { setOrigin({ x, y }); if (w > 0 && h > 0) setSize({ w, h }); });
  useEffect(() => { if (view?.next) { try { void Haptics.selectionAsync(); } catch {} } }, [view?.title]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!view || !top) return null;
  const isRoot = layer === ROOT_LAYER;
  // Window coordinates from the driver become local to this layer, and a target outside this layer's frame counts as not there.
  const local: Rect | null = view.rect ? { x: view.rect.x - origin.x, y: view.rect.y - origin.y, w: view.rect.w, h: view.rect.h } : null;
  const hole = onScreen(local, size) ? local : null;
  const showRing = !!hole && (view.mode === 'guide' || view.reveal);
  const bw = Math.min(360, size.w - 24); const bubble = hole ? placeBubble(grow(hole, 6), size, { w: bw, h: bh }) : { ...centred(size, { w: bw, h: bh }), side: 'below' as const, arrowX: bw / 2 };
  const showBubble = view.mode === 'guide';
  return (
    <View ref={box} onLayout={measure} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {view.mode === 'guide' ? (hole ? <>
        {blockers(grow(hole, 6), size).map((b, i) => <View key={i} style={{ position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h, backgroundColor: DIM }} />)}
        {view.next ? <View style={{ position: 'absolute', left: hole.x - 6, top: hole.y - 6, width: hole.w + 12, height: hole.h + 12 }} /> : null}
      </> : <View style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]} />) : null}
      {showRing && hole ? <Ring r={hole} /> : null}
      {showBubble ? (
        <View onLayout={e => setBh(Math.round(e.nativeEvent.layout.height))} style={{ position: 'absolute', left: bubble.x, top: bubble.y, width: bw, backgroundColor: c.card, borderRadius: 16, padding: 14, gap: 8, borderWidth: 1, borderColor: c.line, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
          {hole ? <View style={{ position: 'absolute', [bubble.side === 'below' ? 'top' : 'bottom']: -8, left: bubble.arrowX - 8, width: 16, height: 16, backgroundColor: c.card, borderColor: c.line, borderTopWidth: bubble.side === 'below' ? 1 : 0, borderLeftWidth: bubble.side === 'below' ? 1 : 0, borderBottomWidth: bubble.side === 'above' ? 1 : 0, borderRightWidth: bubble.side === 'above' ? 1 : 0, transform: [{ rotate: '45deg' }] }} /> : null}
          <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{view.counter}</Text>
          <Text style={{ color: c.text, fontSize: 16, lineHeight: 22 }}>{view.say}</Text>
          {view.next ? <Pressable onPress={() => trainingActions.next()} accessibilityRole="button" accessibilityLabel="Next" style={{ alignSelf: 'flex-end', backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 10 }}><Text style={{ color: c.onAccent, fontWeight: '700', fontSize: 15 }}>Next</Text></Pressable> : null}
        </View>
      ) : null}
      {!isRoot ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 8 }}>
          {view.mode === 'check' ? <Pressable onPress={() => trainingActions.hint()} accessibilityRole="button" accessibilityLabel="Hint" style={{ flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }}><Ionicons name="help-circle" size={18} color={c.onAccent} /><Text style={{ color: c.onAccent, fontWeight: '700' }}>Hint</Text></Pressable> : null}
          <Pressable onPress={() => trainingActions.exit()} accessibilityRole="button" accessibilityLabel="Exit training" style={{ backgroundColor: c.fill, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }}><Text style={{ color: c.text, fontWeight: '700' }}>Exit</Text></Pressable>
        </View>
      ) : null}
      {!isRoot && view.mode === 'check' && view.say ? <View pointerEvents="none" style={{ position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: c.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: c.line }}><Text style={{ color: c.text, fontSize: 15, lineHeight: 21 }}>{view.say}</Text></View> : null}
    </View>
  );
}
