// Location: src/ui/TrainingDock.tsx
// The bar under the app during Guide and Check. It is in the layout (not floating), so the app above it shrinks and nothing is hidden behind it.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLayout, useTheme } from './theme';
import { useSpotlight } from './spotlight';
import { useTraining } from '../state/trainingSession';
import { getModule } from '../training';
import { STAGE_LABEL } from '../lib/trainingModule';
import { trainingActions } from './trainingActions';
import { Enter, useReduceMotion } from './Motion';
import PulseBox from './HintPulse';
import { hintLabel } from '../lib/hintPulse';
import CoachSheet from './CoachSheet';

export default function TrainingDock() {
  const reduce = useReduceMotion(); const { c } = useTheme(); const sp = useSpotlight(); const { tablet } = useLayout(); const view = useTraining(s => s.view); const run = useTraining(s => s.run); const mod = run ? getModule(run.moduleId) : undefined;
  const pulse = useRef(new Animated.Value(0)).current; const nudge = !!view?.nudge; const [coach, setCoach] = useState(false);
  // The coach belongs to a goal: it closes when the Check moves on or the dock goes.
  useEffect(() => { setCoach(false); }, [run?.stage, run?.goalIndex]);
  useEffect(() => { if (!nudge) { pulse.setValue(0); return undefined; } const l = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: false }), Animated.timing(pulse, { toValue: 0, duration: 600, useNativeDriver: false })])); l.start(); return () => l.stop(); }, [nudge, pulse]);
  if (!run) return null;
  const check = view?.mode === 'check';
  const btn = { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 };
  return (
    <Enter from="up" distance={56} duration={340}><View style={{ backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line, paddingHorizontal: 12, paddingTop: 10, paddingBottom: tablet ? 12 : 26, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ backgroundColor: sp.ring, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}><Text style={{ color: sp.onRing, fontSize: 11, fontWeight: '800' }}>PRACTICE</Text></View>
          <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{mod?.title ?? 'Training'} · {STAGE_LABEL[run.stage]}{view ? ` · ${view.counter}` : ''}</Text>
          {view && view.repeat && view.repeat > 1 ? <View style={{ backgroundColor: sp.ring, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}><Text style={{ color: sp.onRing, fontSize: 11, fontWeight: '800' }}>{`x${view.repeat}`}</Text></View> : null}
        </View>
        {view && check && !view.stray && view.hintLevel > 0 && !!view.say ? (
          // A hint is showing: its box pulses once each time Hint is pressed (and once more if the press changes nothing), so you can see it was given.
          <PulseBox k={`${view.hintPress ?? 0}|${view.say}`} color={c.accent} radius={8} reduce={reduce} origin="left center" style={{ alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, marginLeft: -6 }}>
            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>{hintLabel(view.hintLevel, view.hintsLeft, view.canSkip)}</Text>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }} numberOfLines={3}>{view.say}</Text>
          </PulseBox>
        ) : <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }} numberOfLines={3}>{view?.stray ? `Off course: ${view.stray.title}` : check ? (view?.say ? view.say : view?.objective) : view?.title === mod?.title ? 'Follow the arrows.' : view?.title ?? ''}</Text>}
        {check && view?.say ? <Text style={{ color: c.sub, fontSize: 12 }} numberOfLines={2}>Goal: {view.objective}</Text> : null}
        {nudge ? <Text style={{ color: c.warn, fontSize: 12, fontWeight: '700' }}>Stuck? Tap Hint.</Text> : null}
      </View>
      {check ? (
        <Animated.View style={{ borderRadius: 999, borderWidth: 2, borderColor: pulse.interpolate({ inputRange: [0, 1], outputRange: ['transparent', sp.ring] }) }}>
          <Pressable onPress={() => trainingActions.hint()} accessibilityRole="button" accessibilityLabel="Hint" style={[btn, { backgroundColor: c.accent }]}><Ionicons name="help-circle" size={18} color={c.onAccent} /><Text style={{ color: c.onAccent, fontWeight: '700' }}>Hint</Text></Pressable>
        </Animated.View>
      ) : null}
      {check ? <Pressable onPress={() => setCoach(true)} accessibilityRole="button" accessibilityLabel="Ask the coach" style={[btn, { backgroundColor: c.fill }]}><Ionicons name="chatbubble-ellipses-outline" size={16} color={c.text} /><Text style={{ color: c.text, fontWeight: '700' }}>Ask coach</Text></Pressable> : null}
      {check || view?.stray ? <Pressable onPress={() => trainingActions.restart()} accessibilityRole="button" accessibilityLabel="Start this part again" style={[btn, { backgroundColor: c.fill }]}><Ionicons name="refresh" size={16} color={c.text} /><Text style={{ color: c.text, fontWeight: '700' }}>Start again</Text></Pressable> : null}
      {view?.canSkip ? <Pressable onPress={() => trainingActions.skip()} accessibilityRole="button" accessibilityLabel="Skip" style={[btn, { backgroundColor: c.fill }]}><Text style={{ color: c.text, fontWeight: '700' }}>Skip</Text></Pressable> : null}
      <Pressable onPress={() => trainingActions.exit()} accessibilityRole="button" accessibilityLabel="Exit training" style={[btn, { backgroundColor: c.fill }]}><Text style={{ color: c.text, fontWeight: '700' }}>Exit</Text></Pressable>
    </View>{coach && check ? <CoachSheet onClose={() => setCoach(false)} /> : null}</Enter>
  );
}
