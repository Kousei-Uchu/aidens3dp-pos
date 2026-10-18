// Location: src/screens/Assistant.tsx
// Help ▸ Ask the assistant (patch 0151): a chat with the model set up in Settings ▸ AI assistant. Since 0157 it can search and read
// the help pages, since 0158 it can search the app's screens (both limited to what the signed in role may see), and since 0159 it can put
// a button under a reply that opens a help page or a screen. Since 0162 the button can be "Guide me to ...", which points at each tap on the way. It still knows
// nothing about the shop's data. History is kept on
// this iPad, one per staff member, and cleared only by hand.
// Since 0160, when the model cannot answer (or is not set up) the chat shows the error and still searches the screens and the help
// pages with no model, and lists the matches (plan 3.3). The next question tries the model first again.
import { assistantFetch } from '../lib/tcpFetchIO';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Btn, Chip, Field, IconBtn, Page, Row, Txt, confirm } from '../ui/kit';
import ChatMarkdown from '../ui/ChatMarkdown';
import { useTheme } from '../ui/theme';
import { useNav, type Tab } from '../ui/nav';
import { useKeyboardOverlap } from '../ui/keyboard';
import { useUi } from '../ui/uiProfile';
import { useApp } from '../state/store';
import { actingRole, canEditAdjustPerms } from '../lib/adjustPerms';
import { classifyEndpoint, isConfigured } from '../lib/assistantConfig';
import { getAssistantKey } from '../lib/assistantKey';
import { AssistantError } from '../lib/assistantClient';
import { ASK_MANAGER_LINE, HISTORY_CAP, PRACTICE_BLOCK, bannerFor, canRetry, capHistory, historyKey, readHistory, sendBlock, withoutExchange, type Banner, type ChatEntry, type Detail } from '../lib/assistantChat';
import { LOG_FAIL_LINE, askLogged, buildOfflineEvent, logEndpoint, logOffline, logStaff } from '../lib/assistantLog';
import { OFFLINE_EMPTY, OFFLINE_LABEL, hasOfflineHits, offlineExchange, offlineSearch } from '../lib/assistantOffline';
import { assistantLog, logSink } from '../lib/assistantLogIO';
import { resolvePolicy } from '../lib/assistantGate';
import { liveLinks, makeToolSet, resolveLink, type LinkAction } from '../lib/assistantTools';
import { takeAssistantData, takeCatalogue } from '../lib/assistantDataIO';
import { takeTillState } from '../lib/assistantStatusIO';
import { takeCashState } from '../lib/assistantCashIO';
import { builtinScreens, type ScreenEntry } from '../lib/assistantScreens';
import { registerContext } from '../lib/assistantContext';
import { screenOfRoute } from '../lib/appGraph';
import { startGuide } from '../lib/assistantGuide';
import type { Page as HelpPage } from '../lib/helpDocs';
import { builtinHelp } from '../lib/helpBuiltin';
import { kvGet, kvSet, kvDel } from '../lib/kv';
import { isTraining } from '../lib/trainingGuard';
import { uid } from '../lib/ids';

/** Questions to start with, shown while the chat is empty. Each one is sent as it stands. */
const STARTERS = ['How do I refund a card payment?', 'What is low on stock?', 'How much did we sell today?', 'Show me how to get to Reports'];
const clock = (at: number): string => { const d = new Date(at); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };

/** The round badge beside the assistant's messages. */
function Avatar({ size = 30 }: { size?: number }) {
  const { c } = useTheme();
  return <View accessibilityElementsHidden style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="sparkles" size={Math.round(size * 0.52)} color={c.onAccent} /></View>;
}

/**
 * The list shown in place of a reply when the model could not answer. It is searched here, with the role signed in now, from the question
 * before it. A help page opens on tap; a screen gets an Open button when it can be opened that way (the same rule as the model's buttons),
 * and always lists the taps from Checkout.
 */
function OfflineList({ query, role, pages, screens, onOpen }: { query: string; role: string; pages: HelpPage[]; screens: ScreenEntry[]; onOpen: (a: LinkAction) => void }) {
  const { c } = useTheme();
  const hits = React.useMemo(() => offlineSearch({ pages, screens, role, catalogue: takeCatalogue() }, query), [pages, screens, role, query]);
  return (
    <View style={{ alignSelf: 'flex-start', maxWidth: '92%', gap: 8, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.line, paddingVertical: 10 }}>
      <Txt weight="700" style={{ paddingHorizontal: 14 }}>{OFFLINE_LABEL}</Txt>
      {!hasOfflineHits(hits) ? <Txt size={13} sub style={{ paddingHorizontal: 14 }}>{OFFLINE_EMPTY}</Txt> : null}
      {hits.screens.length ? (
        <View style={{ gap: 10, paddingHorizontal: 14 }}>
          <Txt size={12} sub weight="700">SCREENS</Txt>
          {hits.screens.map(sc => {
            const open = resolveLink({ pages, screens, role }, 'screen', sc.id);
            return (
              <View key={sc.id} style={{ gap: 2, alignItems: 'flex-start' }}>
                <Txt weight="600">{sc.name} <Txt size={12} sub>({sc.kind})</Txt></Txt>
                {sc.summary ? <Txt size={13} sub>{sc.summary}</Txt> : null}
                {sc.how_to_open && sc.how_to_open.length ? <Txt size={13}>From Checkout: {sc.how_to_open.join(' ')}</Txt> : null}
                {open ? <Btn small kind="secondary" icon="open-outline" title={open.link.label} onPress={() => onOpen(open.action)} /> : null}
              </View>
            );
          })}
        </View>
      ) : null}
      {hits.products && hits.products.length ? (
        <View style={{ gap: 8, paddingHorizontal: 14 }}>
          <Txt size={12} sub weight="700">PRODUCTS</Txt>
          {hits.products.map(p => (
            <View key={p.name} style={{ gap: 2 }}>
              <Txt weight="600">{p.name} <Txt size={13} sub>{p.price} · {p.stock}</Txt></Txt>
              {p.variants.map(v => <Txt key={v.name} size={13} sub>{v.name}: {v.stock}</Txt>)}
            </View>
          ))}
        </View>
      ) : null}
      {hits.stock ? (
        <View style={{ gap: 4, paddingHorizontal: 14 }}>
          <Txt size={12} sub weight="700">{hits.stock.title.toUpperCase()}</Txt>
          {hits.stock.rows.length ? hits.stock.rows.map(r => <Txt key={r.name} size={13}>{r.name}: {r.stock}</Txt>) : <Txt size={13} sub>Nothing to list.</Txt>}
          {hits.stock.more ? <Txt size={13} sub>and {hits.stock.more} more. Open Inventory to see them all.</Txt> : null}
        </View>
      ) : null}
      {hits.pages.length ? (
        <View>
          <Txt size={12} sub weight="700" style={{ paddingHorizontal: 14, paddingBottom: 2 }}>HELP PAGES</Txt>
          {hits.pages.map((p, i) => <Row key={p.id} title={p.title} sub={p.summary} icon="document-text-outline" last={i === hits.pages.length - 1} onPress={() => onOpen({ to: 'help', id: p.id })} />)}
        </View>
      ) : null}
    </View>
  );
}

export default function Assistant() {
  const { c } = useTheme(); const nav = useNav(); const overlap = useKeyboardOverlap();
  const cfg = useApp(s => s.settings.assistant); const staffId = useApp(s => s.staffId);
  const canEdit = useApp(s => canEditAdjustPerms(actingRole(s.settings.requirePin, s.settings.staff, s.staffId), s.settings.staff));
  const staffList = useApp(s => s.settings.staff); const role = useApp(s => actingRole(s.settings.requirePin, s.settings.staff, s.staffId));
  const key = historyKey(staffId);
  const [hist, setHist] = useState<ChatEntry[]>([]); const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [secs, setSecs] = useState(0);
  const [banner, setBanner] = useState<Banner | null>(null); const [logWarn, setLogWarn] = useState('');
  // `search` is whether a failure also searches with no model (not for "More detail"); `replace` is the question a retry takes the place of.
  const failed = useRef<{ text: string; detail: Detail; search: boolean; replace?: string } | null>(null); const scroller = useRef<ScrollView>(null); const histRef = useRef<ChatEntry[]>([]); const keyRef = useRef(key);
  keyRef.current = key; histRef.current = hist;
  // Where the person was and how the till is set up for them, read when a question is sent (patch 0167), so the send callback does not change on every tap.
  const ui = useUi(); const registerName = useApp(s => s.settings.registerName);
  const navRef = useRef(nav); const uiRef = useRef(ui); const regRef = useRef(registerName); navRef.current = nav; uiRef.current = ui; regRef.current = registerName;

  useEffect(() => { // switching staff switches to that person's own history
    let on = true; setLoaded(false); setHist([]); setBanner(null); setLogWarn(''); setText('');
    void kvGet<unknown>(key, []).then(r => { if (on) { setHist(readHistory(r)); setLoaded(true); } });
    return () => { on = false; };
  }, [key]);
  useEffect(() => { if (!busy) { setSecs(0); return; } const t = setInterval(() => setSecs(x => x + 1), 1000); return () => clearInterval(t); }, [busy]);
  useEffect(() => { const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 50); return () => clearTimeout(t); }, [hist.length, busy, banner]);

  const blocked = sendBlock({ training: isTraining() });
  const ready = isConfigured(cfg);

  const helpPages = React.useMemo(() => builtinHelp().pages, []);
  const screenList = React.useMemo(() => builtinScreens(), []);

  const send = useCallback(async (input: string, detail: Detail, o: { search?: boolean; replace?: string } = {}) => {
    const trimmed = input.trim(); if (!trimmed || busy) return;
    if (isTraining()) { setBanner({ kind: 'server_error', title: 'Switched off', body: PRACTICE_BLOCK }); return; }
    const search = o.search !== false; const forKey = keyRef.current; const t0 = Date.now();
    // Taken now, before anything is awaited, so it is where the person was when they asked, even if they leave the chat while the model thinks.
    const where = registerContext({ tab: navRef.current.tab, stack: navRef.current.stack, screenOfRoute, mode: uiRef.current.mode, tabs: uiRef.current.tabs, guided: uiRef.current.guided, practice: isTraining(), register: regRef.current });
    setBusy(true); setBanner(null); failed.current = null;
    let apiKey = '';
    // The model could not answer: say why, and search the screens and help pages with no model (plan 3.3). It replaces the exchange a retry came from.
    const goOffline = async (e: unknown) => {
      const err = e instanceof AssistantError ? e : new AssistantError('server_error', String((e as Error)?.message ?? 'Something went wrong.'));
      setBanner(bannerFor(err, apiKey));
      if (!search) { failed.current = { text: trimmed, detail, search }; return; }
      setText('');
      const ex = offlineExchange({ text: trimmed, ctx: { pages: helpPages, screens: screenList, role, catalogue: takeCatalogue() }, id: uid, now: Date.now });
      failed.current = { text: trimmed, detail, search, replace: ex.user.id };
      const next = capHistory([...withoutExchange(histRef.current, o.replace), ex.user, ex.reply]); setHist(next); await kvSet(forKey, next);
      const line = await logOffline({ sink: logSink }, buildOfflineEvent({ id: uid(), now: Date.now(), staff: logStaff(staffId, staffList, role), endpoint: logEndpoint(cfg.baseUrl, cfg.model, cfg.endpointMode), user: ex.user, cause: err.kind, screens: ex.hits.screens.map(x => x.id), pages: ex.hits.pages.map(x => x.id), products: (ex.hits.products ?? []).map(x => x.name), ms: Date.now() - t0, apiKey }));
      if (forKey === keyRef.current) setLogWarn(line ?? '');
    };
    try {
      if (!isConfigured(cfg)) { await goOffline(new AssistantError('not_set_up', 'Set up the address and model first.')); return; }
      apiKey = await getAssistantKey();
      const shopData = await takeAssistantData(); const till = takeTillState(role); const cash = takeCashState();
      const out = await askLogged(assistantFetch as any, { history: histRef.current, text: trimmed, detail, settings: { contextSize: cfg.contextSize, temperature: cfg.temperature }, endpoint: { baseUrl: cfg.baseUrl, apiKey, model: cfg.model, timeoutSec: cfg.timeoutSec }, id: uid, now: Date.now,
          tools: makeToolSet({ pages: helpPages, screens: screenList, role, contextSize: cfg.contextSize, policy: resolvePolicy(classifyEndpoint(cfg.baseUrl, cfg.endpointMode), cfg.gate), ...(shopData ? { data: shopData } : {}), ...(till ? { till } : {}), ...(cash ? { cash } : {}), where }) },
        { staff: logStaff(staffId, staffList, role), practice: false, endpoint: logEndpoint(cfg.baseUrl, cfg.model, cfg.endpointMode), apiKey, known: assistantLog.knows, sink: logSink, newId: uid });
      if (forKey === keyRef.current) setLogWarn(out.logError ? LOG_FAIL_LINE : '');
      if (!out.ok) throw out.error;
      const r = out.result;
      if (forKey !== keyRef.current) return; // a different person signed in while the model was thinking
      const next = capHistory([...withoutExchange(histRef.current, o.replace), r.user, r.reply]); setHist(next); setText(''); await kvSet(forKey, next);
    } catch (e) {
      if (forKey !== keyRef.current) return;
      await goOffline(e);
    } finally { setBusy(false); }
  }, [busy, cfg, staffId, staffList, role, helpPages, screenList]);

  const clear = async () => {
    if (!(await confirm('Clear your chat history?', 'This clears your own messages with the assistant on this iPad. It cannot be undone.', 'Clear', true))) return;
    setHist([]); setBanner(null); await kvDel(keyRef.current);
  };

  const lastReply = hist.length > 0 && hist[hist.length - 1].role === 'assistant' && !hist[hist.length - 1].offline;
  // A guide starts from the Checkout tab, which is where the walks it points along begin.
  const open = (a: LinkAction) => {
    if (a.to === 'guide') { if (startGuide({ ...a.guide, ...(staffId ? { staffId } : {}) })) nav.setTab('checkout'); return; }
    if (a.to === 'help') nav.push('help', { id: a.id }); else if (a.to === 'tab') nav.setTab(a.tab as Tab); else nav.push(a.route);
  };
  // Checked again each time it is drawn, for the role signed in now, so a button a role can no longer reach is not shown.
  const buttons = (e: ChatEntry) => (e.role === 'assistant' ? liveLinks({ pages: helpPages, screens: screenList, role }, e.links) : []);
  const bubble = (e: ChatEntry, i: number) => {
    if (e.offline) return <OfflineList key={e.id} query={hist[i - 1]?.text ?? ''} role={role} pages={helpPages} screens={screenList} onOpen={open} />;
    const mine = e.role === 'user'; const btns = buttons(e); const time = clock(e.at);
    return (
      <View key={e.id} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: mine ? '82%' : '94%' }}>
        {mine ? null : <Avatar />}
        <View style={{ flexShrink: 1, gap: 4, alignItems: mine ? 'flex-end' : 'flex-start' }}>
          <View style={{ backgroundColor: mine ? c.accent : c.card, borderRadius: 18, borderBottomRightRadius: mine ? 5 : 18, borderBottomLeftRadius: mine ? 18 : 5, paddingHorizontal: 14, paddingVertical: 10, borderWidth: mine ? 0 : 1, borderColor: c.line }}>
            {mine ? <Txt color={c.onAccent}>{e.text}</Txt> : <ChatMarkdown text={e.text} />}
          </View>
          {e.note ? <Txt size={12} sub>{e.note}</Txt> : null}
          {btns.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {btns.map(b => <Btn key={`${b.link.kind}:${b.link.id}`} small kind="secondary" icon={b.link.kind === 'doc' ? 'book-outline' : b.link.kind === 'guide' ? 'navigate-outline' : 'open-outline'} title={b.link.label} onPress={() => open(b.action)} />)}
            </View>
          ) : null}
          {time ? <Txt size={11} sub>{time}</Txt> : null}
        </View>
      </View>
    );
  };
  const canSend = !!text.trim() && !blocked && !busy;

  return (
    <Page title="Ask the assistant" onBack={nav.pop} helpId="settings/assistant"
      right={hist.length ? <IconBtn icon="trash-outline" label="Clear history" onPress={() => void clear()} /> : undefined} scroll={false}>
      <View style={{ flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', paddingBottom: overlap }}>
        <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
          {!ready ? (
            <View style={{ backgroundColor: c.fill, borderRadius: 12, padding: 14, gap: 8 }}>
              <Txt weight="700">The assistant is not set up yet</Txt>
              <Txt size={13} sub>{canEdit ? 'Choose the model in More, Settings, AI assistant.' : ASK_MANAGER_LINE} Until then you can still ask here and it will search the screens and help pages.</Txt>
              {canEdit ? <Btn small kind="secondary" title="Open model settings" onPress={() => nav.push('settings', { sub: 'assistant' })} /> : null}
            </View>
          ) : null}
          {loaded && !hist.length ? (
            <View style={{ alignItems: 'center', gap: 10, paddingTop: 24, paddingBottom: 8 }}>
              <Avatar size={52} />
              <Txt size={19} weight="700">Ask the assistant</Txt>
              <Txt size={14} sub style={{ textAlign: 'center', maxWidth: 420 }}>Ask how something works or where to find it. It can also look up this till's sales, orders, deals, customers, gift card activity, products and stock, the cash drawer, and the sale in progress. It never changes anything.</Txt>
              {!blocked ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingTop: 6 }}>
                  {STARTERS.map(q => <Chip key={q} label={q} icon="chatbubble-ellipses-outline" onPress={() => void send(q, 'short')} />)}
                </View>
              ) : null}
            </View>
          ) : null}
          {hist.map((e, i) => bubble(e, i))}
          {busy ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
              <Avatar />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderRadius: 18, borderBottomLeftRadius: 5, borderWidth: 1, borderColor: c.line, paddingHorizontal: 14, paddingVertical: 10 }}>
                <ActivityIndicator size="small" color={c.sub} />
                <Txt size={13} sub>{secs >= 5 ? `Still working, ${secs} seconds so far.` : 'Thinking...'}</Txt>
              </View>
            </View>
          ) : null}
          {lastReply && !busy && !banner ? <Btn small kind="ghost" title="More detail" icon="add-circle-outline" onPress={() => void send('More detail please.', 'more', { search: false })} /> : null}
        </ScrollView>
        {banner ? (
          <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: c.fill, borderRadius: 12, padding: 12, gap: 6, borderLeftWidth: 4, borderLeftColor: c.bad }}>
            <Txt weight="700">{banner.title}</Txt>
            <Txt size={13}>{banner.body}</Txt>
            {!canEdit ? <Txt size={13} sub>{ASK_MANAGER_LINE}</Txt> : null}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {canRetry(banner.kind) && failed.current ? <Btn small kind="secondary" title="Retry" onPress={() => { const f = failed.current; if (f) void send(f.text, f.detail, { search: f.search, replace: f.replace }); }} /> : null}
              {canEdit ? <Btn small kind="ghost" title="Open model settings" onPress={() => nav.push('settings', { sub: 'assistant' })} /> : null}
            </View>
          </View>
        ) : null}
        {logWarn ? <Txt size={13} style={{ marginHorizontal: 16, marginBottom: 8 }} color={c.bad}>{logWarn}</Txt> : null}
        {blocked ? <Txt size={13} sub style={{ marginHorizontal: 16, marginBottom: 8 }}>{blocked}</Txt> : null}
        <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ flex: 1 }}><Field value={text} onChangeText={setText} placeholder="Ask a question" multiline editable={!blocked} style={{ borderRadius: 22, paddingHorizontal: 16, maxHeight: 140 }} /></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Send" accessibilityState={{ disabled: !canSend, busy }} disabled={!canSend} onPress={() => void send(text, 'short')}
              style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, marginBottom: 12, backgroundColor: c.accent, opacity: !canSend ? 0.35 : pressed ? 0.8 : 1, alignItems: 'center', justifyContent: 'center' })}>
              {busy ? <ActivityIndicator size="small" color={c.onAccent} /> : <Ionicons name="arrow-up" size={22} color={c.onAccent} />}
            </Pressable>
          </View>
          <Txt size={11} sub>Kept on this iPad for you only, newest {HISTORY_CAP} messages. Conversations are also logged for the manager. Emails, phone numbers, card numbers and keys are hidden before anything is sent.</Txt>
        </View>
      </View>
    </Page>
  );
}

