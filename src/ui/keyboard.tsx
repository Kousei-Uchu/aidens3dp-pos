// Location: src/ui/keyboard.tsx
// Keyboard awareness: a hook for the keyboard's size, and a ScrollView that scrolls the focused field into view.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, KeyboardEvent, Platform, ScrollView, ScrollViewProps, TextInput, View } from 'react-native';
import { keyboardOverlap, revealDelta } from '../lib/keyboardMath';

/** Points of the window covered by the keyboard (0 when hidden). Uses the keyboard's top edge so floating/split iPad keyboards behave. */
export function useKeyboardOverlap(): number {
  const [o, setO] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const set = (e: KeyboardEvent) => setO(keyboardOverlap(Dimensions.get('window').height, e.endCoordinates.screenY, e.endCoordinates.height));
    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillChangeFrame' : 'keyboardDidShow', set),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setO(0)),
    ];
    return () => subs.forEach(s => s.remove());
  }, []);
  return o;
}

type Reveal = { reveal: (input: TextInput | null) => void } | null;
export const RevealCtx = createContext<Reveal>(null);
export const useReveal = () => useContext(RevealCtx);

/**
 * ScrollView that keeps the focused <Field> clear of the keyboard. Fields call `reveal(ref)` on focus;
 * we also re-check when the keyboard finishes moving (it usually arrives after the focus event).
 * `inset`: add the keyboard height as bottom padding (use when the scroll view itself is NOT shrunk by the keyboard).
 */
export function RevealScroll({ inset, children, contentContainerStyle, ...rest }: ScrollViewProps & { inset?: boolean }) {
  const overlap = useKeyboardOverlap();
  const box = useRef<View>(null); const sv = useRef<ScrollView>(null); const offset = useRef(0); const focused = useRef<TextInput | null>(null); const overlapRef = useRef(0);
  overlapRef.current = overlap;
  const run = useCallback(() => {
    const input = focused.current; const b = box.current; if (!input || !b) return;
    b.measureInWindow((_bx, by, _bw, bh) => input.measureInWindow((_fx, fy, _fw, fh) => {
      const kbTop = Dimensions.get('window').height - overlapRef.current;
      const delta = revealDelta({ fieldTop: fy, fieldBottom: fy + fh, viewTop: by, viewBottom: Math.min(by + bh, kbTop) });
      if (Math.abs(delta) > 1) sv.current?.scrollTo({ y: Math.max(0, offset.current + delta), animated: true });
    }));
  }, []);
  const ctx = useRef({ reveal: (input: TextInput | null) => { focused.current = input; if (input) { setTimeout(run, 60); setTimeout(run, 350); } } }).current;
  useEffect(() => { if (focused.current) setTimeout(run, 30); }, [overlap, run]);
  return (
    <RevealCtx.Provider value={ctx}>
      <View ref={box} collapsable={false} style={{ flexGrow: 1, flexShrink: 1 }}>
        <ScrollView ref={sv} keyboardShouldPersistTaps="handled" scrollEventThrottle={16} onScroll={e => { offset.current = e.nativeEvent.contentOffset.y; rest.onScroll?.(e); }}
          {...rest} contentContainerStyle={[contentContainerStyle, inset && overlap ? { paddingBottom: overlap + 24 } : null]}>{children}</ScrollView>
      </View>
    </RevealCtx.Provider>
  );
}
