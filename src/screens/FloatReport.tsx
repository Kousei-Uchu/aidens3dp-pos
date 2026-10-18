// Location: src/screens/FloatReport.tsx
// B1f: the daily float report (More ▸ Cash drawer ▸ Daily float report). Shows the day's cash takings, which notes and coins to take out (bank),
// what that leaves as the float, what to top up, and offers to write the banking into the ledger. Uses the learned profile whether or not Smart change is on.
// Since 0089 the report is worked out after the sheet opens (it plays a day of imagined sales against many drawers), so the sheet shows "Working it out" first.
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Btn, Money, Sheet, Txt, confirm } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp, currentStaff } from '../state/store';
import { drawerChanged } from '../lib/sync';
import { useCashProfile } from '../state/cashProfile';
import { applyEntry, newEntry, summariseCounts, totalOf, type Counts } from '../lib/cashLedger';
import { CountSquares } from '../ui/CountSquares';
import { ledgerTakings, recommendFloat, type FloatOption, type FloatReport } from '../lib/floatReport';
import { profileNote } from '../lib/changeScore';
import { fmt } from '../lib/money';

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const pct = (x: number | null) => (x === null ? '' : `${Math.round(x * 100)}%`);

export function FloatReportSheet({ visible, onClose, cashTakings, since }: { visible: boolean; onClose: () => void; cashTakings: (sinceISO: string) => number; since?: string }) {
  const { c } = useTheme(); const ledger = useApp(s => s.pos.ledger); const shift = useApp(s => s.pos.shift); const patchPos = useApp(s => s.patchPos); const profile = useCashProfile(true);
  const [alt, setAlt] = useState(0); useEffect(() => { if (visible) setAlt(0); }, [visible]);
  const sinceMs = since ? new Date(since).getTime() : startOfToday(); const label = since ? 'since the drawer opened' : 'today';
  const takings = visible ? cashTakings(new Date(sinceMs).toISOString()) : 0; const seen = useMemo(() => ledgerTakings(ledger.entries, sinceMs), [ledger.entries, sinceMs]);
  const [rep, setRep] = useState<FloatReport | null>(null);
  useEffect(() => {
    if (!visible) return; setRep(null); // let the sheet draw first, then do the sums
    const t = setTimeout(() => setRep(recommendFloat({ drawer: ledger.counts, takings, profile, budgetMs: 2500 })), 40); return () => clearTimeout(t);
  }, [visible, ledger.counts, takings, profile]);
  const options: FloatOption[] = rep ? [rep.best, ...rep.alternatives] : []; const shown = rep ? options[Math.min(alt, options.length - 1)] : null;
  const bank = async () => {
    if (!shown || !totalOf(shown.takeOut)) return;
    if (!(await confirm('Write this banking into the ledger?', `Takes ${summariseCounts(shown.takeOut)} (${fmt(shown.takeOutTotal)}) out of the drawer ledger as a paid out. Only do this once the cash has really been taken out.`, 'Record it'))) return;
    const entry = newEntry('paid_out', Object.fromEntries(Object.entries(shown.takeOut).map(([v, n]) => [v, -n])), { staff: currentStaff()?.name, note: 'Daily banking (float report)' });
    patchPos({ ledger: applyEntry(useApp.getState().pos.ledger, entry), ...(shift.open ? { shift: { ...shift, paidOutCents: shift.paidOutCents + shown.takeOutTotal } } : {}) }); drawerChanged(shift.open); onClose();
  };
  const box = (title: string, counts: Counts, tone?: string) => (
    <View style={{ backgroundColor: (tone ?? c.fill) + (tone ? '18' : ''), borderRadius: 14, padding: 14, gap: 2, ...(tone ? { borderWidth: 1.5, borderColor: tone } : {}) }}><CountSquares counts={counts} label={title} total /></View>
  );
  return (
    <Sheet visible={visible} onClose={onClose} title="Daily float report" full>
      <View style={{ gap: 14 }}>
        <View style={{ alignItems: 'center', gap: 2 }}><Txt sub>Cash takings {label}</Txt><Money cents={takings} size={34} weight="700" /><Txt size={12} sub style={{ textAlign: 'center' }}>Cash sales minus cash refunds. The drawer ledger holds {fmt(totalOf(ledger.counts))}{seen.sales ? `, and saw ${fmt(seen.cents)} from ${seen.sales} tracked sale${seen.sales === 1 ? '' : 's'}` : ''}.</Txt></View>
        {takings > 0 && Math.abs(seen.cents - takings) >= 5 ? <Txt size={13} color="#B45309" style={{ textAlign: 'center' }}>The ledger saw {fmt(seen.cents)} but sales say {fmt(takings)}. Some sales weren't tracked, so count the drawer (Count &amp; close) before banking.</Txt> : null}
        {!rep || !shown ? <Txt sub style={{ textAlign: 'center', paddingVertical: 24 }}>Working it out…</Txt> : <>
        {totalOf(shown.takeOut) > 0 ? box('Take out (bank)', shown.takeOut) : null}
        {box('Leave in the drawer as the float', shown.keep, c.good)}
        {options.length > 1 ? <Btn title={alt === 0 ? 'Show another way' : alt < options.length - 1 ? 'Show the next way' : 'Back to the suggested way'} kind="secondary" onPress={() => setAlt(a => (a + 1) % options.length)} /> : null}
        {rep.usedProfile && rep.failKeep !== null ? <Txt size={13} sub style={{ textAlign: 'center' }}>Played against a typical day of your cash sales, this float could give exact change for about {pct(1 - rep.failKeep)} of them{rep.failNow !== null && Math.abs(rep.failNow - rep.failKeep) >= 0.01 ? ` (the drawer as it is now: ${pct(1 - rep.failNow)})` : ''}.</Txt> : null}
        {totalOf(rep.topUp) > 0 ? <>{box('Top up if you can', rep.topUp, '#B45309')}{rep.failTopUp !== null ? <Txt size={13} sub style={{ textAlign: 'center' }}>With the top-up, about {pct(1 - rep.failTopUp)}. The float would be about {fmt(rep.suggestedFloat)}. Only these are asked for because they are the ones that fix the most.</Txt> : null}</> : rep.usedProfile && rep.failKeep !== null ? <Txt size={13} sub style={{ textAlign: 'center' }}>Nothing needs adding.</Txt> : null}
        {totalOf(rep.bankable) > 0 ? <View style={{ gap: 2 }}><CountSquares counts={rep.bankable} label="In the float but never used as change" /><Txt size={13} sub style={{ textAlign: 'center' }}>{Object.keys(rep.bankable).length > 1 ? 'These are' : 'This is'} usually better banked.</Txt></View> : null}
        {rep.notes.map((n, i) => <Txt key={i} size={13} sub style={{ textAlign: 'center' }}>{n}</Txt>)}
        {rep.truncated ? <Txt size={12} sub style={{ textAlign: 'center' }}>The drawer holds a lot, so this is a good answer, not the only one.</Txt> : null}
        <Txt size={12} sub style={{ textAlign: 'center' }}>{profileNote(profile).replace('Smart change is on', 'Based on')}</Txt>
        {totalOf(shown.takeOut) > 0 ? <Btn title="I took this out: record it" onPress={() => void bank()} /> : null}
        </>}
        <Btn title="Close" kind="secondary" onPress={onClose} />
      </View>
    </Sheet>
  );
}
