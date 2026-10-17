// Location: src/ui/ScannerKeyboardHint.tsx
// The tip under a focused text field: "Double-click the scanner trigger to show the keyboard". Rendered by <Field> only while it has focus
// (so it also appears inside windows, which are separate native layers), and never by the hidden scanner input. See lib/scannerKeyboardHint.ts.
// Plain React Native views: kit.tsx imports this file.
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import { useKeyboardOverlap } from './keyboard';
import { isTraining } from '../lib/trainingGuard';
import { HINT_SHOW_MS, TIP_TEXT, hintDueIn, markHintShown } from '../lib/scannerKeyboardHint';

/** `idleSince` changes on focus and on every keystroke, which restarts the quiet spell and hides a tip that is showing. */
export default function ScannerKeyboardHint({ idleSince }: { idleSince: number }) {
  const overlap = useKeyboardOverlap(); const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    if (isTraining()) return undefined; // practice has its own guidance and no real scanner
    const due = hintDueIn({ now: Date.now(), idleSince, overlap });
    if (due === null) return undefined;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const show = setTimeout(() => {
      markHintShown(); setShown(true);
      try { AccessibilityInfo.announceForAccessibility(TIP_TEXT); } catch { /* not announced */ }
      hide = setTimeout(() => setShown(false), HINT_SHOW_MS);
    }, due);
    return () => { clearTimeout(show); if (hide) clearTimeout(hide); };
  }, [idleSince, overlap]);
  if (!shown) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: -6, alignItems: 'center', zIndex: 50, elevation: 6 }}>
      <Pressable onPress={() => setShown(false)} accessibilityRole="button" accessibilityLabel={`${TIP_TEXT}. Tap to dismiss.`} hitSlop={8}
        style={{ backgroundColor: '#111', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, maxWidth: '100%' }}>
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13, textAlign: 'center' }}>{TIP_TEXT}</Text>
      </Pressable>
    </View>
  );
}
