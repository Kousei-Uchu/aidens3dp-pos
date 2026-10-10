// Location: src/ui/SwipeRow.tsx
// Swipe a row left to reveal a red delete button (A13). Uses only React Native's own Animated + PanResponder,
// so it needs no new package and no native rebuild.
//  - Drag left and let go past halfway: the button stays open. Tap it to delete.
//  - Drag most of the way across: deletes straight away.
//  - Tap the row while it is open: it closes again.
//  - `onDelete` may return false (or a promise of false) to say "cancelled", and the row slides back.
//  - VoiceOver: the row offers a "Delete" action, so swiping is never the only way.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import { useTheme } from './theme';
import { clampSwipe, swipeDecision } from '../lib/swipe';

type Props = {
  children: React.ReactNode;
  onDelete: () => void | boolean | Promise<void | boolean>;
  disabled?: boolean;
  label?: string;
  /** Width of the revealed button. */
  openWidth?: number;
  /** Background of the row itself (it must be opaque so the red button stays hidden until you swipe). */
  background?: string;
  fullSwipe?: boolean;
};

export default function SwipeRow({ children, onDelete, disabled, label = 'Delete', openWidth = 96, background, fullSwipe = true }: Props) {
  const { c } = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  const cur = useRef(0); const start = useRef(0); const width = useRef(0);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);

  useEffect(() => { const id = x.addListener(({ value }) => { cur.current = value; }); return () => x.removeListener(id); }, [x]);

  // Latest props live in a ref so the gesture handler is created once. A re-render in the middle of a drag
  // (the cart refreshing, say) therefore never drops the finger.
  const latest = useRef({ disabled, openWidth, fullSwipe, onDelete });
  latest.current = { disabled, openWidth, fullSwipe, onDelete };

  const slide = (to: number, done?: () => void) => Animated.timing(x, { toValue: to, duration: 160, useNativeDriver: true }).start(done);
  const close = () => { openRef.current = false; setOpen(false); slide(0); };
  const openIt = () => { openRef.current = true; setOpen(true); slide(-latest.current.openWidth); };
  const remove = async () => {
    slide(-(width.current || latest.current.openWidth * 4));
    let keep: void | boolean = true;
    try { keep = await latest.current.onDelete(); } catch { keep = false; }
    if (keep === false) close(); // cancelled or failed: slide back
  };

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !latest.current.disabled && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: () => { x.stopAnimation(); start.current = cur.current; },
    onPanResponderMove: (_, g) => x.setValue(clampSwipe(start.current + g.dx, latest.current.openWidth, width.current)),
    onPanResponderRelease: (_, g) => {
      const out = swipeDecision({ x: cur.current, vx: g.vx, width: width.current, openWidth: latest.current.openWidth, fullSwipe: latest.current.fullSwipe });
      if (out === 'delete') void remove(); else if (out === 'open') openIt(); else close();
    },
    onPanResponderTerminate: () => (openRef.current ? openIt() : close()),
    onPanResponderTerminationRequest: () => false,
  })).current;

  return (
    <View style={{ overflow: 'hidden' }} onLayout={e => { width.current = e.nativeEvent.layout.width; }}>
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: c.bad, alignItems: 'flex-end', justifyContent: 'center' }} pointerEvents={open ? 'auto' : 'none'}>
        <Pressable onPress={() => void remove()} accessibilityRole="button" accessibilityLabel={label} style={{ width: openWidth, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>{label}</Text>
        </Pressable>
      </View>
      <Animated.View {...pan.panHandlers} style={{ backgroundColor: background ?? c.card, transform: [{ translateX: x }] }}
        accessibilityActions={disabled ? undefined : [{ name: 'delete', label }]} onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'delete') void remove(); }}>
        {children}
        {open ? <Pressable onPress={close} accessibilityLabel="Close" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} /> : null}
      </Animated.View>
    </View>
  );
}
