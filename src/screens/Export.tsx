// Location: src/screens/Export.tsx
// Report export, asked as a short tree of questions: what to export, how much detail, and how to save it. The tables
// themselves are built in src/lib/exportSheets.ts; this screen only asks and then writes the file to share.
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { Btn, Chip, Page, Row, Section, Segmented, Txt, alertMsg } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import { EXPORT_GROUPS, EXPORT_TOPICS, buildSheets, topicById, type ExportSelection, type ExportTopicId } from '../lib/exportSheets';
import { collectExportInput, writeExport, type ExportFormat } from '../lib/exportCollect';

type Step = 'what' | 'topics' | 'depth' | 'format' | 'review';
type DepthChoice = 'summary' | 'full' | 'both';

/** "Both" becomes two entries, so a topic can appear as a summary sheet and a full sheet at once. */
function expand(all: boolean, picked: ExportTopicId[], depths: Record<string, DepthChoice>): ExportSelection {
  const ids = all ? EXPORT_TOPICS.map(t => t.id) : picked;
  const out: ExportSelection = [];
  for (const id of ids) {
    const topic = topicById(id);
    const choice: DepthChoice = all ? 'both' : (depths[id] ?? 'summary');
    for (const depth of topic.depths) if (choice === 'both' || choice === depth) out.push({ topic: id, depth });
  }
  return out;
}

export default function Export() {
  const nav = useNav();
  const { c } = useTheme();
  const [step, setStep] = useState<Step>('what');
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState<ExportTopicId[]>([]);
  const [depths, setDepths] = useState<Record<string, DepthChoice>>({});
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const selection = useMemo(() => expand(all, picked, depths), [all, picked, depths]);

  const back = () => {
    if (step === 'what') nav.pop();
    else if (step === 'topics') setStep('what');
    else if (step === 'depth') setStep('topics');
    else if (step === 'format') setStep(all ? 'what' : 'depth');
    else setStep('format');
  };
  const toggle = (id: ExportTopicId) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  const run = async () => {
    setBusy(true); setResult(null);
    try {
      const input = await collectExportInput();
      const sheets = buildSheets(input, selection);
      if (!sheets.length) throw new Error('Nothing to export for that choice.');
      const file = await writeExport(sheets, format, { when: new Date().toLocaleString(), shop: input.shopName || 'This shop', register: input.registerName });
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(file.path, { mimeType: file.mime, dialogTitle: file.name, UTI: file.uti });
      setResult(`Exported ${sheets.length} ${sheets.length === 1 ? 'table' : 'tables'} as ${file.name}.`);
    } catch (e: any) { alertMsg('Export failed', e?.message ?? String(e), 'orders/export'); }
    setBusy(false);
  };

  return (
    <Page title="Export" onBack={back} helpId="orders/export">
      <View style={{ padding: 16, gap: 4 }}>
        <Txt sub size={13}>{step === 'review' ? 'Last look before the file is made.' : 'A few questions, then the file.'}</Txt>
      </View>
      {step === 'what' ? (
        <Section title="What would you like to export?">
          <Row title="Everything" sub="Every topic below, at summary and full detail, in one go." icon="albums-outline" onPress={() => { setAll(true); setStep('format'); }} />
          <Row title="Choose the topics" sub="Pick exactly what goes in, group by group." icon="checkmark-done-outline" onPress={() => { setAll(false); setStep('topics'); }} />
        </Section>
      ) : null}

      {step === 'topics' ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 }}>
            <Chip label="Select all" onPress={() => setPicked(EXPORT_TOPICS.map(t => t.id))} />
            <Chip label="Clear" onPress={() => setPicked([])} />
          </View>
          {EXPORT_GROUPS.map(g => (
            <Section key={g.id} title={g.label}>
              {EXPORT_TOPICS.filter(t => t.group === g.id).map(t => (
                <Row key={t.id} title={t.label} sub={t.blurb} onPress={() => toggle(t.id)}
                  right={<Ionicons name={picked.includes(t.id) ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={picked.includes(t.id) ? c.accent : c.sub} />} />
              ))}
            </Section>
          ))}
          <View style={{ padding: 16 }}>
            <Btn title={picked.length ? `Continue with ${picked.length}` : 'Pick at least one'} disabled={!picked.length} onPress={() => setStep('depth')} />
          </View>
        </>
      ) : null}

      {step === 'depth' ? (
        <>
          <Section title="How much detail?" footer="Full detail adds one row per line or movement. Summary is the totals view.">
            {picked.map(id => {
              const t = topicById(id);
              return (
                <View key={id} style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line }}>
                  <Txt weight="600">{t.label}</Txt>
                  {t.depths.length > 1
                    ? <View style={{ marginTop: 8 }}><Segmented value={depths[id] ?? 'summary'} onChange={v => setDepths(d => ({ ...d, [id]: v }))}
                        options={[{ v: 'summary', label: 'Summary' }, { v: 'full', label: 'Full detail' }, { v: 'both', label: 'Both' }]} /></View>
                    : <Txt size={13} sub style={{ marginTop: 4 }}>Full detail only.</Txt>}
                </View>
              );
            })}
          </Section>
          <View style={{ padding: 16 }}><Btn title="Continue" onPress={() => setStep('format')} /></View>
        </>
      ) : null}

      {step === 'format' ? (
        <Section title="How should it be saved?" footer="The workbook has one page (sheet) per report, so Google Sheets keeps every topic together.">
          <Row title="CSV files" sub={selection.length === 1 ? 'One .csv file.' : `${selection.length} .csv files, zipped.`} onPress={() => setFormat('csv')}
            right={<Ionicons name={format === 'csv' ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={format === 'csv' ? c.accent : c.sub} />} />
          <Row title="Google Sheets workbook" sub="One .xlsx file with a page per report. Opens in Google Sheets or Excel." onPress={() => setFormat('xlsx')}
            right={<Ionicons name={format === 'xlsx' ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={format === 'xlsx' ? c.accent : c.sub} />} />
          <View style={{ padding: 16 }}><Btn title="Continue" onPress={() => setStep('review')} /></View>
        </Section>
      ) : null}

      {step === 'review' ? (
        <>
          <Section title="Ready to export" footer={format === 'csv' ? 'Files are shared as a CSV or a zip.' : 'The workbook is shared as one .xlsx file.'}>
            {selection.map(s => (
              <Row key={`${s.topic}:${s.depth}`} title={topicById(s.topic).label} sub={s.depth === 'summary' ? 'Summary' : 'Full detail'} />
            ))}
          </Section>
          {result ? <View style={{ paddingHorizontal: 20, paddingTop: 6 }}><Txt color={c.accent} weight="600">{result}</Txt></View> : null}
          <View style={{ padding: 16, gap: 8 }}>
            <Btn title={busy ? 'Building…' : 'Export'} busy={busy} onPress={() => void run()} />
            <Btn title="Change detail" kind="ghost" onPress={() => setStep(all ? 'what' : 'depth')} />
          </View>
        </>
      ) : null}
    </Page>
  );
}
