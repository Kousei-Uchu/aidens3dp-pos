// Location: src/screens/TrainingRun.tsx
// One course run, outside the sandbox: the Info slideshow, the Show animation, the practice-data card before Guide and the Checks,
// and the Done screen. Guide and Check themselves happen on the real screens, driven by TrainingHost.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Btn, Page, Txt, alertMsg } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useNav, type Tab } from '../ui/nav';
import { useApp } from '../state/store';
import { useTraining } from '../state/trainingSession';
import SceneView from '../ui/SceneView';
import Confetti from '../ui/Confetti';
import { MODULES, getModule } from '../training';
import { STAGES, STAGE_LABEL, type Stage, type TrainingModule } from '../lib/trainingModule';
import { beatMs } from '../lib/trainingScene';
import { canOpenStage, elapsedSecs, startRun, type Run } from '../lib/trainingRun';
import { nextSuggested, staffKey, stagesDone } from '../lib/trainingProgress';

const INTRO: Partial<Record<Stage, { title: string; body: string; button: string }>> = {
  guide: { title: 'Guide: do it on the real till', body: 'You will use the real screens with practice data. Nothing is saved, sent or charged, and your real cart is kept exactly as it is. Arrows show you where to tap.', button: 'Start the guide' },
  check1: { title: 'Check 1: now you do it', body: 'The guide is done. Same job, no arrows, and everything goes right this time. Tap Hint if you get stuck.', button: 'Start Check 1' },
  check2: { title: 'Check 2: now things go wrong', body: 'This time the problems that happen at a real counter will happen here. You were shown how to deal with them earlier. Tap Hint if you get stuck.', button: 'Start Check 2' },
};
const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

export default function TrainingRun() {
  const { c } = useTheme(); const nav = useNav(); const run = useTraining(s => s.run); const progress = useTraining(s => s.progress); const who = staffKey(useApp(s => s.staffId));
  const mod = run ? getModule(run.moduleId) : undefined;
  const leave = () => { nav.reset(); nav.setTab('more'); nav.push('training'); };
  if (!run || !mod) return <Page title="Training" onBack={leave}><View style={{ padding: 24 }}><Txt sub>This course is not available. Go back to Training and pick one.</Txt></View></Page>;
  const done = stagesDone(progress, who, mod.id);
  return (
    <Page title={mod.title} onBack={leave} scroll={false}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.card }}>
        {STAGES.map(s => { const d = done.includes(s); const on = run.stage === s; const can = canOpenStage(done, s); return (
          <Pressable key={s} disabled={!can || on} onPress={() => useTraining.getState().setRun(startRun(mod.id, s))} accessibilityRole="button" accessibilityLabel={`${STAGE_LABEL[s]}${d ? ', done' : ''}`}
            style={{ flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? c.accent : d ? c.good : c.fill, opacity: can || on ? 1 : 0.4 }}>
            {d && !on ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}<Txt size={12} weight="700" color={on ? c.onAccent : d ? '#fff' : c.text}>{STAGE_LABEL[s]}</Txt></Pressable>); })}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        {run.stage === 'info' ? <Slides key={`i-${run.startedAt}`} mod={mod} scene="info" /> : null}
        {run.stage === 'show' ? <Slides key={`s-${run.startedAt}`} mod={mod} scene="show" /> : null}
        {(run.stage === 'guide' || run.stage === 'check1' || run.stage === 'check2') ? <Intro mod={mod} run={run} /> : null}
        {run.stage === 'gratify' ? <Gratify mod={mod} run={run} who={who} /> : null}
      </ScrollView>
    </Page>
  );
}

/** Info is stepped by the person (Back and Next). Show plays by itself, with pause and replay. */
function Slides({ mod, scene }: { mod: TrainingModule; scene: 'info' | 'show' }) {
  const sc = scene === 'info' ? mod.info : mod.show; const last = sc.beats.length - 1; const [i, setI] = useState(0); const [playing, setPlaying] = useState(scene === 'show'); const [seenEnd, setSeenEnd] = useState(false);
  useEffect(() => { if (i >= last) setSeenEnd(true); }, [i, last]);
  useEffect(() => { if (!playing) return undefined; const t = setTimeout(() => { if (i < last) setI(i + 1); else setPlaying(false); }, beatMs(sc.beats[i].say)); return () => clearTimeout(t); }, [playing, i, last, sc]);
  const ready = seenEnd; const go = () => useTraining.getState().completeStage();
  return (
    <View style={{ gap: 16 }}>
      <Txt size={13} weight="700" sub>{scene === 'info' ? 'INFO' : 'SHOW THE PROCESS'}</Txt>
      <SceneView scene={sc} index={i} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {scene === 'info' ? <>
          <Btn title="Back" kind="secondary" disabled={i === 0} onPress={() => setI(i - 1)} style={{ flex: 1 }} />
          {i < last ? <Btn title="Next" onPress={() => setI(i + 1)} style={{ flex: 2 }} /> : <Btn title="Continue" onPress={go} style={{ flex: 2 }} />}
        </> : <>
          <Btn title={playing ? 'Pause' : 'Play'} kind="secondary" icon={playing ? 'pause' : 'play'} onPress={() => { if (!playing && i >= last) setI(0); setPlaying(!playing); }} style={{ flex: 1 }} />
          <Btn title="Replay" kind="secondary" icon="refresh" onPress={() => { setI(0); setPlaying(true); }} style={{ flex: 1 }} />
          <Btn title="Continue" disabled={!ready} onPress={go} style={{ flex: 1 }} />
        </>}
      </View>
      {scene === 'show' && !ready ? <Txt size={13} sub style={{ textAlign: 'center' }}>Watch it through once, then you can continue.</Txt> : null}
    </View>
  );
}

function Intro({ mod, run }: { mod: TrainingModule; run: Run }) {
  const { c } = useTheme(); const nav = useNav(); const t = INTRO[run.stage]; const [busy, setBusy] = useState(false);
  if (!t) return null;
  const start = async () => {
    setBusy(true); const msg = await useTraining.getState().startPractice(); setBusy(false);
    if (msg) { alertMsg('Training cannot start yet', msg); return; }
    nav.setTab(mod.tabs[0] as Tab); // leaves this page and shows the real till; TrainingHost takes over from here
  };
  return (
    <View style={{ gap: 14 }}>
      <View style={{ backgroundColor: '#F59E0B', alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}><Txt size={11} weight="700" color="#111">PRACTICE DATA</Txt></View>
      <Txt size={22} weight="700">{t.title}</Txt>
      <Txt>{t.body}</Txt>
      <View style={{ backgroundColor: c.fill, borderRadius: 14, padding: 14, gap: 6 }}>
        <Txt size={13} weight="700">What stays safe</Txt>
        <Txt size={14} sub>Your real cart, sales, drawer and settings are not touched. Nothing is sent to Shopify or the card reader. Exit at any time from the bar at the bottom.</Txt>
      </View>
      <Btn title={t.button} busy={busy} onPress={start} />
    </View>
  );
}

function Gratify({ mod, run, who }: { mod: TrainingModule; run: Run; who: string }) {
  const { c } = useTheme(); const nav = useNav(); const progress = useTraining(s => s.progress); const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => { try { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {} Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start(); }, [pop]);
  const next = nextSuggested(MODULES, progress, who, mod.id); const nextMod = next ? getModule(next) : undefined; const secs = elapsedSecs(run);
  return (
    <View style={{ gap: 18, alignItems: 'center', paddingTop: 12 }}>
      <Confetti seed={run.startedAt % 9973} />
      <Animated.View style={{ transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }], opacity: pop }}><Ionicons name="checkmark-circle" size={140} color={c.good} accessibilityLabel="Course complete" /></Animated.View>
      <View style={{ alignItems: 'center', gap: 4 }}><Txt size={26} weight="700">Course complete</Txt><Txt sub>{mod.title}</Txt></View>
      <View style={{ alignSelf: 'stretch', backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 16, gap: 10 }}>
        <Txt size={13} weight="700" sub>YOU CAN NOW</Txt>
        {mod.recap.map((l, i) => <View key={i} style={{ flexDirection: 'row', gap: 10 }}><Ionicons name="checkmark" size={20} color={c.good} /><Txt style={{ flex: 1 }}>{l}</Txt></View>)}
        <Txt size={13} sub style={{ marginTop: 6 }}>Time {clock(secs)} · Hints used {run.hints}{run.skips ? ` · ${run.skips} step${run.skips === 1 ? '' : 's'} skipped` : ''}</Txt>
      </View>
      {nextMod ? <Btn title={`Next: ${nextMod.title}`} style={{ alignSelf: 'stretch' }} onPress={() => { useTraining.getState().setRun(startRun(nextMod.id)); }} /> : null}
      <Btn title="Back to training" kind="secondary" style={{ alignSelf: 'stretch' }} onPress={() => { nav.reset(); nav.setTab('more'); nav.push('training'); }} />
    </View>
  );
}
