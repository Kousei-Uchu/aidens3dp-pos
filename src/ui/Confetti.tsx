// Location: src/ui/Confetti.tsx
// Plain React Native Animated, no extra package. Pieces fall once from above the screen and are gone.
import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, View, useWindowDimensions } from 'react-native';
import { CONFETTI_COLOURS, makeConfetti, type Piece } from '../lib/confetti';

function Bit({ p, w, h }: { p: Piece; w: number; h: number }) {
  const t = React.useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(t, { toValue: 1, duration: p.dur, delay: p.delay, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(); }, [t, p.dur, p.delay]);
  return <Animated.View style={{ position: 'absolute', left: p.x * w, top: -30, width: p.w, height: p.h, borderRadius: 2, backgroundColor: CONFETTI_COLOURS[p.color], opacity: t.interpolate({ inputRange: [0, 0.05, 0.85, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, h + 60] }) }, { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift * w] }) }, { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 360}deg`] }) }] }} />;
}
export default function Confetti({ seed = 1, count = 70 }: { seed?: number; count?: number }) {
  const { width, height } = useWindowDimensions(); const pieces = useMemo(() => makeConfetti(count, seed, CONFETTI_COLOURS.length), [count, seed]);
  return <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>{pieces.map((p, i) => <Bit key={i} p={p} w={width} h={height} />)}</View>;
}
