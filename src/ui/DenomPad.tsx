// Location: src/ui/DenomPad.tsx
// Tap-to-enter notes and coins (B1a). Tap $50, $20, 50c … instead of typing amounts. Every tap can be undone, and the pad
// tells the cashier exactly what an undo took off. `base` is what was already in the drawer (open / correct contents);
// leave it empty for a blind count or for money going in or out.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Btn, Chip, Segmented, Txt, tap as haptic } from './kit';
import { useTheme } from './theme';
import { DENOMS, countOf, describeTap, draftCounts, tapDenom, totalOf, undoLast, type Counts, type Draft } from '../lib/cashLedger';
import { fmt } from '../lib/money';

const MULTS = [1, 5, 10] as const;

export function DenomPad({ draft, onChange, base = {}, totalLabel }: { draft: Draft; onChange: (d: Draft) => void; base?: Counts; totalLabel?: string }) {
  const { c } = useTheme(); const [mode, setMode] = useState<'add' | 'remove'>('add'); const [mult, setMult] = useState<number>(1); const [msg, setMsg] = useState('');
  const counts = draftCounts(draft, base); const total = totalOf(counts);
  const press = (cents: number) => {
    const next = tapDenom(draft, base, cents, mode === 'add' ? mult : -mult);
    if (next === draft) { setMsg('None of that to remove.'); return; }
    const last = next[next.length - 1]; setMsg(describeTap(last)); onChange(next);
  };
  const undo = () => { const u = undoLast(draft); if (!u.undone) return; setMsg(`Undid: ${describeTap(u.undone)} · total now ${fmt(totalOf(draftCounts(u.draft, base)))}`); onChange(u.draft); };
  const lastTap = draft[draft.length - 1];
  const group = (kind: 'note' | 'coin') => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {DENOMS.filter(d => d.kind === kind).map(d => { const n = countOf(counts, d.cents); return (
        <Pressable key={d.cents} onPress={() => { haptic(); press(d.cents); }} accessibilityRole="button" accessibilityLabel={`${mode === 'add' ? 'Add' : 'Remove'} ${d.label}, ${n} now`}
          style={({ pressed }) => ({ width: '31.5%', height: 64, borderRadius: 14, backgroundColor: mode === 'remove' ? c.bad + '22' : kind === 'note' ? c.accent + '18' : c.fill, opacity: pressed ? 0.6 : 1, alignItems: 'center', justifyContent: 'center', borderWidth: n ? 1.5 : 0, borderColor: mode === 'remove' ? c.bad : c.accent })}>
          <Txt size={20} weight="700">{d.label}</Txt>
          <Txt size={12} sub weight="600">{n ? `× ${n}` : '–'}</Txt>
        </Pressable>); })}
    </View>);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ alignItems: 'center' }}>
        {totalLabel ? <Txt size={13} sub>{totalLabel}</Txt> : null}
        <Txt size={38} weight="700">{fmt(total)}</Txt>
        <Txt size={13} sub style={{ textAlign: 'center', minHeight: 18 }}>{msg}</Txt>
      </View>
      <Segmented value={mode} onChange={m => { setMode(m); setMsg(''); }} options={[{ v: 'add', label: 'Add' }, { v: 'remove', label: 'Remove' }]} />
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Txt size={13} sub weight="600">Each tap</Txt>{MULTS.map(m => <Chip key={m} label={`×${m}`} active={mult === m} onPress={() => setMult(m)} />)}</View>
      <Txt size={13} sub weight="600">Notes</Txt>{group('note')}
      <Txt size={13} sub weight="600">Coins</Txt>{group('coin')}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn title={lastTap ? `Undo ${describeTap(lastTap).replace(/ \(.*\)$/, '')}` : 'Undo'} kind="secondary" small disabled={!draft.length} onPress={undo} style={{ flex: 2 }} />
        <Btn title="Start over" kind="secondary" small disabled={!draft.length} onPress={() => { onChange([]); setMsg('Back to the start.'); }} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
