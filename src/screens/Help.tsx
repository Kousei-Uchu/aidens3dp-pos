// Location: src/screens/Help.tsx
// More ▸ Help (B7b). Reads the built-in copy of the help pages (help/help.json), so it works offline.
// A page shows at the depth you chose (Basic, Deep or Advanced), which is remembered. `id` opens a page directly (used by the "?" buttons later).
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Chip, Empty, Field, IconBtn, Page, Row, Section, Segmented, Txt } from '../ui/kit';
import Markdown from '../ui/Markdown';
import { useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { builtinHelp } from '../lib/helpBuiltin';
import { DEPTHS, DEPTH_BLURB, DEPTH_LABEL, ROOT_ID, depthsPresent, resolveLinks, searchPages, selectDepth, trail, type Depth } from '../lib/helpDocs';
import { parseBlocks } from '../lib/mdBlocks';

const asDepth = (v: unknown): Depth => ((DEPTHS as readonly string[]).includes(v as string) ? (v as Depth) : 'basic');

export default function Help({ id }: { id?: string }) {
  const { c } = useTheme(); const nav = useNav();
  const set = useMemo(builtinHelp, []); const { index, pages } = set;
  const depth = asDepth(useApp(s => s.settings.helpDepth)); const patch = useApp(s => s.patchSettings);
  const [hist, setHist] = useState<string[]>([id && index.byId[id] ? id : ROOT_ID]);
  const [q, setQ] = useState('');
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
    <Page key={page.id} title={q ? 'Search help' : page.id === ROOT_ID ? 'Help' : page.title} onBack={back}
      right={page.id !== ROOT_ID && !q ? <IconBtn icon="home-outline" label="Help home" onPress={() => { setHist([ROOT_ID]); }} /> : undefined}>
      <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
        <Field kind="search" placeholder="Search help" value={q} onChangeText={setQ} />
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
            {missing ? <View style={{ backgroundColor: c.fill, borderRadius: 10, padding: 12 }}><Txt size={13} sub>There are no {DEPTH_LABEL[depth]} notes for this page yet, so you are seeing everything it has.</Txt></View> : null}
          </>
        )}
      </View>
      {q.trim() ? null : (
        <>
          {kids.length ? <Section title={page.id === ROOT_ID ? 'Topics' : 'In this section'}>{kids.map((k, i) => <Row key={k.id} title={k.title} sub={k.summary} last={i === kids.length - 1} onPress={() => go(k.id)} />)}</Section> : null}
          {related.length ? <Section title="Related">{related.map((k, i) => <Row key={k.id} title={k.title} sub={k.summary} last={i === related.length - 1} onPress={() => go(k.id)} />)}</Section> : null}
          {linkedHere.length ? <Section title="Pages that link here">{linkedHere.map((k, i) => <Row key={k.id} title={k.title} sub={k.summary} last={i === linkedHere.length - 1} onPress={() => go(k.id)} />)}</Section> : null}
        </>
      )}
    </Page>
  );
}
