// Location: src/ui/Veil.tsx
// A dip to the page colour for the moments the whole screen changes underneath (practice starts, practice ends): the screen fades to the page colour,
// the change happens while nothing can be seen, then the new screen fades up. Without it the old screen is simply replaced by the new one in one frame.
// `dipThrough(change)` runs `change` at the darkest moment and gives back whatever it returned. With Reduce Motion on, it just runs `change`.
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';
import { useTheme } from './theme';
import { VEIL } from '../lib/motion';

type Dip = <T>(change: () => T | Promise<T>) => Promise<T>;
let current: Dip | null = null;
export const dipThrough: Dip = change => (current ? current(change) : Promise.resolve().then(change));

export function Veil() {
  const { c } = useTheme(); const o = useRef(new Animated.Value(0)).current; const live = useRef(false); const [blocking, setBlocking] = React.useState(false);
  useEffect(() => {
    const go = (to: number, ms: number, easing = Easing.inOut(Easing.quad)) => new Promise<void>(res => Animated.timing(o, { toValue: to, duration: ms, easing, useNativeDriver: true }).start(() => res()));
    current = async change => {
      let reduce = false; try { reduce = await AccessibilityInfo.isReduceMotionEnabled(); } catch {}
      if (reduce || live.current) return change();                 // a second dip while one is running just changes what it must
      live.current = true; setBlocking(true);
      try { await go(1, VEIL.inMs); const r = await change(); await new Promise<void>(res => setTimeout(res, VEIL.holdMs)); await go(0, VEIL.outMs, Easing.out(Easing.cubic)); return r; }
      finally { live.current = false; setBlocking(false); }
    };
    return () => { current = null; };
  }, [o]);
  return <Animated.View pointerEvents={blocking ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, opacity: o }]} />;
}
