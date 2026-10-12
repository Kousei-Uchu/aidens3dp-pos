// Location: src/ui/Swap.tsx
// A smooth change between two pieces of content. When `k` changes, the old content fades and slides out, then the new content fades and slides in.
// Used for the stages and captions of a training course, the guide bubble and the dock, so nothing ever just jumps. Native driven, so it does not stutter.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

type Props = { k: string | number; children: React.ReactNode; style?: StyleProp<ViewStyle>; dx?: number; dy?: number; out?: number; inn?: number; /** Also fade the first content in when it mounts. */ appear?: boolean };
export default function Swap({ k, children, style, dx = 0, dy = 10, out = 160, inn = 300, appear = false }: Props) {
  const [shown, setShown] = useState(k); const o = useRef(new Animated.Value(appear ? 0 : 1)).current; const x = useRef(new Animated.Value(appear ? dx : 0)).current; const y = useRef(new Animated.Value(appear ? dy : 0)).current;
  const live = useRef(children); const frozen = useRef(children); const first = useRef(true); const token = useRef(0); const reduce = useRef(false);
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(v => { reduce.current = v; }).catch(() => {}); }, []);
  live.current = children; if (shown === k) frozen.current = children; // while the old content fades out, `frozen` keeps showing it
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (appear) Animated.parallel([Animated.timing(o, { toValue: 1, duration: inn, easing: Easing.out(Easing.cubic), useNativeDriver: true }), Animated.timing(x, { toValue: 0, duration: inn, easing: Easing.out(Easing.cubic), useNativeDriver: true }), Animated.timing(y, { toValue: 0, duration: inn, easing: Easing.out(Easing.cubic), useNativeDriver: true })]).start();
      return undefined;
    }
    const me = ++token.current; const dead = () => token.current !== me; const ms = (v: number) => (reduce.current ? 0 : v);
    const run = (v: Animated.Value, to: number, d: number, e: (t: number) => number) => new Promise<void>(res => { if (d <= 0) { v.setValue(to); res(); } else Animated.timing(v, { toValue: to, duration: d, easing: e, useNativeDriver: true }).start(() => res()); });
    void (async () => {
      await Promise.all([run(o, 0, ms(out), Easing.in(Easing.quad)), run(x, -dx * 0.6, ms(out), Easing.in(Easing.quad)), run(y, -dy * 0.6, ms(out), Easing.in(Easing.quad))]); if (dead()) return;
      setShown(k); x.setValue(dx); y.setValue(dy);
      await Promise.all([run(o, 1, ms(inn), Easing.out(Easing.cubic)), run(x, 0, ms(inn), Easing.out(Easing.cubic)), run(y, 0, ms(inn), Easing.out(Easing.cubic))]);
    })();
    return () => { token.current += 1; };
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Animated.View style={[style, { opacity: o, transform: [{ translateX: x }, { translateY: y }] }]}>{shown === k ? live.current : frozen.current}</Animated.View>;
}
