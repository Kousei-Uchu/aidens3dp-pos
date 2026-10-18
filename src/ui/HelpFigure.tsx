// Location: src/ui/HelpFigure.tsx
// A help page's ```screen block, drawn as a small picture of the screen it is talking about (B7e). It is a picture,
// not a control: nothing in it can be tapped, and its words are written by hand in the help page, so it can never
// drift out of date with the app by itself — when a screen changes, the page's picture is edited with the words.
// The same block is pre-drawn as HTML in help.json for the Docs site (figureToHTML in src/lib/helpFigures.ts).
import React from 'react';
import { View } from 'react-native';
import type { Figure, FigEl } from '../lib/helpFigures';
import { useTheme } from './theme';
import { useUi } from './uiProfile';
import { Txt } from './kit';

const Badge = ({ n, bg, fg }: { n: number; bg: string; fg: string }) => (
  <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
    <Txt size={12} weight="700" color={fg}>{String(n)}</Txt>
  </View>
);

/** Three of these to a row, whichever kind they are, the way a group of like things should look. */
const THREE = { flexGrow: 0, flexShrink: 1, flexBasis: '31%' } as const;

export default function HelpFigure({ fig }: { fig: Figure }) {
  const { c } = useTheme(); const k = useUi().textScale;
  const s = (n: number) => Math.round(n * Math.min(k, 1.3) * 2) / 2;
  const flags = (e: { badge?: number; hi?: boolean }) => ({
    ...(e.hi ? { borderWidth: 1.5, borderColor: c.accent, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 3 } : {}),
  });
  const badge = (e: { badge?: number }) => (e.badge ? <Badge n={e.badge} bg={c.accent} fg={c.onAccent} /> : null);
  const pair = (e: { label: string; value?: string; badge?: number }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
      {badge(e)}
      <Txt size={s(13.5)} style={{ flex: 1 }} numberOfLines={2}>{e.label}</Txt>
      {e.value ? <Txt size={s(13.5)} weight="600" numberOfLines={1}>{e.value}</Txt> : null}
    </View>
  );
  const draw = (e: FigEl, i: number): React.ReactNode => {
    switch (e.k) {
      case 'label': return <Txt key={i} size={s(11)} weight="700" color={c.sub} style={{ textTransform: 'uppercase', marginTop: 4 }}>{e.text}</Txt>;
      case 'text': return <Txt key={i} size={s(13)} color={c.sub}>{e.text}</Txt>;
      case 'row': return <View key={i} style={{ paddingVertical: 6, ...flags(e) }}>{pair(e)}</View>;
      case 'input': return (
        <View key={i} style={{ backgroundColor: c.fill, borderColor: c.line, borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, ...flags(e) }}>
          {pair(e)}
        </View>
      );
      case 'tile': return (
        <View key={i} style={{ ...THREE, backgroundColor: c.tile, borderRadius: 12, padding: 8, minHeight: 62, justifyContent: 'space-between', ...flags(e) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>{badge(e)}<Txt size={s(12.5)} weight="700" numberOfLines={3} style={{ flex: 1 }}>{e.label}</Txt></View>
          {e.value ? <Txt size={s(11.5)} color={c.sub} numberOfLines={1}>{e.value}</Txt> : null}
        </View>
      );
      case 'key': return (
        <View key={i} style={{ ...THREE, backgroundColor: c.fill, borderRadius: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, ...flags(e) }}>
          {badge(e)}<Txt size={s(16)} weight="600">{e.label}</Txt>
        </View>
      );
      case 'button': return (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 100, paddingVertical: 10, backgroundColor: e.primary ? c.accent : c.fill, ...flags(e) }}>
          {badge(e)}<Txt size={s(14.5)} weight="600" color={e.primary ? c.onAccent : c.text}>{e.text}</Txt>
        </View>
      );
      default: return null;
    }
  };
  // tiles and keys flow three to a row; everything else takes the whole width
  const body: React.ReactNode[] = []; let i = 0;
  while (i < fig.els.length) {
    const kind = fig.els[i].k;
    if (kind !== 'tile' && kind !== 'key') { body.push(draw(fig.els[i], i)); i++; continue; }
    const run: FigEl[] = []; while (i < fig.els.length && fig.els[i].k === kind) { run.push(fig.els[i]); i++; }
    body.push(<View key={`g${i}`} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{run.map((e, j) => draw(e, j))}</View>);
  }
  return (
    <View pointerEvents="none" accessible accessibilityLabel={`Picture of ${fig.title ?? 'a screen'}${fig.note ? `. ${fig.note}` : ''}`}
      style={{ borderWidth: 1, borderColor: c.line, borderRadius: 16, backgroundColor: c.bg, overflow: 'hidden', marginVertical: 2 }}>
      {fig.title || fig.sub ? (
        <View style={{ backgroundColor: c.fill, borderBottomWidth: 1, borderBottomColor: c.line, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {fig.title ? <Txt size={s(14.5)} weight="700" style={{ flex: 1 }} numberOfLines={1}>{fig.title}</Txt> : null}
          {fig.sub ? <Txt size={s(12)} color={c.sub} numberOfLines={1}>{fig.sub}</Txt> : null}
        </View>
      ) : null}
      <View style={{ padding: 12, gap: 7 }}>{body}</View>
      {fig.note ? <Txt size={s(12)} color={c.sub} style={{ borderTopWidth: 1, borderTopColor: c.line, paddingHorizontal: 12, paddingVertical: 8 }}>{fig.note}</Txt> : null}
    </View>
  );
}
