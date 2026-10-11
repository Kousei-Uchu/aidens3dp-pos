// Location: src/ui/Motion.tsx
// Entrance animation for pages, cards and bars (B6 polish): fade in while sliding a short way. Skipped when the iPad's Reduce Motion is on.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { ROUTE_ENTER_MS, ROUTE_LEAVE_MS, TAB_ENTER_MS, TAB_RISE, enterOffset, leaveOffset, type From } from '../lib/motion';

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

type PaneProps = { children?: React.ReactNode; mode: 'enter' | 'leave' | 'still'; dir: From; distance: number; style?: StyleProp<ViewStyle>; pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only' };
const EASE_IN_PAGE = Easing.bezier(0.22, 1, 0.36, 1);   // arrives fast and settles slowly
const EASE_OUT_PAGE = Easing.bezier(0.4, 0, 0.9, 0.6);  // leaves gently, then speeds up
/**
 * One page during a page change. `enter` slides the page in from `dir` while it fades up (it is fully visible after about half the slide),
 * `leave` drifts it away (see `leaveOffset`) while it fades out, `still` does nothing. The mode is read once, when the pane first appears,
 * so give each page its own `key`. With Reduce Motion on, a pane simply is where it ends up.
 */
export function Pane({ children, mode, dir, distance, style, pointerEvents }: PaneProps) {
  const reduce = useReduceMotion(); const v = useRef(new Animated.Value(mode === 'still' || reduce ? 1 : 0)).current;
  useEffect(() => {
    if (mode === 'still') return undefined;
    if (reduce) { v.setValue(1); return undefined; }
    const a = Animated.timing(v, { toValue: 1, duration: mode === 'enter' ? ROUTE_ENTER_MS : ROUTE_LEAVE_MS, easing: mode === 'enter' ? EASE_IN_PAGE : EASE_OUT_PAGE, useNativeDriver: true }); a.start(); return () => a.stop();
  }, [reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  if (mode === 'still') return <Animated.View pointerEvents={pointerEvents} style={style}>{children}</Animated.View>;
  const o = mode === 'enter' ? enterOffset(dir, distance) : leaveOffset(dir, distance);
  const opacity = mode === 'enter' ? v.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 1, 1] }) : v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const tx = mode === 'enter' ? v.interpolate({ inputRange: [0, 1], outputRange: [o.x, 0] }) : v.interpolate({ inputRange: [0, 1], outputRange: [0, o.x] });
  const ty = mode === 'enter' ? v.interpolate({ inputRange: [0, 1], outputRange: [o.y, 0] }) : v.interpolate({ inputRange: [0, 1], outputRange: [0, o.y] });
  return <Animated.View pointerEvents={pointerEvents} style={[style, { opacity, transform: [{ translateX: tx }, { translateY: ty }] }]}>{children}</Animated.View>;
}

/**
 * A screen that stays mounted (the Checkout tab keeps its cart and scanner state) but should still fade and rise each time it is switched to.
 * It plays when `active` goes from false to true. It never remounts its children.
 */
export function TabPane({ active, children, style }: { active: boolean; children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion(); const v = useRef(new Animated.Value(1)).current; const was = useRef(active);
  useEffect(() => {
    if (active && !was.current && !reduce) { v.setValue(0); Animated.timing(v, { toValue: 1, duration: TAB_ENTER_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }
    was.current = active;
  }, [active, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [TAB_RISE, 0] }) }] }]}>{children}</Animated.View>;
}
