import React, { useState } from 'react';
import { Share, View } from 'react-native';
import { Btn, Card, Field, Keypad, Money, Page, Row, Sheet, Txt, alertMsg, confirm } from '../ui/kit';
import { useNav } from '../ui/nav';
import { useApp, currentStaff } from '../state/store';
import { csv } from '../lib/csvStore';
import { digitsToCents, fmt } from '../lib/money';

/** Current cash drawer: float, paid in/out, count vs expected, Z-report (simplified, per register). */
export const cashSince = (sinceISO: string, registerId: string, sales = useApp.getState().pos.sales) =>
  sales.filter(s => s.registerId === registerId && s.ts >= sinceISO).reduce((sum, s) => sum + s.tenders.filter(t => t.kind === 'cash').reduce((x, t) => x + (s.type === 'sale' ? t.amountCents + (t.roundingCents ?? 0) : -t.amountCents), 0), 0);

export default function Drawer() {
  const nav = useNav(); const shift = useApp(s => s.pos.shift); const sales = useApp(s => s.pos.sales); const reg = useApp(s => s.settings.registerId); const patchPos = useApp(s => s.patchPos);
  const [sheet, setSheet] = useState<'none' | 'open' | 'in' | 'out' | 'close'>('none'); const [digits, setDigits] = useState(''); const [note, setNote] = useState('');
  const staff = currentStaff()?.name; const cash = shift.open && shift.openedAt ? cashSince(shift.openedAt, reg, sales) : 0;
  const expected = shift.floatCents + cash + shift.paidInCents - shift.paidOutCents; const amt = digitsToCents(digits);
  const done = () => { setSheet('none'); setDigits(''); setNote(''); };
  const submit = async () => {
    if (sheet === 'open') { patchPos({ shift: { open: true, openedAt: new Date().toISOString(), floatCents: amt, paidInCents: 0, paidOutCents: 0, staff } }); void csv.event({ kind: 'shift_open', amountCents: amt, staff }); }
    if (sheet === 'in') { patchPos({ shift: { ...shift, paidInCents: shift.paidInCents + amt } }); void csv.event({ kind: 'paid_in', amountCents: amt, message: note, staff }); }
    if (sheet === 'out') { patchPos({ shift: { ...shift, paidOutCents: shift.paidOutCents + amt } }); void csv.event({ kind: 'paid_out', amountCents: amt, message: note, staff }); }
    if (sheet === 'close') {
      const diff = amt - expected; const z = [`Z-report · ${new Date().toLocaleString()}`, `Opened ${shift.openedAt ? new Date(shift.openedAt).toLocaleString() : ''}`, `Float ${fmt(shift.floatCents)}`, `Cash sales (net of refunds) ${fmt(cash)}`, `Paid in ${fmt(shift.paidInCents)}`, `Paid out ${fmt(shift.paidOutCents)}`, `Expected ${fmt(expected)}`, `Counted ${fmt(amt)}`, `Difference ${fmt(diff)}`].join('\n');
      void csv.event({ kind: 'shift_close', amountCents: amt, message: `expected ${expected} diff ${diff}`, staff }); patchPos({ shift: { open: false, floatCents: 0, paidInCents: 0, paidOutCents: 0 } }); done(); await Share.share({ message: z }); return;
    }
    done();
  };
  return (
    <Page title="Cash drawer" onBack={nav.pop}>
      {!shift.open ? <View style={{ padding: 16, gap: 10 }}><Txt sub>No drawer open on this register.</Txt><Btn title="Open drawer with float" onPress={() => setSheet('open')} /></View> : <>
        <View style={{ margin: 16 }}><Card><Row title="Float" right={<Money cents={shift.floatCents} />} /><Row title="Cash sales" sub="Net of cash refunds" right={<Money cents={cash} />} /><Row title="Paid in" right={<Money cents={shift.paidInCents} />} /><Row title="Paid out" right={<Money cents={-shift.paidOutCents} />} /><Row title="Expected in drawer" right={<Money cents={expected} weight="700" size={18} />} last /></Card></View>
        <View style={{ paddingHorizontal: 16, gap: 8 }}><Btn title="Paid in" kind="secondary" onPress={() => setSheet('in')} /><Btn title="Paid out" kind="secondary" onPress={() => setSheet('out')} /><Btn title="Count & close (Z-report)" onPress={() => setSheet('close')} /></View></>}
      <Sheet visible={sheet !== 'none'} onClose={done} title={sheet === 'open' ? 'Opening float' : sheet === 'in' ? 'Paid in' : sheet === 'out' ? 'Paid out' : 'Counted cash'}>
        <Txt size={38} weight="700" style={{ textAlign: 'center', marginBottom: 8 }}>{fmt(amt)}</Txt>
        {sheet === 'in' || sheet === 'out' ? <Field placeholder="Reason" value={note} onChangeText={setNote} /> : null}
        {sheet === 'close' ? <Txt sub style={{ textAlign: 'center', marginBottom: 8 }}>Expected {fmt(expected)}</Txt> : null}
        <Keypad value={digits} onChange={setDigits} onSubmit={() => void submit()} submitLabel="Confirm" />
      </Sheet>
    </Page>
  );
}
void alertMsg; void confirm;
