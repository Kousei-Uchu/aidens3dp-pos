// Location: src/screens/AssistantSettings.tsx
// Settings ▸ AI assistant: where the Help chatbot's model lives (any OpenAI-compatible server, Ollama included), plus a
// Test connection button. Only a person who may change staff permissions (owner, or a manager when there is no owner)
// sees this. There is no chat screen yet: this page only sets up and tests the connection.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Btn, Field, Section, Segmented, Txt, alertMsg } from '../ui/kit';
import { useApp } from '../state/store';
import { useNav } from '../ui/nav';
import { actingRole, canEditAdjustPerms } from '../lib/adjustPerms';
import { classifyEndpoint, GATE_TOGGLE_CATEGORIES, maskKey, normaliseAssistant, parseBaseUrl, type AssistantSettings as Cfg, type EndpointMode, type GateToggle, type GateToggleCategory, type GateToggles } from '../lib/assistantConfig';
import { CATEGORY_INFO, decisionWord, FIXED_NEVER, resolvePolicy } from '../lib/assistantGate';
import { testConnection, type TestReport } from '../lib/assistantClient';
import { getAssistantKey, setAssistantKey } from '../lib/assistantKey';
import { isTraining } from '../lib/trainingGuard';
import { AssistantLogViewer } from './AssistantLog';

/** Whether this person may open the page. The Settings menu and the page itself both ask, so a role change closes it. */
export function useCanEditAssistant(): boolean {
  return useApp(s => canEditAdjustPerms(actingRole(s.settings.requirePin, s.settings.staff, s.staffId), s.settings.staff));
}

type Draft = { baseUrl: string; model: string; temperature: string; timeoutSec: string; contextSize: string; toolCallLimit: string; endpointMode: EndpointMode; logCapMB: string; gate: GateToggles };
const toDraft = (a: Cfg): Draft => ({ baseUrl: a.baseUrl, model: a.model, temperature: String(a.temperature), timeoutSec: String(a.timeoutSec), contextSize: String(a.contextSize), toolCallLimit: String(a.toolCallLimit), endpointMode: a.endpointMode, logCapMB: String(a.logCapMB), gate: { ...a.gate } });
const fromDraft = (d: Draft): Cfg => normaliseAssistant({ ...d });

export function AssistantSettings() {
  const allowed = useCanEditAssistant();
  const nav = useNav();
  const saved = useApp(s => s.settings.assistant); const patch = useApp(s => s.patchSettings);
  const [d, setD] = useState<Draft>(() => toDraft(saved));
  const [savedKey, setSavedKey] = useState(''); const [newKey, setNewKey] = useState(''); const [removeKey, setRemoveKey] = useState(false);
  const [busy, setBusy] = useState(false); const [report, setReport] = useState<TestReport | null>(null); const [note, setNote] = useState('');
  const [showLog, setShowLog] = useState(false);
  useEffect(() => { let on = true; void getAssistantKey().then(k => { if (on) setSavedKey(k); }); return () => { on = false; }; }, []);
  if (!allowed) return null;
  if (showLog) return <AssistantLogViewer />;

  const set = (p: Partial<Draft>) => { setD(x => ({ ...x, ...p })); setReport(null); setNote(''); };
  const cfg = fromDraft(d);
  const parsed = parseBaseUrl(d.baseUrl);
  const cls = classifyEndpoint(d.baseUrl, d.endpointMode);
  const policy = resolvePolicy(cls, d.gate);
  const keyShown = removeKey ? '' : newKey.trim() ? 'A new key will be saved.' : maskKey(savedKey);
  const effectiveKey = removeKey ? '' : newKey.trim() || savedKey;
  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved) || removeKey || !!newKey.trim();

  const save = async () => {
    if (isTraining()) { alertMsg('Practice mode', 'Settings cannot be changed in practice mode.'); return; }
    if (d.baseUrl.trim() && !parsed.ok) { alertMsg('Check the address', parsed.error); return; }
    const next = { ...cfg, baseUrl: parsed.ok ? parsed.base : '' };
    patch({ assistant: next }); setD(toDraft(next));
    if (removeKey || newKey.trim()) { await setAssistantKey(removeKey ? '' : newKey); setSavedKey(removeKey ? '' : newKey.trim()); setNewKey(''); setRemoveKey(false); }
    setNote('Saved on this iPad.');
  };

  const test = async () => {
    if (isTraining()) { alertMsg('Practice mode', 'Test connection is switched off in practice mode.'); return; }
    if (!parsed.ok) { alertMsg('Check the address', parsed.error); return; }
    setBusy(true); setReport(null); setNote('');
    try {
      const r = await testConnection(fetch as any, { baseUrl: parsed.base, apiKey: effectiveKey, model: cfg.model, timeoutSec: cfg.timeoutSec });
      setReport(r);
      if (r.ok && r.contextSize && r.contextSize !== cfg.contextSize) { setD(x => ({ ...x, contextSize: String(r.contextSize) })); setNote(`The provider reports a context size of ${r.contextSize}, so that is filled in below. Save to keep it.`); }
    } finally { setBusy(false); }
  };

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Txt size={13} sub>Choose the server the Help assistant will use. Any server that speaks the OpenAI-compatible API works, including Ollama on the shop PC. Test connection sends a fixed test message and nothing from the shop. To chat, open Help and tap the sparkles button.</Txt>
      <Section title="Connection" footer="Per iPad, so it is not shared with other registers. It is included in Backup & transfer, and the key is stored in the iPad's Keychain.">
        <View style={{ padding: 12, gap: 10 }}>
          <Field kind="url" label="Address (usually ends in /v1)" placeholder="http://192.168.1.20:11434/v1" value={d.baseUrl} onChangeText={t => set({ baseUrl: t })} />
          <Field kind="code" label="Model name" placeholder="for example llama3.1:8b" value={d.model} onChangeText={t => set({ model: t })} />
          <Field kind="secret" label="API key (optional, Ollama does not need one)" placeholder={keyShown || 'Not set'} value={newKey} onChangeText={t => { setNewKey(t); setRemoveKey(false); setReport(null); }} />
          {savedKey && !removeKey ? <Btn small kind="ghost" title="Remove saved key" onPress={() => { setRemoveKey(true); setNewKey(''); setReport(null); }} /> : null}
          {removeKey ? <Txt size={12} sub>The key will be removed when you save.</Txt> : null}
        </View>
      </Section>
      <Section footer={cls === 'local' ? 'Local: stays on this iPad or your own network, so customer details may be sent. See What the assistant may see, below.' : 'Remote: customer details, emails and gift card details are kept off this server unless you allow them below.'}>
        <View style={{ padding: 12 }}><Txt weight="600">This address counts as: {cls === 'local' ? 'Local' : 'Remote'}{!d.baseUrl.trim() ? ' (no address yet)' : d.endpointMode !== 'auto' ? ' (set by you)' : ''}</Txt></View>
        <View style={{ padding: 12, paddingTop: 0, gap: 6 }}>
          <Segmented value={d.endpointMode} onChange={v => set({ endpointMode: v })} options={[{ v: 'auto', label: 'Auto' }, { v: 'local', label: 'Local' }, { v: 'remote', label: 'Remote' }]} />
          <Txt size={12} sub>Auto follows the address. Choose Local for a private network the app does not recognise. Choose Remote for a tunnel or proxy that forwards out of your network, even when its address looks private. Remote is always the safe choice.</Txt>
        </View>
      </Section>
      <Section title="What the assistant may see" footer="The data rules are enforced in the app, not by asking the model. Auto follows the rules for this address. Always allow sends a category even where Auto would not. Never allow keeps it out even where Auto would send it. Payment details and keys are never sent, whatever you choose. These settings apply to shop data once the assistant can look it up.">
        <View style={{ padding: 12, gap: 14 }}>
          {GATE_TOGGLE_CATEGORIES.map((c: GateToggleCategory) => (
            <View key={c} style={{ gap: 6 }}>
              <Txt weight="600">{CATEGORY_INFO[c].label}</Txt>
              <Txt size={12} sub>{CATEGORY_INFO[c].help}</Txt>
              <Segmented value={d.gate[c]} onChange={(v: GateToggle) => set({ gate: { ...d.gate, [c]: v } })} options={[{ v: 'auto', label: 'Auto' }, { v: 'allow', label: 'Always allow' }, { v: 'never', label: 'Never allow' }]} />
              <Txt size={12} sub>Right now: {decisionWord(policy[c])}</Txt>
              {d.gate[c] === 'allow' && cls === 'remote' && (c === 'personal' || c === 'email' || c === 'gift_balance' || c === 'gift_code') ? <Txt size={12} weight="600">This sends the details to a server outside your own network.</Txt> : null}
            </View>
          ))}
          {FIXED_NEVER.map(c => (
            <View key={c} style={{ gap: 2 }}>
              <Txt weight="600">{CATEGORY_INFO[c].label}</Txt>
              <Txt size={12} sub>{CATEGORY_INFO[c].help}</Txt>
              <Txt size={12} sub>Never sent. This cannot be changed.</Txt>
            </View>
          ))}
        </View>
      </Section>
      <Section title="Options" footer="Context size is how much text the model can read at once. Setting it to the model's maximum lets it use the most history, but local models get slower. With Ollama, the context size must also be set on the Ollama side, because this connection cannot set it.">
        <View style={{ padding: 12, gap: 10 }}>
          <Field kind="decimal" label="Temperature (0 to 2)" value={d.temperature} onChangeText={t => set({ temperature: t })} />
          <Field kind="integer" label="Timeout in seconds (5 to 600)" value={d.timeoutSec} onChangeText={t => set({ timeoutSec: t })} />
          <Field kind="integer" label="Context size in tokens" value={d.contextSize} onChangeText={t => set({ contextSize: t })} />
          <Field kind="integer" label="Tool call limit per question (1 to 100)" value={d.toolCallLimit} onChangeText={t => set({ toolCallLimit: t })} />
          <Field kind="integer" label="Conversation log cap in MB (1 to 10000)" value={d.logCapMB} onChangeText={t => set({ logCapMB: t })} />
        </View>
      </Section>
      <Section title="Conversation log" footer="Every conversation with the model is logged on this iPad. Export it to a file, or clear it.">
        <View style={{ padding: 12 }}>
          <Btn kind="secondary" icon="document-text-outline" title="View conversation log" onPress={() => setShowLog(true)} />
        </View>
      </Section>
      <View style={{ gap: 8 }}>
        <Btn title="Test connection" kind="secondary" icon="pulse-outline" busy={busy} disabled={!d.baseUrl.trim() || !d.model.trim()} onPress={() => void test()} />
        <Btn title="Save" disabled={!dirty} onPress={() => void save()} />
        {note ? <Txt size={13} sub>{note}</Txt> : null}
      </View>
      {report ? <Section title={report.ok ? 'All checks passed' : 'Something needs fixing'}>
        {report.steps.map(s => (
          <View key={s.id} style={{ padding: 12, gap: 2 }}>
            <Txt weight="600">{s.status === 'ok' ? 'Passed' : s.status === 'failed' ? 'Failed' : 'Not checked'}: {s.label}</Txt>
            <Txt size={13} sub>{s.detail}</Txt>
          </View>
        ))}
      </Section> : null}
    </View>
  );
}
