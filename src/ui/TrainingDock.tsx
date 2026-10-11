// Location: src/ui/TrainingDock.tsx
// The bar under the app during Guide and Check. It is in the layout (not floating), so the app above it shrinks and nothing is hidden behind it.
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLayout, useTheme } from './theme';
import { useTraining } from '../state/trainingSession';
import { getModule } from '../training';
import { STAGE_LABEL } from '../lib/trainingModule';
import { trainingActions } from './trainingActions';
import { Enter } from './Motion';

export default function TrainingDock() {
  const { c } = useTheme(); const { tablet } = useLayout(); const view = useTraining(s => s.view); const run = useTraining(s => s.run); const mod = run ? getModule(run.moduleId) : undefined;
  const pulse = useRef(new Animated.Value(0)).current; const nudge = !!view?.nudge;
  useEffect(() => { if (!nudge) { pulse.setValue(0); return undefined; } const l = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: false }), Animated.timing(pulse, { toValue: 0, duration: 600, useNativeDriver: false })])); l.start(); return () => l.stop(); }, [nudge, pulse]);
  if (!run) return null;
  const check = view?.mode === 'check';
  const btn = { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 };
  return (
    <Enter from="up" distance={56} duration={340}><View style={{ backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line, paddingHorizontal: 12, paddingTop: 10, paddingBottom: tablet ? 12 : 26, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ backgroundColor: '#F59E0B', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}><Text style={{ color: '#111', fontSize: 11, fontWeight: '800' }}>PRACTICE</Text></View>
          <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{mod?.title ?? 'Training'} · {STAGE_LABEL[run.stage]}{view ? ` · ${view.counter}` : ''}</Text>
        </View>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }} numberOfLines={3}>{view?.stray ? `Off course: ${view.stray.title}` : check ? (view?.say ? view.say : view?.objective) : view?.title === mod?.title ? 'Follow the arrows.' : view?.title ?? ''}</Text>
        {check && view?.say ? <Text style={{ color: c.sub, fontSize: 12 }} numberOfLines={2}>Goal: {view.objective}</Text> : null}
        {nudge ? <Text style={{ color: c.warn, fontSize: 12, fontWeight: '700' }}>Stuck? Tap Hint.</Text> : null}
      </View>
      {check ? (
        <Animated.View style={{ borderRadius: 999, borderWidth: 2, borderColor: pulse.interpolate({ inputRange: [0, 1], outputRange: ['transparent', '#F59E0B'] }) }}>
          <Pressable onPress={() => trainingActions.hint()} accessibilityRole="button" accessibilityLabel="Hint" style={[btn, { backgroundColor: c.accent }]}><Ionicons name="help-circle" size={18} color={c.onAccent} /><Text style={{ color: c.onAccent, fontWeight: '700' }}>Hint</Text></Pressable>
        </Animated.View>
      ) : null}
      {check || view?.stray ? <Pressable onPress={() => trainingActions.restart()} accessibilityRole="button" accessibilityLabel="Start this part again" style={[btn, { backgroundColor: c.fill }]}><Ionicons name="refresh" size={16} color={c.text} /><Text style={{ color: c.text, fontWeight: '700' }}>Start again</Text></Pressable> : null}
      {view?.canSkip ? <Pressable onPress={() => trainingActions.skip()} accessibilityRole="button" accessibilityLabel="Skip" style={[btn, { backgroundColor: c.fill }]}><Text style={{ color: c.text, fontWeight: '700' }}>Skip</Text></Pressable> : null}
      <Pressable onPress={() => trainingActions.exit()} accessibilityRole="button" accessibilityLabel="Exit training" style={[btn, { backgroundColor: c.fill }]}><Text style={{ color: c.text, fontWeight: '700' }}>Exit</Text></Pressable>
    </View></Enter>
  );
}
