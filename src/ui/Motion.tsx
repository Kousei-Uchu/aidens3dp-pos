// Location: src/ui/Motion.tsx
// Entrance animation for pages, cards and bars (B6 polish): fade in while sliding a short way. Skipped when the iPad's Reduce Motion is on.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { enterOffset, type From } from '../lib/motion';

export function useReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true; void AccessibilityInfo.isReduceMotionEnabled().then(v => { if (live) setOn(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', v => { if (live) setOn(v); });
    return () => { live = false; sub.remove(); };
  }, []);
  return on;
}

type EnterProps = { children?: React.ReactNode; from?: From; distance?: number; delay?: number; duration?: number; style?: StyleProp<ViewStyle>; pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only' };
/** Fades in and slides in from `from` when it first appears. Give it a changing `key` to play again. */
export function Enter({ children, from = 'up', distance = 14, delay = 0, duration = 320, style, pointerEvents }: EnterProps) {
  const reduce = useReduceMotion(); const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) { v.setValue(1); return undefined; }
    const a = Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }); a.start(); return () => a.stop();
  }, [reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  const o = enterOffset(from, distance);
  return (
    <Animated.View pointerEvents={pointerEvents} style={[style, { opacity: v, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [o.x, 0] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [o.y, 0] }) }] }]}>{children}</Animated.View>
  );
}
