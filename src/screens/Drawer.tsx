import React, { useState } from 'react';
import { Share, View } from 'react-native';
import { Btn, Card, Field, Money, Page, Row, Section, Sheet, Txt, alertMsg, confirm } from '../ui/kit';
import { DenomPad } from '../ui/DenomPad';
import { useNav } from '../ui/nav';
import { useApp, currentStaff } from '../state/store';
import { csv } from '../lib/csvStore';
import { fmt } from '../lib/money';
import { DENOMS, LEDGER_LABEL, applyEntry, diffCounts, draftCounts, entryTotal, newEntry, shortfall, summariseCounts, totalOf, type Draft, type LedgerKind } from '../lib/cashLedger';

/** Current cash drawer: float, paid in/out, count vs expected, Z-report (simplified, per register). */
export const cashSince = (sinceISO: string, registerId: string, sales = useApp.getState().pos.sales) =>
  sales.filter(s => s.registerId === registerId && s.ts >= sinceISO).reduce((sum, s) => sum + s.tenders.filter(t => t.kind === 'cash').reduce((x, t) => x + (s.type === 'sale' ? t.amountCents + (t.roundingCents ?? 0) : -t.amountCents), 0), 0);

export default function Drawer() {
  const nav = useNav(); const shift = useApp(s => s.pos.shift); const sales = useApp(s => s.pos.sales); const reg = useApp(s => s.settings.registerId); const patchPos = useApp(s => s.patchPos); const ledger = useApp(s => s.pos.ledger);
  const [sheet, setSheet] = useState<'none' | 'open' | 'in' | 'out' | 'close' | 'fix'>('none'); const [draft, setDraft] = useState<Draft>([]); const [note, setNote] = useState('');
  const staff = currentStaff()?.name; const cash = shift.open && shift.openedAt ? cashSince(shift.openedAt, reg, sales) : 0;
  const expected = shift.floatCents + cash + shift.paidInCents - shift.paidOutCents;
  // open and "fix contents" start from what the drawer holds (adjust it); in, out and the closing count start empty (a blind count)
  const base = sheet === 'open' || sheet === 'fix' ? ledger.counts : {};
  const entered = draftCounts(draft, base); const amt = totalOf(entered);
  const done = () => { setSheet('none'); setDraft([]); setNote(''); };
  const record = (kind: LedgerKind, delta: Record<string, number>, n?: string) => applyEntry(useApp.getState().pos.ledger, newEntry(kind, delta, { staff, note: n }));

  const submit = async () => {
    if (sheet === 'open') {
      const l = record('open', diffCounts(entered, ledger.counts), 'Float ' + fmt(amt));
      patchPos({ shift: { open: true, openedAt: new Date().toISOString(), floatCents: amt, paidInCents: 0, paidOutCents: 0, staff }, ledger: l }); void csv.event({ kind: 'shift_open', amountCents: amt, staff, message: summariseCounts(entered) });
    }
    if (sheet === 'in') {
      if (!amt) return alertMsg('Nothing entered', 'Tap the notes and coins that went in.');
      patchPos({ shift: { ...shift, paidInCents: shift.paidInCents + amt }, ledger: record('paid_in', entered, note) }); void csv.event({ kind: 'paid_in', amountCents: amt, message: [note, summariseCounts(entered)].filter(Boolean).join(' · '), staff });
    }
    if (sheet === 'out') {
      if (!amt) return alertMsg('Nothing entered', 'Tap the notes and coins that came out.');
      const short = shortfall(ledger.counts, entered);
      if (short.length && !(await confirm('More than the drawer should hold', `You are taking ${short.map(x => `${x.need} × ${DENOMS.find(d => d.cents === x.cents)?.label} (ledger has ${x.have})`).join(', ')}. The ledger may not know about recent cash sales yet. Take it out anyway?`, 'Take out'))) return;
      patchPos({ shift: { ...shift, paidOutCents: shift.paidOutCents + amt }, ledger: record('paid_out', Object.fromEntries(Object.entries(entered).map(([v, n]) => [v, -n])), note) }); void csv.event({ kind: 'paid_out', amountCents: amt, message: [note, summariseCounts(entered)].filter(Boolean).join(' · '), staff });
    }
    if (sheet === 'fix') {
      const delta = diffCounts(entered, ledger.counts); if (!Object.keys(delta).length) return done();
      patchPos({ ledger: record('adjust', delta, note || 'Corrected by hand') });
    }
    if (sheet === 'close') {
      const diff = amt - expected; const byDenom = diffCounts(entered, ledger.counts);
      const z = [`Z-report · ${new Date().toLocaleString()}`, `Opened ${shift.openedAt ? new Date(shift.openedAt).toLocaleString() : ''}`, `Float ${fmt(shift.floatCents)}`, `Cash sales (net of refunds) ${fmt(cash)}`, `Paid in ${fmt(shift.paidInCents)}`, `Paid out ${fmt(shift.paidOutCents)}`, `Expected ${fmt(expected)}`, `Counted ${fmt(amt)}`, `Difference ${fmt(diff)}`, `In the drawer: ${summariseCounts(entered)}`].join('\n');
      void csv.event({ kind: 'shift_close', amountCents: amt, message: `expected ${expected} diff ${diff}; ${summariseCounts(entered)}`, staff });
      // what was counted becomes what the ledger says is in the drawer; the next opening starts from it
      patchPos({ shift: { open: false, floatCents: 0, paidInCents: 0, paidOutCents: 0 }, ledger: record('close', byDenom, `Counted ${fmt(amt)}`) }); done(); await Share.share({ message: z }); return;
    }
    done();
  };
  const title = sheet === 'open' ? 'Opening float' : sheet === 'in' ? 'Paid in' : sheet === 'out' ? 'Paid out' : sheet === 'fix' ? 'Correct drawer contents' : 'Count the drawer';
  const hint = sheet === 'open' ? `Carried over from last time: ${fmt(totalOf(ledger.counts))}. Tap to add or remove until it matches what you are putting in.` : sheet === 'fix' ? 'Starts from what the ledger thinks is there. Add or remove until it matches the drawer.'
    : sheet === 'close' ? `Count everything in the drawer. Expected ${fmt(expected)}.` : sheet === 'in' ? 'Tap the notes and coins you are putting in.' : 'Tap the notes and coins you are taking out.';
  const recent = ledger.entries.slice(0, 15);
  return (
    <Page title="Cash drawer" onBack={nav.pop}>
      {!shift.open ? <View style={{ padding: 16, gap: 10 }}><Txt sub>No drawer open on this register.</Txt><Btn title="Open drawer with float" onPress={() => setSheet('open')} /></View> : <>
        <View style={{ margin: 16 }}><Card><Row title="Float" right={<Money cents={shift.floatCents} />} /><Row title="Cash sales" sub="Net of cash refunds" right={<Money cents={cash} />} /><Row title="Paid in" right={<Money cents={shift.paidInCents} />} /><Row title="Paid out" right={<Money cents={-shift.paidOutCents} />} /><Row title="Expected in drawer" right={<Money cents={expected} weight="700" size={18} />} last /></Card></View>
        <View style={{ paddingHorizontal: 16, gap: 8 }}><Btn title="Paid in" kind="secondary" onPress={() => setSheet('in')} /><Btn title="Paid out" kind="secondary" onPress={() => setSheet('out')} /><Btn title="Count & close (Z-report)" onPress={() => setSheet('close')} /></View></>}

      <Section title="Notes and coins in the drawer" footer="This is the ledger: what the drawer should hold. Counting at close resets it to what you actually counted. Cash sales will add to it from the Cash screen in a later update.">
        {DENOMS.map(d => <Row key={d.cents} title={d.label} sub={d.kind === 'note' ? 'Note' : 'Coin'} right={<View style={{ alignItems: 'flex-end' }}><Txt weight="700">× {ledger.counts[String(d.cents)] ?? 0}</Txt><Txt size={12} sub>{fmt(d.cents * (ledger.counts[String(d.cents)] ?? 0))}</Txt></View>} />)}
        <Row title="Total in the drawer" right={<Money cents={totalOf(ledger.counts)} weight="700" size={18} />} last />
      </Section>
      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}><Btn title="Correct contents" kind="secondary" icon="create-outline" onPress={() => setSheet('fix')} /></View>

      <Section title="Cash history">
        {recent.length ? recent.map((e, i) => { const t = entryTotal(e); return <Row key={e.id} last={i === recent.length - 1} icon={t < 0 ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'} title={`${LEDGER_LABEL[e.kind]}${e.staff ? ` · ${e.staff}` : ''}`}
          sub={`${new Date(e.ts).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · ${summariseCounts(e.delta)}${e.note ? ` · ${e.note}` : ''}`} right={<Money cents={t} weight="600" />} />; }) : <Row title="Nothing yet" sub="Opening the drawer, paid in/out and counts show up here." last />}
      </Section>

      <Sheet visible={sheet !== 'none'} onClose={done} title={title} full>
        <Txt size={13} sub style={{ textAlign: 'center', marginBottom: 8 }}>{hint}</Txt>
        {sheet === 'in' || sheet === 'out' || sheet === 'fix' ? <Field kind="text" placeholder={sheet === 'fix' ? 'Reason (optional)' : 'Reason'} value={note} onChangeText={setNote} /> : null}
        <DenomPad draft={draft} onChange={setDraft} base={base} />
        {sheet === 'close' ? <Txt size={13} style={{ textAlign: 'center', marginTop: 10 }} color={amt === expected ? '#16A34A' : '#B45309'}>{amt === expected ? 'Matches the expected amount.' : `${amt > expected ? 'Over' : 'Short'} by ${fmt(Math.abs(amt - expected))}`}</Txt> : null}
        <Btn title="Confirm" onPress={() => void submit()} style={{ marginTop: 14 }} />
      </Sheet>
    </Page>
  );
}
void alertMsg; void confirm;
