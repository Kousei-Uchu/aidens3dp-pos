// Location: src/ui/ChatMarkdown.tsx
// Draws an assistant reply (patch 0165): the same blocks as the Help screen, but smaller and tighter to sit in a chat bubble.
// Text can be selected and copied. Links are never tappable here (see lib/chatMarkdown.ts). Text follows the display mode's size.
import React from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import type { Align, Block, Inline, ListItem } from '../lib/mdBlocks';
import { chatBlocks } from '../lib/chatMarkdown';
import { useTheme } from './theme';
import { useUi } from './uiProfile';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
const half = (n: number) => Math.round(n * 2) / 2;
const alignOf = (a: Align) => (a === 'center' ? 'center' : a === 'right' ? 'right' : 'left');

export default function ChatMarkdown({ text, color }: { text: string; color?: string }) {
  const { c } = useTheme(); const k = useUi().textScale;
  const blocks = React.useMemo<Block[]>(() => chatBlocks(text), [text]);
  const ink = color ?? c.text; const size = half(15 * k); const line = half(size * 1.42);
  const spans = (xs: Inline[], base: { size?: number; weight?: '400' | '700' } = {}) => xs.map((x, i) => {
    const fs = base.size ?? size;
    switch (x.t) {
      case 'bold': return <Text key={i} style={{ fontSize: fs, fontWeight: '700', color: ink }}>{x.s}</Text>;
      case 'italic': return <Text key={i} style={{ fontSize: fs, fontStyle: 'italic', color: ink }}>{x.s}</Text>;
      case 'code': return <Text key={i} style={{ fontFamily: MONO, fontSize: half(fs * 0.9), color: ink, backgroundColor: c.fill }}>{` ${x.s} `}</Text>;
      default: return <Text key={i} style={{ fontSize: fs, color: ink, fontWeight: base.weight }}>{x.s}</Text>;
    }
  });
  const list = (items: ListItem[], ordered: boolean, depth: number): React.ReactNode => (
    <View style={{ gap: 4, paddingLeft: depth ? 14 : 0 }}>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: size, lineHeight: line, minWidth: ordered ? 20 : 10, color: ordered ? c.accent : c.sub, fontWeight: ordered ? '700' : '400' }}>{ordered ? `${i + 1}.` : depth ? '◦' : '•'}</Text>
          <View style={{ flex: 1, gap: 4 }}>
            <Text selectable style={{ fontSize: size, lineHeight: line, color: ink }}>{spans(it.inline)}</Text>
            {it.children.length ? list(it.children, false, depth + 1) : null}
          </View>
        </View>
      ))}
    </View>
  );
  return (
    <View style={{ gap: 8 }}>
      {blocks.map((b, bi) => {
        switch (b.k) {
          case 'heading': { const hs = half((b.level === 2 ? 18 : b.level === 3 ? 16.5 : 15.5) * k); return <Text key={bi} selectable accessibilityRole="header" style={{ marginTop: bi ? 4 : 0, fontSize: hs, lineHeight: half(hs * 1.3), fontWeight: '700', color: ink }}>{spans(b.inline, { size: hs, weight: '700' })}</Text>; }
          case 'para': return <Text key={bi} selectable style={{ fontSize: size, lineHeight: line, color: ink }}>{spans(b.inline)}</Text>;
          case 'list': return <View key={bi}>{list(b.items, b.ordered, 0)}</View>;
          case 'table': {
            const fs = half(13.5 * k); const cols = b.head.length;
            return (
              <ScrollView key={bi} horizontal showsHorizontalScrollIndicator={false} style={{ borderWidth: 1, borderColor: c.line, borderRadius: 10 }}>
                <View style={{ minWidth: cols * 96 }}>
                  {[b.head, ...b.rows].map((row, ri) => (
                    <View key={ri} style={{ flexDirection: 'row', backgroundColor: ri === 0 ? c.fill : 'transparent', borderTopWidth: ri === 0 ? 0 : 1, borderTopColor: c.line }}>
                      {row.map((cell, ci) => (
                        <View key={ci} style={{ flex: 1, minWidth: 96, padding: 8, borderLeftWidth: ci === 0 ? 0 : 1, borderLeftColor: c.line }}>
                          <Text selectable style={{ fontSize: fs, lineHeight: half(fs * 1.35), color: ink, textAlign: alignOf(b.align[ci] ?? 'left') }}>{spans(cell, { size: fs, weight: ri === 0 ? '700' : undefined })}</Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            );
          }
          case 'code': return <ScrollView key={bi} horizontal style={{ backgroundColor: c.fill, borderRadius: 10 }} contentContainerStyle={{ padding: 10 }}><Text selectable style={{ fontFamily: MONO, fontSize: half(12.5 * Math.min(k, 1.25)), color: ink }}>{b.text}</Text></ScrollView>;
          default: return null;
        }
      })}
    </View>
  );
}
