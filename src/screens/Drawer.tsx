import React, { useRef, useState } from 'react';
import { Share, View } from 'react-native';
import { Btn, Card, Field, Money, Page, Row, Section, Sheet, Toggle, Txt, alertMsg, confirm } from '../ui/kit';
import { DenomPad } from '../ui/DenomPad';
import { FloatReportSheet } from './FloatReport';
import { SwapCashSheet } from './SwapCash';
import { useNav } from '../ui/nav';
import { useApp, currentStaff } from '../state/store';
import { drawerChanged } from '../lib/sync';
import { ledgerCashSince } from '../lib/drawerSync';
import { addLoan, loanOwed, repayLoan } from '../lib/drawerLoan';
import { closedShift, openedShift, takingsSince } from '../lib/drawerBanking';
import { csv } from '../lib/csvStore';
import { fmt } from '../lib/money';
import { DENOMS, LEDGER_LABEL, applyEntry, diffCounts, draftCounts, entryTotal, newEntry, shortfall, summariseCounts, totalOf, type Draft, type LedgerKind } from '../lib/cashLedger';
import { Spot } from '../ui/Spot';
import { SPOT } from '../lib/trainingSpots';

/** Current cash drawer: float, paid in/out, count vs expected, Z-report. One shared drawer for the shop (0167), so it is
 *  synced between registers and cash is counted from every register, not just this one. */
export const cashSince = (sinceISO: string, registerId: string | undefined, sales = useApp.getState().pos.sales) =>
  !registerId ? ledgerCashSince(useApp.getState().pos.ledger, sinceISO) : sales.filter(s => (!registerId || s.registerId === registerId) && s.ts >= sinceISO).reduce((sum, s) => sum + s.tenders.filter(t => t.kind === 'cash').reduce((x, t) => x + (s.type === 'sale' ? t.amountCents + (t.roundingCents ?? 0) : -t.amountCents), 0), 0);

export default function Drawer() {
  const nav = useNav(); const shift = useApp(s => s.pos.shift); const sales = useApp(s => s.pos.sales); const patchPos = useApp(s => s.patchPos); const ledger = useApp(s => s.pos.ledger);
  const [sheet, setSheet] = useState<'none' | 'open' | 'in' | 'out' | 'close' | 'fix'>('none'); const [floatOpen, setFloatOpen] = useState(false); const [swapOpen, setSwapOpen] = useState(false); const [draft, setDraft] = useState<Draft>([]); const [note, setNote] = useState(''); const [loan, setLoan] = useState(false);
  // 0228: closing counts the drawer and then goes straight on to taking the takings out; the Z-report is shared once that step is done (or put off)
  const [closing, setClosing] = useState(false); const [zText, setZText] = useState(''); const bankedLine = useRef(''); // a ref, because the banking sheet closes itself straight after telling us what it took out
  const staff = currentStaff()?.name; const cash = shift.open && shift.openedAt ? cashSince(shift.openedAt, undefined, sales) : 0;
  const expected = shift.floatCents + cash + shift.paidInCents - shift.paidOutCents; const owed = loanOwed(shift); // owed: a loan you put in that is still to be taken back out (0188)
  // open and "fix contents" start from what the drawer holds (adjust it); in, out and the closing count start empty (a blind count)
  const base = sheet === 'open' || sheet === 'fix' ? ledger.counts : {};
  const entered = draftCounts(draft, base); const amt = totalOf(entered);
  const done = () => { setSheet('none'); setDraft([]); setNote(''); setLoan(false); };
  const record = (kind: LedgerKind, delta: Record<string, number>, n?: string) => applyEntry(useApp.getState().pos.ledger, newEntry(kind, delta, { staff, note: n }));

  const submit = async () => {
    if (sheet === 'open') {
      const l = record('open', diffCounts(entered, ledger.counts), 'Float ' + fmt(amt));
      patchPos({ shift: openedShift(shift, { openedAt: new Date().toISOString(), floatCents: amt, staff }), ledger: l }); drawerChanged(true); void csv.event({ kind: 'shift_open', amountCents: amt, staff, message: summariseCounts(entered) });
    }
    if (sheet === 'in') {
      if (!amt) return alertMsg('Nothing entered', 'Tap the notes and coins that went in.');
      const inNote = [loan ? 'Loan to drawer' : '', note].filter(Boolean).join(' · '); const paidIn = { ...shift, paidInCents: shift.paidInCents + amt };
      patchPos({ shift: loan ? addLoan(paidIn, amt) : paidIn, ledger: record('paid_in', entered, inNote) }); drawerChanged(true); void csv.event({ kind: 'paid_in', amountCents: amt, message: [inNote, summariseCounts(entered)].filter(Boolean).join(' · '), staff });
    }
    if (sheet === 'out') {
      if (!amt) return alertMsg('Nothing entered', 'Tap the notes and coins that came out.');
      const short = shortfall(ledger.counts, entered);
      if (short.length && !(await confirm('More than the drawer should hold', `You are taking ${short.map(x => `${x.need} × ${DENOMS.find(d => d.cents === x.cents)?.label} (ledger has ${x.have})`).join(', ')}. The ledger may not know about recent cash sales yet. Take it out anyway?`, 'Take out'))) return;
      const outNote = [loan && owed ? 'Loan taken back' : '', note].filter(Boolean).join(' · '); const paidOut = { ...shift, paidOutCents: shift.paidOutCents + amt };
      patchPos({ shift: loan && owed ? repayLoan(paidOut, amt) : paidOut, ledger: record('paid_out', Object.fromEntries(Object.entries(entered).map(([v, n]) => [v, -n])), outNote) }); drawerChanged(true); void csv.event({ kind: 'paid_out', amountCents: amt, message: [outNote, summariseCounts(entered)].filter(Boolean).join(' · '), staff });
    }
    if (sheet === 'fix') {
      const delta = diffCounts(entered, ledger.counts); if (!Object.keys(delta).length) return done();
      patchPos({ ledger: record('adjust', delta, note || 'Corrected by hand') }); drawerChanged();
    }
    if (sheet === 'close') {
      const diff = amt - expected; const byDenom = diffCounts(entered, ledger.counts);
      const z = [`Z-report · ${new Date().toLocaleString()}`, `Opened ${shift.openedAt ? new Date(shift.openedAt).toLocaleString() : ''}`, `Float ${fmt(shift.floatCents)}`, `Cash sales (net of refunds) ${fmt(cash)}`, `Paid in ${fmt(shift.paidInCents)}`, `Paid out ${fmt(shift.paidOutCents)}`, ...(owed ? [`Loan still owed to you ${fmt(owed)}`] : []), `Expected ${fmt(expected)}`, `Counted ${fmt(amt)}`, `Difference ${fmt(diff)}`, `In the drawer: ${summariseCounts(entered)}`].join('\n');
      void csv.event({ kind: 'shift_close', amountCents: amt, message: `expected ${expected} diff ${diff}; ${summariseCounts(entered)}`, staff });
      // what was counted becomes what the ledger says is in the drawer; the next opening starts from it. The period's takings and any loan still owed stay
      // marked as not yet taken out (0228), and the step that takes them out opens next.
      patchPos({ shift: closedShift(shift), ledger: record('close', byDenom, `Counted ${fmt(amt)}`) }); drawerChanged(true); done();
      setZText(z); bankedLine.current = ''; setClosing(true); setFloatOpen(true); return;
    }
    done();
  };
  const finishFloat = async () => {
    setFloatOpen(false); if (!closing) return;
    const z = zText; setClosing(false); setZText(''); if (!z) return;
    await Share.share({ message: [z, bankedLine.current || 'Takings not yet taken out: take them out from Daily float report.'].join('\n') });
  };
  const waiting = !shift.open && (owed > 0 || ledgerCashSince(ledger, takingsSince(shift)) > 0);
  const title = sheet === 'open' ? 'Opening float' : sheet === 'in' ? 'Paid in' : sheet === 'out' ? 'Paid out' : sheet === 'fix' ? 'Correct drawer contents' : 'Count the drawer';
  const hint = sheet === 'open' ? `Carried over from last time: ${fmt(totalOf(ledger.counts))}. Tap to add or remove until it matches what you are putting in.` : sheet === 'fix' ? 'Starts from what the ledger thinks is there. Add or remove until it matches the drawer.'
    : sheet === 'close' ? `Count everything in the drawer. Expected ${fmt(expected)}.` : sheet === 'in' ? 'Tap the notes and coins you are putting in.' : owed ? `Tap the notes and coins you are taking out. You are owed ${fmt(owed)} from the loan.` : 'Tap the notes and coins you are taking out.';
  const recent = ledger.entries.slice(0, 15);
  return (
    <Page title="Cash drawer" onBack={nav.pop} helpId="cash">
      {!shift.open ? <View style={{ padding: 16, gap: 10 }}><Txt sub>No drawer open.</Txt><Txt size={13} sub>This is one drawer shared with every register: open it here and it is open on all of them.</Txt>{waiting ? <Txt size={13} color="#B45309">{owed ? `You are still owed a ${fmt(owed)} loan. ` : ''}Takings from the last period have not been taken out yet. Use Daily float report below to take them out.</Txt> : null}<Btn title="Open drawer with float" onPress={() => setSheet('open')} spot={SPOT.drawerOpen} /></View> : <>
        <View style={{ margin: 16 }}><Card><Row title="Float" right={<Money cents={shift.floatCents} />} /><Row title="Cash sales" sub="Net of cash refunds" right={<Money cents={cash} />} /><Row title="Paid in" sub={owed ? `Includes a ${fmt(owed)} loan` : undefined} right={<Money cents={shift.paidInCents} />} /><Row title="Paid out" right={<Money cents={-shift.paidOutCents} />} /><Row title="Expected in drawer" right={<Money cents={expected} weight="700" size={18} />} last /></Card></View>
        <View style={{ paddingHorizontal: 16, gap: 8 }}><Btn title="Paid in" kind="secondary" onPress={() => setSheet('in')} spot={SPOT.drawerPaidIn} />{owed ? <Btn title={`Take loan back (${fmt(owed)})`} kind="secondary" onPress={() => { setLoan(true); setSheet('out'); }} /> : null}<Btn title="Paid out" kind="secondary" onPress={() => setSheet('out')} spot={SPOT.drawerPaidOut} /><Btn title="Count & close (Z-report)" onPress={() => setSheet('close')} spot={SPOT.drawerCountClose} /></View></>}

      <Section title="Notes and coins in the drawer" footer="This is the ledger: what the drawer should hold. Counting at close resets it to what you actually counted. Cash sales at the Cash screen add to it as you tap the notes and coins.">
        {DENOMS.map(d => <Row key={d.cents} title={d.label} sub={d.kind === 'note' ? 'Note' : 'Coin'} right={<View style={{ alignItems: 'flex-end' }}><Txt weight="700">× {ledger.counts[String(d.cents)] ?? 0}</Txt><Txt size={12} sub>{fmt(d.cents * (ledger.counts[String(d.cents)] ?? 0))}</Txt></View>} />)}
        <Row title="Total in the drawer" right={<Money cents={totalOf(ledger.counts)} weight="700" size={18} />} last />
      </Section>
      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}><Btn title="Correct contents" kind="secondary" icon="create-outline" onPress={() => setSheet('fix')} spot={SPOT.drawerCorrect} /><Btn title="Daily float report" kind="secondary" icon="stats-chart-outline" onPress={() => setFloatOpen(true)} style={{ marginTop: 8 }} spot={SPOT.drawerFloatReport} /><Btn title="Swap my cash" kind="secondary" icon="swap-horizontal-outline" onPress={() => setSwapOpen(true)} style={{ marginTop: 8 }} spot={SPOT.drawerSwapCash} /></View>
      <SwapCashSheet visible={swapOpen} onClose={() => setSwapOpen(false)} />
      <FloatReportSheet visible={floatOpen} onClose={() => void finishFloat()} closing={closing} since={takingsSince(shift)} onBanked={l => { bankedLine.current = l; }} cashTakings={since => cashSince(since, undefined, sales)} />

      <Section title="Cash history">
        {recent.length ? recent.map((e, i) => { const t = entryTotal(e); return <Row key={e.id} last={i === recent.length - 1} icon={t < 0 ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'} title={`${LEDGER_LABEL[e.kind]}${e.staff ? ` · ${e.staff}` : ''}`}
          sub={`${new Date(e.ts).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · ${summariseCounts(e.delta)}${e.note ? ` · ${e.note}` : ''}`} right={<Money cents={t} weight="600" />} />; }) : <Row title="Nothing yet" sub="Opening the drawer, paid in/out and counts show up here." last />}
      </Section>

      <Sheet visible={sheet !== 'none'} onClose={done} title={title} full>
        <Txt size={13} sub style={{ textAlign: 'center', marginBottom: 8 }}>{hint}</Txt>
        {sheet === 'in' || sheet === 'out' || sheet === 'fix' ? <Spot id={SPOT.drawerNote}><Field kind="text" placeholder={sheet === 'fix' ? 'Reason (optional)' : 'Reason'} value={note} onChangeText={setNote} /></Spot> : null}
        {sheet === 'in' ? <Toggle label="This is a loan to the drawer" sub="Marked so you can take the same amount back out at the end." value={loan} onChange={setLoan} /> : null}
        {sheet === 'out' && owed ? <Toggle label="This takes the loan back" sub={`${fmt(owed)} still owed to you.`} value={loan} onChange={setLoan} /> : null}
        <DenomPad draft={draft} onChange={setDraft} base={base} spots={{ pad: SPOT.drawerDenom, undo: 'cash.undo' }} />
        {sheet === 'close' ? <Txt size={13} style={{ textAlign: 'center', marginTop: 10 }} color={amt === expected ? '#16A34A' : '#B45309'}>{amt === expected ? 'Matches the expected amount.' : `${amt > expected ? 'Over' : 'Short'} by ${fmt(Math.abs(amt - expected))}`}</Txt> : null}
        <Btn title="Confirm" onPress={() => void submit()} style={{ marginTop: 14 }} spot={SPOT.drawerConfirm} />
      </Sheet>
    </Page>
  );
}
void alertMsg; void confirm;
