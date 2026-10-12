// Location: src/ui/CountSquares.tsx
// Notes and coins shown as squares with a count badge (x3), the same look everywhere money is listed: change to give, cash to collect or
// return, banking, float. Replaces the old "2 × $20, 1 × $5" text lines (0087). `label` is an optional small heading above the squares.
import React from 'react';
import { View } from 'react-native';
import { Txt } from './kit';
import { useTheme } from './theme';
import { DENOMS, denomLabel, totalOf, type Counts } from '../lib/cashLedger';
import { fmt } from '../lib/money';

export function CountSquares({ counts, label, total = false, tone, align = 'center' }: { counts: Counts; label?: string; total?: boolean; tone?: string; align?: 'center' | 'start' }) {
  const { c } = useTheme();
  const present = DENOMS.filter(d => (counts[String(d.cents)] ?? 0) > 0);
  return (
    <View style={{ gap: 4, alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      {label ? <Txt size={13} sub weight="600">{label}{total ? ` · ${fmt(totalOf(counts))}` : ''}</Txt> : null}
      {present.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: align === 'center' ? 'center' : 'flex-start', gap: 10, paddingVertical: 4 }}>
          {present.map(d => {
            const count = counts[String(d.cents)];
            return (
              <View key={d.cents} accessibilityLabel={`${denomLabel(d.cents)}, ${count}`} style={{ width: 70, height: 66, borderRadius: 14, backgroundColor: c.fill, borderWidth: tone ? 1.5 : 1, borderColor: tone ?? c.line, alignItems: 'center', justifyContent: 'center' }}>
                <Txt size={22} weight="700">{denomLabel(d.cents)}</Txt>
                <View style={{ position: 'absolute', right: -5, bottom: -5, minWidth: 30, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt size={12} weight="700" color={c.onAccent}>x{count}</Txt>
                </View>
              </View>
            );
          })}
        </View>
      ) : <Txt size={13} sub>Nothing</Txt>}
    </View>
  );
}
