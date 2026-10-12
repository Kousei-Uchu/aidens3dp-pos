// Location: src/screens/Training.tsx
// More > Training: every course, with a dot per stage and a big green tick once both Checks are passed. Courses are never locked.
import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Page, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { Enter } from '../ui/Motion';
import { stagger } from '../lib/motion';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { useTraining } from '../state/trainingSession';
import { MODULES } from '../training';
import { STAGES, STAGE_LABEL, type Stage } from '../lib/trainingModule';
import { completedCount, isComplete, staffKey, stagesDone } from '../lib/trainingProgress';
import { canOpenStage, startRun } from '../lib/trainingRun';

export const firstOpenStage = (done: readonly Stage[]): Stage => STAGES.find(s => !done.includes(s) && s !== 'gratify') ?? 'info';

export default function Training() {
  const { c } = useTheme(); const nav = useNav(); const progress = useTraining(s => s.progress); const staffId = useApp(s => s.staffId); const who = staffKey(staffId);
  useEffect(() => { void useTraining.getState().loadProgress(); }, []);
  const open = (id: string, stage: Stage) => { useTraining.getState().setRun(startRun(id, stage)); nav.push('trainingRun'); };
  const n = completedCount(progress, who);
  return (
    <Page title="Training" onBack={nav.pop}>
      <View style={{ padding: 16, gap: 12 }}>
        <Enter delay={stagger(0, 120)}><Txt sub>Short courses for each job at the till. Do them in any order. Practice data is used, so nothing is saved, sent or charged.</Txt></Enter>
        <Enter delay={stagger(1, 120)}><Txt size={13} weight="700" sub>{n} of {MODULES.length} finished</Txt></Enter>
        {MODULES.map((m, mi) => {
          const done = stagesDone(progress, who, m.id); const complete = isComplete(progress, who, m.id);
          return (
            <Enter key={m.id} delay={stagger(mi + 2, 120)} distance={18}><Card style={{ padding: 16, gap: 10, borderColor: complete ? c.good : c.line, borderWidth: complete ? 2 : 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {complete ? <Ionicons name="checkmark-circle" size={40} color={c.good} accessibilityLabel="Finished" /> : <Ionicons name="school-outline" size={34} color={c.sub} />}
                <View style={{ flex: 1 }}>
                  <Txt size={17} weight="700">{m.title}</Txt>
                  <Txt size={13} sub>{m.minutes} min{m.suggestedFirst && !complete ? ' · Suggested first' : ''}</Txt>
                </View>
              </View>
              <Txt sub>{m.summary}</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {STAGES.filter(s => s !== 'gratify').map(s => { const d = done.includes(s); const can = canOpenStage(done, s); return (
                  <Pressable key={s} disabled={!can} onPress={() => open(m.id, s)} accessibilityRole="button" accessibilityLabel={`${STAGE_LABEL[s]}${d ? ', done' : ''}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: d ? c.good : c.fill, opacity: can ? 1 : 0.45 }}>
                    {d ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}<Txt size={13} weight="700" color={d ? '#fff' : c.text}>{STAGE_LABEL[s]}</Txt></Pressable>); })}
              </View>
              <Pressable onPress={() => open(m.id, complete ? 'info' : firstOpenStage(done))} accessibilityRole="button" style={{ backgroundColor: c.accent, borderRadius: 999, paddingVertical: 13, alignItems: 'center' }}>
                <Txt weight="700" color={c.onAccent}>{complete ? 'Do it again' : done.length ? 'Continue' : 'Start'}</Txt></Pressable>
            </Card></Enter>);
        })}
        <Enter delay={stagger(MODULES.length + 2, 120)} distance={18}><Card style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Ionicons name="card-outline" size={34} color={c.sub} /><View style={{ flex: 1 }}><Txt size={17} weight="700">Virtual terminal</Txt><Txt size={13} sub>Practice Zeller Terminal 2</Txt></View></View>
          <Txt sub>Try the card terminal on its own: ask it for a payment, tap or insert a card, key a PIN, and see every screen it can show.</Txt>
          <Pressable onPress={() => nav.push('terminalPlay')} accessibilityRole="button" style={{ backgroundColor: c.fill, borderRadius: 999, paddingVertical: 13, alignItems: 'center' }}><Txt weight="700">Open</Txt></Pressable>
        </Card></Enter>
      </View>
    </Page>
  );
}
