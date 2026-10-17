// Location: src/screens/Help.tsx
// More ▸ Help (B7b). Reads the built-in copy of the help pages (help/help.json), so it works offline.
// A page shows at the depth you chose (Basic, Deep or Advanced), which is remembered. `id` opens a page directly (used by the "?" buttons later).
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Chip, Empty, Field, IconBtn, Page, Row, Section, Segmented, Txt } from '../ui/kit';
import Markdown from '../ui/Markdown';
import ScannerCodes from './ScannerCodes';
import { HelpMenu } from '../ui/HelpMenu';
import { useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { SPOT } from '../lib/trainingSpots';
import { isLockScreen } from '../lib/posLock';
import { assistantEntryVisible } from '../lib/assistantChat';
import { useCanEditAssistant } from './AssistantSettings';
import { builtinHelp } from '../lib/helpBuiltin';
import { DEPTHS, DEPTH_BLURB, DEPTH_LABEL, ROOT_ID, depthsPresent, resolveLinks, searchPages, selectDepth, trail, type Depth } from '../lib/helpDocs';
import { parseBlocks } from '../lib/mdBlocks';
import { fetchRemoteHelp } from '../lib/helpRemote';

/** Pages that get a shortcut to the scanner setup barcodes. `big` is the large button at the very top (Checkout help). */
const SCANNER_PAGE = 'settings/scanner-codes';
const SCANNER_SHORTCUT: Record<string, { big: boolean }> = { sales: { big: true }, 'sales/scanners': { big: false }, 'settings/hardware': { big: false } };

const asDepth = (v: unknown): Depth => ((DEPTHS as readonly string[]).includes(v as string) ? (v as Depth) : 'basic');

export default function Help({ id }: { id?: string }) {
  const { c } = useTheme(); const nav = useNav();
  const builtIn = useMemo(builtinHelp, []);
  const [helpSet, setHelpSet] = useState(builtIn);
  const [remoteUnavailable, setRemoteUnavailable] = useState(false);
  const docsUrl = process.env.EXPO_PUBLIC_DOCS_URL?.trim() ?? '';
  useEffect(() => {
    if (!docsUrl) return;
    let current = true;
    void fetchRemoteHelp(docsUrl, builtIn.version).then(remote => {
      if (current && remote) setHelpSet(remote);
    }).catch(() => {
      if (current) setRemoteUnavailable(true);
    });
    return () => { current = false; };
  }, [docsUrl, builtIn.version]);
  const { index, pages } = helpSet;
  const depth = asDepth(useApp(s => s.settings.helpDepth)); const patch = useApp(s => s.patchSettings);
  const [hist, setHist] = useState<string[]>([id && index.byId[id] ? id : ROOT_ID]);
  const [q, setQ] = useState(''); const [menu, setMenu] = useState(false);
  const locked = useApp(s => isLockScreen({ staffCount: s.settings.staff.length, unlocked: s.unlocked })); const canEditAssistant = useCanEditAssistant();
  const showAssistant = assistantEntryVisible({ locked, canEdit: canEditAssistant });
  const cur = hist[hist.length - 1]; const page = index.byId[cur] ?? index.byId[ROOT_ID];
  const go = (to: string) => { if (!index.byId[to]) return; setQ(''); setHist(h => (h[h.length - 1] === to ? h : [...h, to])); };
  const back = () => (q ? setQ('') : hist.length > 1 ? setHist(h => h.slice(0, -1)) : nav.pop());
  const results = useMemo(() => (q.trim() ? searchPages(pages, q, depth).slice(0, 30) : []), [q, pages, depth]);
  const blocks = useMemo(() => parseBlocks(resolveLinks(selectDepth(page, depth), t => index.byId[t]?.title, t => `#/${t}`)), [page, depth, index]);
  const crumbs = trail(index, page.id).slice(0, -1);
  const kids = (index.children[page.id] ?? []).map(k => index.byId[k]);
  const related = page.related.filter(r => index.byId[r] && r !== page.id).map(r => index.byId[r]);
  const seen = new Set([...kids.map(k => k.id), ...related.map(r => r.id), page.id]);
  const linkedHere = (index.backlinks[page.id] ?? []).filter(b => !seen.has(b) && b !== page.parent).map(b => index.byId[b]);
  const present = depthsPresent(page); const missing = depth !== 'basic' && !present.includes(depth);
  const parentTitle = (p: { parent?: string }) => (p.parent && index.byId[p.parent] ? index.byId[p.parent].title : undefined);

  return (
    <Page key={page.id} title={q ? 'Search help' : page.id === ROOT_ID ? 'Help' : page.title} onBack={back} helpId={null}
      right={<View style={{ flexDirection: 'row' }}>{showAssistant ? <IconBtn icon="sparkles-outline" label="Ask the assistant" onPress={() => nav.push('assistant')} spot={SPOT.helpAssistant} /> : null}<IconBtn icon="list-outline" label="Contents" onPress={() => setMenu(true)} />{page.id !== ROOT_ID && !q ? <IconBtn icon="home-outline" label="Help home" onPress={() => { setHist([ROOT_ID]); }} /> : null}</View>}>
      <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
        {SCANNER_SHORTCUT[page.id] && !q.trim() && index.byId[SCANNER_PAGE] ? (
          <Pressable onPress={() => go(SCANNER_PAGE)} accessibilityRole="button" accessibilityLabel="Open the scanner setup barcodes"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, backgroundColor: pressed ? c.fill : c.accent, paddingVertical: SCANNER_SHORTCUT[page.id].big ? 26 : 14, paddingHorizontal: 20 })}>
            <Ionicons name="barcode-outline" size={SCANNER_SHORTCUT[page.id].big ? 44 : 28} color={c.onAccent} />
            <View style={{ flex: 1 }}>
              <Txt size={SCANNER_SHORTCUT[page.id].big ? 22 : 16} weight="700" color={c.onAccent}>Scanner setup barcodes</Txt>
              <Txt size={SCANNER_SHORTCUT[page.id].big ? 14 : 12} color={c.onAccent}>Scan one to change the scanner's sound, sleep, speed and pairing</Txt>
            </View>
            <Ionicons name="chevron-forward" size={22} color={c.onAccent} />
          </Pressable>
        ) : null}
        <Field kind="search" placeholder="Search help" value={q} onChangeText={setQ} />
        {remoteUnavailable ? <Txt size={12} sub>Showing built-in help. The newer online copy could not be reached.</Txt> : null}
        <Segmented value={depth} options={DEPTHS.map(d => ({ v: d, label: DEPTH_LABEL[d] }))} onChange={d => patch({ helpDepth: d })} />
        <Txt size={13} sub>{DEPTH_BLURB[depth]}</Txt>

        {q.trim() ? (
          results.length ? (
            <Section>{results.map((r, i) => <Row key={r.page.id} title={r.page.title} sub={[parentTitle(r.page), r.page.summary].filter(Boolean).join(' · ')} last={i === results.length - 1} onPress={() => go(r.page.id)} />)}</Section>
          ) : <Empty icon="search-outline" title="Nothing found" sub="Try fewer or different words. Every word you type has to match." />
        ) : (
          <>
            {crumbs.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{crumbs.map(p => <Chip key={p.id} label={p.id === ROOT_ID ? 'Help' : p.title} icon="chevron-back" onPress={() => go(p.id)} />)}</ScrollView> : null}
            {page.id !== ROOT_ID ? <Txt size={24} weight="700">{page.title}</Txt> : null}
            <Markdown blocks={blocks} onPage={go} />
            {page.id === SCANNER_PAGE ? <ScannerCodes /> : null}
            {missing ? <View style={{ backgroundColor: c.fill, borderRadius: 10, padding: 12 }}><Txt size={13} sub>There are no {DEPTH_LABEL[depth]} notes for this page yet, so you are seeing everything it has.</Txt></View> : null}
          </>
        )}
      </View>
      <HelpMenu visible={menu} onClose={() => setMenu(false)} index={index} current={page.id} onPick={go} />
      {q.trim() ? null : (
        <>
          {kids.length && page.id === ROOT_ID ? (
            <View style={{ marginTop: 18 }}>
              <Txt size={13} sub weight="600" style={{ marginHorizontal: 20, marginBottom: 8, textTransform: 'uppercase' }}>Browse by task</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: 16 }}>
                {kids.map(k => (
                  <Card key={k.id} style={{ width: '48%' }}>
                    <Pressable onPress={() => go(k.id)} accessibilityRole="button" accessibilityLabel={`Browse ${k.title}`}
                      style={({ pressed }) => ({ minHeight: 94, padding: 12, gap: 5, backgroundColor: pressed ? c.fill : c.card })}>
                      <Txt weight="700" numberOfLines={2}>{k.title}</Txt>
                      <Txt size={12} sub numberOfLines={2}>{k.summary}</Txt>
                    </Pressable>
                  </Card>
                ))}
              </View>
            </View>
          ) : kids.length ? <Section title="In this section">{kids.map((k, i) => <Row key={k.id} title={k.title} sub={k.summary} last={i === kids.length - 1} onPress={() => go(k.id)} />)}</Section> : null}
          {related.length ? <Section title="Related">{related.map((k, i) => <Row key={k.id} title={k.title} sub={k.summary} last={i === related.length - 1} onPress={() => go(k.id)} />)}</Section> : null}
          {linkedHere.length ? <Section title="Pages that link here">{linkedHere.map((k, i) => <Row key={k.id} title={k.title} sub={k.summary} last={i === linkedHere.length - 1} onPress={() => go(k.id)} />)}</Section> : null}
        </>
      )}
    </Page>
  );
}
