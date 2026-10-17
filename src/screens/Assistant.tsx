// Location: src/screens/Assistant.tsx
// Help ▸ Ask the assistant (patch 0151): a chat with the model set up in Settings ▸ AI assistant. Since 0157 it can search and read
// the help pages (limited to what the signed in role may see). It still knows nothing about the shop's data. History is kept on
// this iPad, one per staff member, and cleared only by hand.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Btn, Field, IconBtn, Page, Txt, confirm } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import { useKeyboardOverlap } from '../ui/keyboard';
import { useApp } from '../state/store';
import { actingRole, canEditAdjustPerms } from '../lib/adjustPerms';
import { isConfigured } from '../lib/assistantConfig';
import { getAssistantKey } from '../lib/assistantKey';
import { AssistantError } from '../lib/assistantClient';
import { ASK_MANAGER_LINE, HISTORY_CAP, PRACTICE_BLOCK, bannerFor, canRetry, capHistory, historyKey, readHistory, sendBlock, type Banner, type ChatEntry, type Detail } from '../lib/assistantChat';
import { LOG_FAIL_LINE, askLogged, logEndpoint, logStaff } from '../lib/assistantLog';
import { assistantLog, logSink } from '../lib/assistantLogIO';
import { makeToolSet } from '../lib/assistantTools';
import { builtinHelp } from '../lib/helpBuiltin';
import { kvGet, kvSet, kvDel } from '../lib/kv';
import { isTraining } from '../lib/trainingGuard';
import { uid } from '../lib/ids';

export default function Assistant() {
  const { c } = useTheme(); const nav = useNav(); const overlap = useKeyboardOverlap();
  const cfg = useApp(s => s.settings.assistant); const staffId = useApp(s => s.staffId);
  const canEdit = useApp(s => canEditAdjustPerms(actingRole(s.settings.requirePin, s.settings.staff, s.staffId), s.settings.staff));
  const staffList = useApp(s => s.settings.staff); const role = useApp(s => actingRole(s.settings.requirePin, s.settings.staff, s.staffId));
  const key = historyKey(staffId);
  const [hist, setHist] = useState<ChatEntry[]>([]); const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [secs, setSecs] = useState(0);
  const [banner, setBanner] = useState<Banner | null>(null); const [logWarn, setLogWarn] = useState('');
  const failed = useRef<{ text: string; detail: Detail } | null>(null); const scroller = useRef<ScrollView>(null); const histRef = useRef<ChatEntry[]>([]); const keyRef = useRef(key);
  keyRef.current = key; histRef.current = hist;

  useEffect(() => { // switching staff switches to that person's own history
    let on = true; setLoaded(false); setHist([]); setBanner(null); setLogWarn(''); setText('');
    void kvGet<unknown>(key, []).then(r => { if (on) { setHist(readHistory(r)); setLoaded(true); } });
    return () => { on = false; };
  }, [key]);
  useEffect(() => { if (!busy) { setSecs(0); return; } const t = setInterval(() => setSecs(x => x + 1), 1000); return () => clearInterval(t); }, [busy]);
  useEffect(() => { const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 50); return () => clearTimeout(t); }, [hist.length, busy, banner]);

  const blocked = sendBlock({ training: isTraining() });
  const ready = isConfigured(cfg);

  const send = useCallback(async (input: string, detail: Detail) => {
    const trimmed = input.trim(); if (!trimmed || busy) return;
    if (isTraining()) { setBanner({ kind: 'server_error', title: 'Switched off', body: PRACTICE_BLOCK }); return; }
    if (!isConfigured(cfg)) { setBanner(bannerFor(new AssistantError('not_set_up', 'Set up the address and model first.'))); return; }
    const forKey = keyRef.current; setBusy(true); setBanner(null); failed.current = null;
    let apiKey = '';
    try {
      apiKey = await getAssistantKey();
      const out = await askLogged(fetch as any, { history: histRef.current, text: trimmed, detail, settings: { contextSize: cfg.contextSize, temperature: cfg.temperature }, endpoint: { baseUrl: cfg.baseUrl, apiKey, model: cfg.model, timeoutSec: cfg.timeoutSec }, id: uid, now: Date.now,
          tools: makeToolSet({ pages: builtinHelp().pages, role, contextSize: cfg.contextSize }) },
        { staff: logStaff(staffId, staffList, role), practice: false, endpoint: logEndpoint(cfg.baseUrl, cfg.model, cfg.endpointMode), apiKey, known: assistantLog.knows, sink: logSink, newId: uid });
      if (forKey === keyRef.current) setLogWarn(out.logError ? LOG_FAIL_LINE : '');
      if (!out.ok) throw out.error;
      const r = out.result;
      if (forKey !== keyRef.current) return; // a different person signed in while the model was thinking
      const next = capHistory([...histRef.current, r.user, r.reply]); setHist(next); setText(''); await kvSet(forKey, next);
    } catch (e) {
      if (forKey !== keyRef.current) return;
      failed.current = { text: trimmed, detail }; setBanner(bannerFor(e, apiKey));
    } finally { setBusy(false); }
  }, [busy, cfg, staffId, staffList, role]);

  const clear = async () => {
    if (!(await confirm('Clear your chat history?', 'This clears your own messages with the assistant on this iPad. It cannot be undone.', 'Clear', true))) return;
    setHist([]); setBanner(null); await kvDel(keyRef.current);
  };

  const lastReply = hist.length > 0 && hist[hist.length - 1].role === 'assistant';
  const bubble = (e: ChatEntry) => (
    <View key={e.id} style={{ alignSelf: e.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', gap: 3 }}>
      <View style={{ backgroundColor: e.role === 'user' ? c.accent : c.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, borderWidth: e.role === 'user' ? 0 : 1, borderColor: c.line }}>
        <Txt color={e.role === 'user' ? c.onAccent : undefined}>{e.text}</Txt>
      </View>
      {e.note ? <Txt size={12} sub style={{ alignSelf: 'flex-end' }}>{e.note}</Txt> : null}
    </View>
  );

  return (
    <Page title="Ask the assistant" onBack={nav.pop} helpId="settings/assistant"
      right={hist.length ? <IconBtn icon="trash-outline" label="Clear history" onPress={() => void clear()} /> : undefined} scroll={false}>
      <View style={{ flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', paddingBottom: overlap }}>
        <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
          {!ready ? (
            <View style={{ backgroundColor: c.fill, borderRadius: 12, padding: 14, gap: 8 }}>
              <Txt weight="700">The assistant is not set up yet</Txt>
              <Txt size={13} sub>{canEdit ? 'Choose the model in More, Settings, AI assistant.' : ASK_MANAGER_LINE}</Txt>
              {canEdit ? <Btn small kind="secondary" title="Open model settings" onPress={() => nav.push('settings', { sub: 'assistant' })} /> : null}
            </View>
          ) : null}
          {loaded && ready && !hist.length ? <Txt size={13} sub>Ask how something works. This assistant cannot see the shop's products, stock, customers or sales yet, and it never changes anything.</Txt> : null}
          {hist.map(bubble)}
          {busy ? <Txt size={13} sub>{secs >= 5 ? `Still working, ${secs} seconds so far.` : 'Thinking...'}</Txt> : null}
          {lastReply && !busy && !banner ? <Btn small kind="ghost" title="More detail" icon="add-circle-outline" onPress={() => void send('More detail please.', 'more')} /> : null}
        </ScrollView>
        {banner ? (
          <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: c.fill, borderRadius: 12, padding: 12, gap: 6, borderLeftWidth: 4, borderLeftColor: c.bad }}>
            <Txt weight="700">{banner.title}</Txt>
            <Txt size={13}>{banner.body}</Txt>
            {!canEdit ? <Txt size={13} sub>{ASK_MANAGER_LINE}</Txt> : null}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {canRetry(banner.kind) && failed.current ? <Btn small kind="secondary" title="Retry" onPress={() => { const f = failed.current; if (f) void send(f.text, f.detail); }} /> : null}
              {canEdit ? <Btn small kind="ghost" title="Open model settings" onPress={() => nav.push('settings', { sub: 'assistant' })} /> : null}
            </View>
          </View>
        ) : null}
        {logWarn ? <Txt size={13} style={{ marginHorizontal: 16, marginBottom: 8 }} color={c.bad}>{logWarn}</Txt> : null}
        {blocked ? <Txt size={13} sub style={{ marginHorizontal: 16, marginBottom: 8 }}>{blocked}</Txt> : null}
        <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 6 }}>
          <Field value={text} onChangeText={setText} placeholder="Ask a question" multiline editable={!blocked} />
          <Btn title="Send" icon="send" busy={busy} disabled={!text.trim() || !!blocked || !ready} onPress={() => void send(text, 'short')} />
          <Txt size={11} sub>Kept on this iPad for you only, newest {HISTORY_CAP} messages. Conversations are also logged for the manager. Emails, phone numbers, card numbers and keys are hidden before anything is sent.</Txt>
        </View>
      </View>
    </Page>
  );
}

