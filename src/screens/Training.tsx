// Location: src/screens/Training.tsx
// More > Training: every course, with a dot per stage and a big green tick once both Checks are passed. Courses are never locked.
import React, { useMemo, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Page, Txt, confirm } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { Enter } from '../ui/Motion';
import { stagger } from '../lib/motion';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { useTraining } from '../state/trainingSession';
import { useDemo } from '../state/demoSession';
import { MODULES } from '../training';
import { STAGES, STAGE_LABEL, type Stage } from '../lib/trainingModule';
import { canResetProgress, completedCount, isComplete, staffKey, stagesDone } from '../lib/trainingProgress';
import { moduleAvailable } from '../lib/appMode';
import { canOpenStage, startRun } from '../lib/trainingRun';

export const firstOpenStage = (done: readonly Stage[]): Stage => STAGES.find(s => !done.includes(s) && s !== 'gratify') ?? 'info';

export default function Training() {
  const { c } = useTheme(); const nav = useNav(); const progress = useTraining(s => s.progress); const staffId = useApp(s => s.staffId); const who = staffKey(staffId);
  useEffect(() => { void useTraining.getState().loadProgress(); }, []);
  // Starting a course while Demo mode is on leaves Demo mode first: a course does its own swap and its own guard.
  const open = (id: string, stage: Stage) => { if (useDemo.getState().active) useDemo.getState().leave(); useTraining.getState().setRun(startRun(id, stage)); nav.push('trainingRun'); };
  // A companion lists the courses for what it holds (the register courses are the Till training group); the count follows the list.
  const devMode = useApp(st => st.settings.appMode); const devFeatures = useApp(st => st.settings.registerFeatures);
  const shown = useMemo(() => MODULES.filter(m => moduleAvailable(devMode, devFeatures, m)), [devMode, devFeatures]);
  // Owners reset anyone's progress and managers reset cashiers' (decisions item 15, O1). The reset reaches the other registers with iCloud sync.
  const staff = useApp(st => st.settings.staff); const me = staff.find(x => x.id === staffId);
  const resettable = me ? staff.filter(x => canResetProgress(me.role, x.role)) : []; const [openWho, setOpenWho] = useState<string | null>(null);
  const n = shown.filter(m => progress.by[who]?.[m.id]?.done).length;
  return (
    <Page title="Training" onBack={nav.pop}>
      <View style={{ padding: 16, gap: 12 }}>
        <Enter delay={stagger(0, 120)}><Txt sub>Short courses for each job at the till. Do them in any order. Practice data is used, so nothing is saved, sent or charged.</Txt></Enter>
        <Enter delay={stagger(1, 120)}><Txt size={13} weight="700" sub>{n} of {shown.length} finished</Txt></Enter>
        {shown.map((m, mi) => {
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
        <Enter delay={stagger(shown.length + 2, 120)} distance={18}><Card style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Ionicons name="card-outline" size={34} color={c.sub} /><View style={{ flex: 1 }}><Txt size={17} weight="700">Virtual terminal</Txt><Txt size={13} sub>Practice Zeller Terminal 2</Txt></View></View>
          <Txt sub>Try the card terminal on its own: ask it for a payment, tap or insert a card, key a PIN, and see every screen it can show.</Txt>
          <Pressable onPress={() => nav.push('terminalPlay')} accessibilityRole="button" style={{ backgroundColor: c.fill, borderRadius: 999, paddingVertical: 13, alignItems: 'center' }}><Txt weight="700">Open</Txt></Pressable>
        </Card></Enter>
        {resettable.length ? <Enter delay={stagger(shown.length + 3, 120)} distance={18}><Card style={{ padding: 16, gap: 10 }}>
          <Txt size={17} weight="700">Reset someone's progress</Txt>
          <Txt size={13} sub>Wipes the ticks so they can take a course again. With iCloud sync on, it clears on every register.</Txt>
          {resettable.map(x => { const fin = completedCount(progress, x.id); const isOpen = openWho === x.id; return (
            <View key={x.id} style={{ gap: 6 }}>
              <Pressable onPress={() => setOpenWho(isOpen ? null : x.id)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                <Txt weight="700" style={{ flex: 1 }}>{x.name}</Txt><Txt size={13} sub>{fin} finished</Txt><Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={c.sub} /></Pressable>
              {isOpen ? <View style={{ gap: 6 }}>
                {shown.filter(m => progress.by[x.id]?.[m.id]).map(m => (
                  <Pressable key={m.id} onPress={async () => { if (await confirm('Reset this course?', `${x.name}'s progress in "${m.title}" will be cleared.`, 'Reset', true)) useTraining.getState().resetProgress(x.id, m.id); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: c.fill }}>
                    <Txt size={13} style={{ flex: 1 }}>{m.title}</Txt><Txt size={13} weight="700" color={c.bad}>Reset</Txt></Pressable>))}
                <Pressable onPress={async () => { if (await confirm('Reset all courses?', `All of ${x.name}'s training progress will be cleared.`, 'Reset all', true)) { useTraining.getState().resetProgress(x.id, null); setOpenWho(null); } }} accessibilityRole="button" style={{ paddingVertical: 10, alignItems: 'center', borderRadius: 999, backgroundColor: c.fill }}><Txt weight="700" color={c.bad}>Reset all courses</Txt></Pressable>
              </View> : null}
            </View>); })}
        </Card></Enter> : null}
      </View>
    </Page>
  );
}
