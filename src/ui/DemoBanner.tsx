// Location: src/ui/DemoBanner.tsx
// The thin bar across the top of the whole app while Demo mode is on (F8). It says so, and leaves in one tap,
// so there is never any doubt that what is on screen is not the real till.
import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Txt } from './kit';
import { useTheme } from './theme';
import { useNav } from './nav';
import { useDemo } from '../state/demoSession';

export default function DemoBanner() {
  const { c } = useTheme(); const nav = useNav(); const active = useDemo(s => s.active);
  if (!active) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.accent, paddingHorizontal: 12, paddingVertical: 6 }}>
      <Ionicons name="flask-outline" size={15} color={c.onAccent} />
      <Txt size={12} weight="700" color={c.onAccent} style={{ flex: 1 }}>DEMO MODE  ·  nothing here is real</Txt>
      <Pressable onPress={() => { useDemo.getState().leave(); nav.reset(); nav.setTab('more'); }} accessibilityRole="button" accessibilityLabel="Leave demo mode" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.onAccent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
        <Ionicons name="exit-outline" size={13} color={c.accent} />
        <Txt size={12} weight="700" color={c.accent}>Leave</Txt>
      </Pressable>
    </View>
  );
}
