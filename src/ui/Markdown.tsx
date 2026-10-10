// Location: src/ui/Markdown.tsx
// Draws the blocks from lib/mdBlocks.ts. Text follows the display mode's text size, like the rest of the app.
import React from 'react';
import { Linking, Platform, ScrollView, Text, View } from 'react-native';
import type { Align, Block, Inline, ListItem } from '../lib/mdBlocks';
import { useTheme } from './theme';
import { useUi } from './uiProfile';
import Flowchart from './Flowchart';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
const half = (n: number) => Math.round(n * 2) / 2;

export default function Markdown({ blocks, onPage }: { blocks: Block[]; onPage: (id: string) => void }) {
  const { c, dark } = useTheme(); const k = useUi().textScale;
  const link = dark ? '#60A5FA' : '#2563EB';
  const size = half(15 * k);
  const spans = (xs: Inline[], base: { color?: string; weight?: '400' | '600' | '700'; size?: number } = {}) => xs.map((x, i) => {
    const common = { fontSize: base.size ?? size, color: base.color ?? c.text };
    switch (x.t) {
      case 'bold': return <Text key={i} style={{ ...common, fontWeight: '700' }}>{x.s}</Text>;
      case 'italic': return <Text key={i} style={{ ...common, fontStyle: 'italic' }}>{x.s}</Text>;
      case 'code': return <Text key={i} style={{ fontFamily: MONO, fontSize: half((base.size ?? size) * 0.9), color: c.text, backgroundColor: c.fill }}>{` ${x.s} `}</Text>;
      case 'page': return <Text key={i} onPress={() => onPage(x.id)} accessibilityRole="link" style={{ ...common, color: link, textDecorationLine: 'underline' }}>{x.s}</Text>;
      case 'url': return <Text key={i} onPress={() => { void Linking.openURL(x.href).catch(() => {}); }} accessibilityRole="link" style={{ ...common, color: link, textDecorationLine: 'underline' }}>{x.s}</Text>;
      default: return <Text key={i} style={{ ...common, fontWeight: base.weight }}>{x.s}</Text>;
    }
  });
  const list = (items: ListItem[], ordered: boolean, depth: number): React.ReactNode => (
    <View style={{ gap: 4 }}>
      {items.map((it, i) => (
        <View key={i}>
          <View style={{ flexDirection: 'row', gap: 8, paddingLeft: depth * 16 }}>
            <Text style={{ fontSize: size, color: c.sub, width: ordered ? 22 : 10 }}>{ordered ? `${i + 1}.` : '•'}</Text>
            <Text style={{ flex: 1, fontSize: size, lineHeight: half(size * 1.4), color: c.text }}>{spans(it.inline)}</Text>
          </View>
          {it.children.length ? <View style={{ marginTop: 4 }}>{list(it.children, false, depth + 1)}</View> : null}
        </View>
      ))}
    </View>
  );
  const alignOf = (a: Align) => (a === 'center' ? 'center' : a === 'right' ? 'right' : 'left');
  return (
    <View style={{ gap: 12 }}>
      {blocks.map((b, bi) => {
        switch (b.k) {
          case 'heading': return <Text key={bi} accessibilityRole="header" style={{ marginTop: 6, fontSize: half((b.level === 2 ? 20 : b.level === 3 ? 17 : 15) * k), fontWeight: '700', color: c.text }}>{spans(b.inline, { weight: '700', size: half((b.level === 2 ? 20 : b.level === 3 ? 17 : 15) * k) })}</Text>;
          case 'para': return <Text key={bi} style={{ fontSize: size, lineHeight: half(size * 1.45), color: c.text }}>{spans(b.inline)}</Text>;
          case 'list': return <View key={bi}>{list(b.items, b.ordered, 0)}</View>;
          case 'table': {
            const fs = half(13.5 * k);
            return (
              <View key={bi} style={{ borderWidth: 1, borderColor: c.line, borderRadius: 10, overflow: 'hidden' }}>
                {[b.head, ...b.rows].map((row, ri) => (
                  <View key={ri} style={{ flexDirection: 'row', backgroundColor: ri === 0 ? c.fill : c.card, borderTopWidth: ri === 0 ? 0 : 1, borderTopColor: c.line }}>
                    {row.map((cell, ci) => (
                      <View key={ci} style={{ flex: 1, padding: 8, borderLeftWidth: ci === 0 ? 0 : 1, borderLeftColor: c.line }}>
                        <Text style={{ fontSize: fs, lineHeight: half(fs * 1.35), color: c.text, textAlign: alignOf(b.align[ci] ?? 'left') }}>{spans(cell, { size: fs, weight: ri === 0 ? '700' : undefined })}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            );
          }
          case 'code': return <ScrollView key={bi} horizontal style={{ backgroundColor: c.fill, borderRadius: 10 }} contentContainerStyle={{ padding: 12 }}><Text selectable style={{ fontFamily: MONO, fontSize: half(12.5 * Math.min(k, 1.25)), color: c.text }}>{b.text}</Text></ScrollView>;
          case 'diagram': return <Flowchart key={bi} source={b.source} />;
        }
      })}
    </View>
  );
}
