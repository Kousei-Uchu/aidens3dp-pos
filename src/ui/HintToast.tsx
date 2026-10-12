// Location: src/ui/HintToast.tsx
// The card that announces a hint in a Check: a bulb, "Hint 2 of 4" (or "The answer"), the hint, and a small close button. It pulses once each time Hint is pressed
// (see src/lib/hintPulse.ts), gives a light tap and tells VoiceOver. TrainingOverlay places it (it moves out of the way of what you need to tap).
// On the main screen it fades after a reading time because the bar under the app keeps the text; inside a window there is no bar, so it stays until it is closed.
// Uses plain React Native views, not ../ui/kit, because kit imports the training overlay.
import React, { useEffect } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from './theme';
import { useReduceMotion } from './Motion';
import PulseBox from './HintPulse';
import { hintLabel, toastMs } from '../lib/hintPulse';
import type { DockView } from '../state/trainingSession';

export default function HintToast({ view, persist, onClose }: { view: DockView; /** Stay until closed (a window has no bar to keep the text). */ persist: boolean; onClose: () => void }) {
  const { c } = useTheme(); const reduce = useReduceMotion();
  const press = view.hintPress ?? 0; const answer = view.canSkip; const label = hintLabel(view.hintLevel, view.hintsLeft, answer);
  // One effect per press or new text: the tap, the announcement, and (on the main screen) the timer that fades the toast.
  useEffect(() => {
    try { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* no haptics: the pulse is enough */ }
    try { AccessibilityInfo.announceForAccessibility(`${label}. ${view.say}`); } catch { /* not announced */ }
    if (persist) return undefined;
    const t = setTimeout(onClose, toastMs(view.say.length)); return () => clearTimeout(t);
  }, [press, view.say]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <PulseBox k={`${press}|${view.say}`} color={c.accent} radius={14} reduce={reduce} style={{ backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.line, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
      <View accessibilityLiveRegion="polite" style={{ padding: 12, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name={answer ? 'flag' : 'bulb'} size={18} color={c.accent} />
          <Text style={{ color: c.sub, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', flex: 1 }}>{label}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close the hint"><Ionicons name="close" size={20} color={c.sub} /></Pressable>
        </View>
        <Text style={{ color: c.text, fontSize: 15, lineHeight: 21 }}>{view.say}</Text>
      </View>
    </PulseBox>
  );
}
