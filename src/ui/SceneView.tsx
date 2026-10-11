// Location: src/ui/SceneView.tsx
// Draws one scene (Info and Show stages). Each actor glides to where the current beat puts it, fades in or out, and pulses when the beat is about it.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './theme';
import { tap } from './kit';
import { sceneAt, type ActorView } from '../lib/trainingScene';
import type { Scene } from '../lib/trainingModule';

function Actor({ a, w, h }: { a: ActorView; w: number; h: number }) {
  const { c } = useTheme(); const x = useRef(new Animated.Value(a.x)).current; const y = useRef(new Animated.Value(a.y)).current; const o = useRef(new Animated.Value(a.hidden ? 0 : 1)).current; const s = useRef(new Animated.Value(1)).current;
  useEffect(() => { Animated.parallel([Animated.timing(x, { toValue: a.x, duration: 700, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }), Animated.timing(y, { toValue: a.y, duration: 700, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }), Animated.timing(o, { toValue: a.hidden ? 0 : 1, duration: 450, useNativeDriver: false })]).start(); }, [a.x, a.y, a.hidden]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (a.pulse) Animated.sequence([Animated.timing(s, { toValue: 1.3, duration: 220, useNativeDriver: false }), Animated.spring(s, { toValue: 1, friction: 4, useNativeDriver: false })]).start(); }, [a.pulse]); // eslint-disable-line react-hooks/exhaustive-deps
  const tone = a.tone === 'good' ? c.good : a.tone === 'bad' ? c.bad : a.tone === 'accent' ? c.accent : c.text; const size = Math.min(w, h) * 0.2;
  return (
    <Animated.View style={{ position: 'absolute', left: x.interpolate({ inputRange: [0, 100], outputRange: [-size / 2, w - size / 2] }), top: y.interpolate({ inputRange: [0, 100], outputRange: [-size / 2, h - size / 2] }), width: size, alignItems: 'center', opacity: o, transform: [{ scale: s }] }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.fill, borderWidth: 2, borderColor: tone, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={a.icon as any} size={size * 0.5} color={tone} /></View>
      {a.label ? <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginTop: 4 }} numberOfLines={1}>{a.label}</Text> : null}
    </Animated.View>
  );
}

/** `index` is the beat to show. The sentence sits under the picture, and a soft tick plays whenever the beat changes. */
export default function SceneView({ scene, index }: { scene: Scene; index: number }) {
  const { c } = useTheme(); const v = sceneAt(scene, index); const [box, setBox] = useState({ w: 300, h: 220 }); const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } tap(); }, [v.index]);
  return (
    <View style={{ gap: 14 }}>
      <View onLayout={e => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} style={{ height: 230, borderRadius: 20, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
        {v.actors.map(a => <Actor key={a.id} a={a} w={box.w} h={box.h} />)}
      </View>
      <Text style={{ color: c.text, fontSize: 19, lineHeight: 27, fontWeight: '600', minHeight: 84 }} accessibilityLiveRegion="polite">{v.say}</Text>
      <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>{Array.from({ length: v.total }, (_, i) => <View key={i} style={{ width: i === v.index ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i <= v.index ? c.text : c.line }} />)}</View>
    </View>
  );
}
