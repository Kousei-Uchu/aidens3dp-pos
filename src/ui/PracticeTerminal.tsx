// Location: src/ui/PracticeTerminal.tsx
// The practice card terminal during Guide and Check: it appears when a card payment starts, so the person sees what the customer sees,
// and goes away when the terminal is asleep again. It is drawn under the training overlay, so the dim, the ring and the pointer work on it like on any other control.
import React, { useEffect, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import VirtualTerminal, { useVt } from './VirtualTerminal';
import { Txt } from './kit';
import { useTheme } from './theme';
import { Enter } from './Motion';
import { trainingVt } from '../lib/trainingTerminal';
import { practiceWidth } from '../lib/virtualTerminal';

export default function PracticeTerminal() {
  const { c } = useTheme(); const s = useVt(trainingVt); const win = useWindowDimensions(); const [hidden, setHidden] = useState(false);
  const awake = s.screen !== 'sleep'; useEffect(() => { if (!awake) setHidden(false); }, [awake]); // a new payment always shows it again
  if (!awake) return null;
  if (hidden) return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 10, bottom: 10 }}>
      <Pressable onPress={() => setHidden(false)} accessibilityRole="button" accessibilityLabel="Show the card terminal" style={{ flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 }}>
        <Ionicons name="card-outline" size={18} color={c.onAccent} /><Txt size={13} weight="700" color={c.onAccent}>Terminal</Txt></Pressable></View>);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 10, bottom: 10 }}>
      <Enter from="up" distance={16} duration={260} pointerEvents="box-none">
        <View style={{ backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 18, padding: 10, gap: 6, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', justifyContent: 'space-between' }}>
            <Txt size={12} weight="700" sub>Card terminal (practice)</Txt>
            <Pressable onPress={() => setHidden(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Hide the card terminal"><Ionicons name="chevron-down" size={18} color={c.sub} /></Pressable></View>
          <VirtualTerminal vt={trainingVt} width={practiceWidth(win.width)} spots controls={trainingVt.manual} />
        </View></Enter></View>);
}
