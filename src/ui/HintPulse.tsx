// Location: src/ui/HintPulse.tsx
// A box that pulses once, in size and colour, each time `k` changes (and once when it first appears). The shape of the pulse is the curve in
// src/lib/hintPulse.ts, played by one time value running from 0 to 0.8 s; the size, the tint and the edge are all read off it, so they stay in step.
// All native driven. Uses plain React Native views, not ../ui/kit, because kit imports the training overlay.
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { PULSE_SECONDS, PULSE_TINT_ALPHA, pulseSamples } from '../lib/hintPulse';

type Props = {
  /** Changes each time a (new) hint is given. The pulse plays again whenever it changes. */
  k: string | number;
  /** The colour of the tint and the edge (the theme's accent). */
  color: string;
  /** Match the box's own corner radius so the tint and edge sit inside it. */
  radius?: number;
  /** Reduce Motion: the colour still pulses, the size does not. */
  reduce?: boolean;
  /** Where the box grows from. Default is the middle; a box that fills a row should grow from its left edge. */
  origin?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};
export default function PulseBox({ k, color, radius = 14, reduce = false, origin, style, children }: Props) {
  const s = useMemo(() => pulseSamples(), []);
  // Rests at the end of the curve (intensity 0), so a box that is not pulsing looks exactly as it would without this wrapper.
  const t = useRef(new Animated.Value(PULSE_SECONDS)).current;
  useEffect(() => {
    t.setValue(0);
    const a = Animated.timing(t, { toValue: PULSE_SECONDS, duration: PULSE_SECONDS * 1000, easing: Easing.linear, useNativeDriver: true });
    a.start(); return () => a.stop();
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  const scale = reduce ? 1 : t.interpolate({ inputRange: s.t, outputRange: s.scale });
  const edge = t.interpolate({ inputRange: s.t, outputRange: s.mix });
  const tint = t.interpolate({ inputRange: s.t, outputRange: s.mix.map(m => m * PULSE_TINT_ALPHA) });
  return (
    <Animated.View style={[style, { transform: [{ scale }] }, origin ? ({ transformOrigin: origin } as ViewStyle) : null]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: color, opacity: tint }]} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 2, borderColor: color, opacity: edge }]} />
      {children}
    </Animated.View>
  );
}
