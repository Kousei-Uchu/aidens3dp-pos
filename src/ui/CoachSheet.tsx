// Location: src/ui/CoachSheet.tsx
// The practice mode coach (patch 0173, plan 3.7): a small window opened from the training dock during a Check. The person types a question,
// the app raises the hint ladder one rung (the same ladder the Hint button uses) and the model answers from the task and the rungs unlocked so far.
// The logic is in lib/assistantCoach.ts. This file only reads the till, the key and the clock, and draws.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { Btn, Field, Txt } from './kit';
import { useTheme } from './theme';
import { useKeyboardOverlap } from './keyboard';
import { useApp } from '../state/store';
import { realSignIn, useTraining } from '../state/trainingSession';
import { getModule } from '../training';
import { actingRole } from '../lib/adjustPerms';
import { isConfigured } from '../lib/assistantConfig';
import { getAssistantKey } from '../lib/assistantKey';
import { AssistantError } from '../lib/assistantClient';
import { assistantFetch } from '../lib/tcpFetchIO';
import { COACH_NOT_SET_UP, COACH_STRAY_LINE, COACH_TOOL_LIMIT, askCoach, coachEndLine, coachTools, hintOnlyReply, planCoachAsk, setThread, threadAt, threadKey, type CoachTask, type CoachTurn } from '../lib/assistantCoach';
import { buildEvent, logEndpoint, logStaff } from '../lib/assistantLog';
import { assistantLog, coachLogSink } from '../lib/assistantLogIO';
import { bannerFor, type Prepared } from '../lib/assistantChat';
import { makeToolSet } from '../lib/assistantTools';
import { builtinScreens } from '../lib/assistantScreens';
import { builtinHelp } from '../lib/helpBuiltin';
import { uid } from '../lib/ids';
import { lockRequired } from '../lib/appMode';

export default function CoachSheet({ onClose }: { onClose: () => void }) {
  const { c } = useTheme(); const overlap = useKeyboardOverlap();
  const run = useTraining(s => s.run); const hint = useTraining(s => s.hint); const cfg = useApp(s => s.settings.assistant);
  const mod = run ? getModule(run.moduleId) : undefined;
  const goal = mod && run && (run.stage === 'check1' || run.stage === 'check2') ? (run.stage === 'check1' ? mod.check1 : mod.check2)[run.goalIndex] : undefined;
  const task: CoachTask | null = useMemo(() => (mod && goal ? { moduleTitle: mod.title, moduleSummary: mod.summary, goalId: goal.id, goalTitle: goal.title, ladder: goal.ladder } : null), [mod, goal]);
  const key = mod && run && goal ? threadKey(mod.id, run.stage, goal.id) : '';
  const level = goal && hint.goal === goal.id ? hint.level : 0;
  const [turns, setTurns] = useState<CoachTurn[]>([]); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [line, setLine] = useState('');
  const scroller = useRef<ScrollView>(null);
  // A new goal, or Start again (which puts the ladder back to the bottom), changes the thread: turns made above the rung the person is on are dropped.
  useEffect(() => { setTurns(key ? threadAt(key, level) : []); setLine(''); }, [key, level === 0]);
  useEffect(() => { const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 50); return () => clearTimeout(t); }, [turns.length, busy]);

  const used = goal ? Math.min(level, goal.ladder.length) : 0; const total = goal ? goal.ladder.length : 0;
  const send = async () => {
    const q = text.trim(); if (!q || busy || !task || !goal || !key) return;
    const t = useTraining.getState(); const stray = !!t.view?.stray; const plan = planCoachAsk(t.hint, task, stray);
    const base = turns; const at = Date.now();
    const asked: CoachTurn = { id: uid(), role: 'user', text: q, at, level: plan.kind === 'ask' ? plan.level : level };
    const commit = (list: CoachTurn[]) => { setTurns(list); setThread(key, list); };
    setText(''); setLine('');
    // Off course, or out of hints: the app answers by itself and the model is not asked. No hint is spent.
    if (plan.kind === 'stray') { commit([...base, asked, { id: uid(), role: 'coach', text: COACH_STRAY_LINE, at: Date.now(), level, source: 'hint' }]); if (t.view?.stray?.how.length) t.openHow(); return; }
    if (plan.kind === 'end') { commit([...base, asked, { id: uid(), role: 'coach', text: coachEndLine(plan.revealed), at: Date.now(), level, source: 'hint' }]); return; }
    // The app raises the ladder, exactly as the Hint button does, and the dock shows the same rung.
    t.pressHint(goal.id, goal.ladder);
    const pending = [...base, asked]; commit(pending);
    if (!isConfigured(cfg)) { commit([...pending, hintOnlyReply(task, plan.level, uid(), Date.now())]); setLine(COACH_NOT_SET_UP); return; }
    setBusy(true); let prepared: Prepared | null = null; const t0 = Date.now(); let apiKey = '';
    const real = realSignIn(); const role = actingRole(lockRequired(real.settings), real.settings.staff, real.staffId);
    const staff = logStaff(real.staffId, real.settings.staff, role); const endpoint = logEndpoint(cfg.baseUrl, cfg.model, cfg.endpointMode);
    const tools = makeToolSet({ pages: builtinHelp().pages, screens: builtinScreens(), role, contextSize: cfg.contextSize, limit: COACH_TOOL_LIMIT, tools: coachTools() });
    try {
      apiKey = await getAssistantKey();
      const r = await askCoach(assistantFetch as any, { task, level: plan.level, text: q, history: base, settings: { contextSize: cfg.contextSize, temperature: cfg.temperature }, endpoint: { baseUrl: cfg.baseUrl, apiKey, model: cfg.model, timeoutSec: cfg.timeoutSec }, id: uid, now: Date.now, tools, onPrepared: p => { prepared = p; } });
      commit([...pending.slice(0, -1), r.user, r.reply]);
      const b = buildEvent({ id: uid(), now: Date.now(), staff, practice: true, endpoint, detail: 'short', p: r.prepared, known: assistantLog.knows, reply: { id: r.reply.id, role: 'assistant', text: r.reply.text, at: r.reply.at }, ms: Date.now() - t0, apiKey, tools: r.records });
      try { await coachLogSink(b.event, b.prompt); } catch { setLine('The coach worked, but the log could not be written. Tell a manager.'); }
    } catch (e) {
      const err = e instanceof AssistantError ? e : new AssistantError('server_error', String((e as Error)?.message ?? 'Something went wrong.'));
      const ban = bannerFor(err, apiKey);
      // The model could not answer: the trainee still gets the hint, which is what the Hint button would have shown.
      commit([...pending, hintOnlyReply(task, plan.level, uid(), Date.now())]); setLine(`${ban.title}. Here is the hint without the coach.`);
      const p = prepared as Prepared | null;
      if (p) { const b = buildEvent({ id: uid(), now: Date.now(), staff, practice: true, endpoint, detail: 'short', p, known: assistantLog.knows, ms: Date.now() - t0, apiKey, tools: tools.records, error: { kind: err.kind, message: err.message } }); try { await coachLogSink(b.event, b.prompt); } catch { /* the hint is already shown */ } }
    } finally { setBusy(false); }
  };

  const canSend = !!text.trim() && !busy && !!task;
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' }}>
        <Pressable accessibilityLabel="Close the coach" onPress={onClose} style={{ flex: 1 }} />
        <View style={{ backgroundColor: c.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '75%', paddingBottom: 12 + overlap, borderTopWidth: 1, borderTopColor: c.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt size={17} weight="700">Ask the coach</Txt>
              <Txt size={12} sub numberOfLines={2}>{goal ? `Goal: ${goal.title}` : 'The coach helps with a Check goal.'}</Txt>
            </View>
            <Btn small kind="secondary" title="Close" onPress={onClose} />
          </View>
          <ScrollView ref={scroller} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }} keyboardShouldPersistTaps="handled">
            {!turns.length ? <Txt size={14} sub>Ask what you are stuck on. The coach points the way without doing it for you, and each question opens the next hint. {total ? `Hints used on this goal: ${used} of ${total}.` : ''}</Txt> : null}
            {turns.map(t => (
              <View key={t.id} style={{ alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: t.role === 'user' ? c.accent : c.fill, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Txt color={t.role === 'user' ? c.onAccent : c.text}>{t.text}</Txt>
                {t.note ? <Txt size={11} sub>{t.note}</Txt> : null}
              </View>
            ))}
            {busy ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ActivityIndicator size="small" color={c.sub} /><Txt size={13} sub>Thinking...</Txt></View> : null}
          </ScrollView>
          {line ? <Txt size={13} color={c.bad} style={{ paddingHorizontal: 16, paddingBottom: 4 }}>{line}</Txt> : null}
          <View style={{ paddingHorizontal: 16, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <View style={{ flex: 1 }}><Field value={text} onChangeText={setText} placeholder="What are you stuck on?" multiline editable={!busy} style={{ borderRadius: 22, paddingHorizontal: 16, maxHeight: 110 }} /></View>
              <Btn title="Ask" icon="arrow-up" onPress={() => void send()} disabled={!canSend} busy={busy} />
            </View>
            <Txt size={11} sub>Asking uses a hint, the same as the Hint button. Emails, phone numbers, card numbers and keys are hidden before anything is sent. Practice questions are logged for the manager.</Txt>
          </View>
        </View>
      </View>
    </Modal>
  );
}
