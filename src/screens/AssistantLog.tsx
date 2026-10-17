// Location: src/screens/AssistantLog.tsx
// Settings ▸ AI assistant ▸ View conversation log (patch 0153, built as 0156): the manager-only viewer for the audit log.
// Shows every exchange with the model, filterable by staff member, date, errors, practice mode and remote endpoint.
// Each request can be opened to show exactly what the model received. Export log saves a file through the iPad's Files.
// Clear log asks for a typed CLEAR confirmation. The cap setting lives on this page too.
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FS from 'expo-file-system/legacy';
import { Btn, Field, IconBtn, Page, Row, Section, Segmented, Txt, alertMsg, confirm } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { isTraining } from '../lib/trainingGuard';
import { assistantLog } from '../lib/assistantLogIO';
import type { LogEvent } from '../lib/assistantLog';
import { DEFAULT_LOG_CAP_MB } from '../lib/assistantConfig';
import { useCanEditAssistant } from './AssistantSettings';

type Filter = 'all' | 'errors' | 'practice' | 'remote';
const FILTERS: { v: Filter; label: string }[] = [
  { v: 'all', label: 'All' },
  { v: 'errors', label: 'Errors' },
  { v: 'practice', label: 'Practice' },
  { v: 'remote', label: 'Remote' },
];

const fmtTime = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const fmtBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export function AssistantLogViewer() {
  const { c } = useTheme();
  const nav = useNav();
  const allowed = useCanEditAssistant();
  const patch = useApp(s => s.patchSettings);
  const saved = useApp(s => s.settings.assistant);
  const [capMB, setCapMB] = useState(String(saved.logCapMB || DEFAULT_LOG_CAP_MB));
  const [filter, setFilter] = useState<Filter>('all');
  const [staffFilter, setStaffFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [bad, setBad] = useState(0);
  const [status, setStatus] = useState<{ bytes: number; capBytes: number; percent: number; warn: boolean; purgedThrough?: string; purgedEvents: number } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const range = dateFrom || dateTo ? { from: dateFrom || undefined, to: dateTo || undefined } : undefined;
    const r = await assistantLog.events(range);
    let list = r.events;
    if (filter === 'errors') list = list.filter(e => e.kind === 'error');
    else if (filter === 'practice') list = list.filter(e => e.practice);
    else if (filter === 'remote') list = list.filter(e => e.endpoint?.scope === 'remote');
    if (staffFilter.trim()) {
      const q = staffFilter.trim().toLowerCase();
      list = list.filter(e => e.staff.name.toLowerCase().includes(q) || e.staff.id.toLowerCase().includes(q));
    }
    setEvents(list);
    setBad(r.bad);
    setStatus(await assistantLog.status());
  }, [dateFrom, dateTo, filter, staffFilter]);

  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  const exportLog = async () => {
    if (isTraining()) { alertMsg('Practice mode', 'Cannot export in practice mode.'); return; }
    setBusy(true); setNote('');
    try {
      const r = await assistantLog.exportAll();
      const path = `${FS.documentDirectory}${r.name}`;
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: r.name });
      setNote(`Exported ${r.name} (${fmtBytes(r.bytes)}).`);
    } catch (e: any) { alertMsg('Export failed', e.message); } finally { setBusy(false); }
  };

  const clearLog = async () => {
    if (isTraining()) { alertMsg('Practice mode', 'Cannot clear in practice mode.'); return; }
    setBusy(true); setNote('');
    try {
      const ok = await confirm('Clear the conversation log?', 'This deletes every conversation record from this iPad. It cannot be undone. Type CLEAR to confirm.', 'Clear', true);
      if (!ok) { setBusy(false); return; }
      await assistantLog.clear();
      setNote('Log cleared.');
      await load();
    } catch (e: any) { alertMsg('Clear failed', e.message); } finally { setBusy(false); }
  };

  const saveCap = async () => {
    if (isTraining()) { alertMsg('Practice mode', 'Settings cannot be changed in practice mode.'); return; }
    const n = parseInt(capMB, 10);
    if (!Number.isFinite(n) || n < 1 || n > 10000) { alertMsg('Check the cap', 'Enter a number between 1 and 10000.'); return; }
    patch({ assistant: { ...saved, logCapMB: n } });
    setNote(`Cap set to ${n} MB.`);
  };

  if (!allowed) return null;

  const staffIds = [...new Set(events.map(e => `${e.staff.id}|${e.staff.name}`))].map(s => { const [id, name] = s.split('|'); return { id, name }; });

  return (
    <Page title="Conversation log" onBack={nav.pop} helpId="settings/assistant"
      right={<IconBtn icon="refresh-outline" label="Refresh" onPress={() => void load()} />} scroll={false}>
      <View style={{ flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {status ? (
            <Section title="Storage" footer={status.warn ? 'The log is filling up. The oldest entries will be removed when it passes the cap.' : 'How much space the log is using on this iPad.'}>
              <View style={{ padding: 12, gap: 4 }}>
                <Txt weight="600">{fmtBytes(status.bytes)} of {fmtBytes(status.capBytes)} ({status.percent}%)</Txt>
                {status.purgedThrough ? <Txt size={12} sub>Entries before {status.purgedThrough} were purged to make room.</Txt> : null}
              </View>
            </Section>
          ) : null}

          <Section title="Filters" footer="Narrow down what the log shows.">
            <View style={{ padding: 12, gap: 10 }}>
              <Segmented value={filter} onChange={v => setFilter(v)} options={FILTERS} />
              <Field kind="search" label="Staff member" placeholder="Name or ID" value={staffFilter} onChangeText={setStaffFilter} />
              <Field kind="text" label="From date (YYYY-MM-DD)" placeholder="2026-01-01" value={dateFrom} onChangeText={setDateFrom} />
              <Field kind="text" label="To date (YYYY-MM-DD)" placeholder="2026-12-31" value={dateTo} onChangeText={setDateTo} />
              <Btn small kind="secondary" title="Apply filters" onPress={() => void load()} />
            </View>
          </Section>

          <Section title={`Conversations (${events.length})`} footer="Tap a conversation to see what was sent to the model.">
            {events.length === 0 ? (
              <View style={{ padding: 12 }}><Txt size={13} sub>No conversations found.</Txt></View>
            ) : (
              <View>
                {events.map(e => {
                  const open = openId === e.id;
                  return (
                    <View key={e.id}>
                      <Row
                        title={`${e.staff.name} · ${fmtTime(e.at)}`}
                        sub={e.kind === 'error' ? `Error: ${e.error?.kind ?? 'unknown'}` : e.user?.text?.slice(0, 80) ?? ''}
                        onPress={() => setOpenId(open ? null : e.id)}
                        icon={e.kind === 'error' ? 'alert-circle-outline' : e.practice ? 'school-outline' : 'chatbubble-outline'}
                        danger={e.kind === 'error'}
                      />
                      {open ? (
                        <View style={{ padding: 12, gap: 6, backgroundColor: c.fill }}>
                          {e.endpoint ? <Txt size={12} sub>{e.endpoint.host} · {e.endpoint.model} · {e.endpoint.scope}</Txt> : null}
                          {e.user ? <View><Txt weight="600" size={13}>Question</Txt><Txt size={13}>{e.user.text}</Txt></View> : null}
                          {e.reply ? <View><Txt weight="600" size={13}>Reply</Txt><Txt size={13}>{e.reply.text}</Txt></View> : null}
                          {e.sent ? <View><Txt weight="600" size={13}>Sent to model</Txt><Txt size={12} sub>{e.sent.parts.length} messages · hash {e.sent.hash}</Txt></View> : null}
                          {e.masked && Object.keys(e.masked).length ? <Txt size={12} sub>Masked: {Object.entries(e.masked).map(([k, v]) => `${v} ${k}`).join(', ')}</Txt> : null}
                          {e.error ? <View><Txt weight="600" size={13} color={c.bad}>Error</Txt><Txt size={13} color={c.bad}>{e.error.message}</Txt></View> : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </Section>

          <Section title="Actions" footer="Export the log to a file, or clear it completely.">
            <View style={{ padding: 12, gap: 10 }}>
              <Btn kind="secondary" icon="share-outline" title="Export log" busy={busy} onPress={() => void exportLog()} />
              <Btn kind="danger" icon="trash-outline" title="Clear log" busy={busy} onPress={() => void clearLog()} />
              {note ? <Txt size={13} sub>{note}</Txt> : null}
            </View>
          </Section>

          <Section title="Log cap" footer="When the log passes this size, the oldest entries are removed.">
            <View style={{ padding: 12, gap: 10 }}>
              <Field kind="integer" label="Cap in MB (1 to 10000)" value={capMB} onChangeText={setCapMB} />
              <Btn small kind="secondary" title="Save cap" onPress={() => void saveCap()} />
            </View>
          </Section>
        </ScrollView>
      </View>
    </Page>
  );
}
