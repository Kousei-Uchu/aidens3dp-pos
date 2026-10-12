// Location: src/screens/SwapCash.tsx
// 0091 (device test T6, part 2): "Swap my cash". Tap the notes and coins you hold yourself and see which to hand into the drawer and which to take
// out in exchange, so the drawer is better stocked for the next sales. An even swap, so the float and the Z-report never change; it is written
// to the ledger as a "Contents corrected" entry only when you say the swap has really happened.
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Btn, Sheet, Txt, confirm } from '../ui/kit';
import { DenomPad } from '../ui/DenomPad';
import { CountSquares } from '../ui/CountSquares';
import { useTheme } from '../ui/theme';
import { useApp, currentStaff } from '../state/store';
import { useCashProfile } from '../state/cashProfile';
import { applyEntry, draftCounts, newEntry, summariseCounts, totalOf, type Draft } from '../lib/cashLedger';
import { planSwap, swapIsValid, type SwapPlan } from '../lib/cashSwap';
import { dayScript } from '../lib/floatPlan';
import { fmt } from '../lib/money';

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function SwapCashSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { c } = useTheme(); const ledger = useApp(s => s.pos.ledger); const patchPos = useApp(s => s.patchPos); const profile = useCashProfile(true);
  const [draft, setDraft] = useState<Draft>([]); const [plan, setPlan] = useState<SwapPlan | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setDraft([]); setPlan(null); } }, [visible]);
  const own = useMemo(() => draftCounts(draft), [draft]);
  // work it out after the pad has drawn, and again a moment after the last tap, so tapping stays quick
  useEffect(() => {
    if (!visible) return; if (!totalOf(own)) { setPlan(null); setBusy(false); return; }
    setBusy(true); const t = setTimeout(() => { setPlan(planSwap(ledger.counts, own, dayScript(profile), { budgetMs: 2000 })); setBusy(false); }, 350); return () => clearTimeout(t);
  }, [visible, own, ledger.counts, profile]);
  const found = !!plan && swapIsValid(ledger.counts, plan);
  const record = async () => {
    if (!plan || !found) return;
    if (!(await confirm('Write this swap into the ledger?', `The drawer takes in ${summariseCounts(plan.give)} and gives out ${summariseCounts(plan.take)} (${fmt(totalOf(plan.give))} each way). Only do this once the notes and coins have really changed hands.`, 'Record it'))) return;
    const delta: Record<string, number> = { ...plan.give }; for (const [k, n] of Object.entries(plan.take)) delta[k] = (delta[k] ?? 0) - n;
    patchPos({ ledger: applyEntry(useApp.getState().pos.ledger, newEntry('adjust', delta, { staff: currentStaff()?.name, note: 'Swapped with own cash' })) }); onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Swap my cash" full>
      <View style={{ gap: 14 }}>
        <Txt size={13} sub style={{ textAlign: 'center' }}>Tap the notes and coins you have on you. It suggests which to put in the drawer and which to take out, even value both ways, so the drawer copes better with the next sales.</Txt>
        <DenomPad draft={draft} onChange={setDraft} totalLabel="I have" />
        {!totalOf(own) ? <Txt size={13} sub style={{ textAlign: 'center' }}>Nothing entered yet.</Txt> : busy || !plan ? <Txt sub style={{ textAlign: 'center', paddingVertical: 12 }}>Working it out…</Txt> : found ? <>
          <View style={{ backgroundColor: c.accent + '18', borderRadius: 14, padding: 14, gap: 8, borderWidth: 1.5, borderColor: c.accent }}>
            <Txt weight="700" size={17}>Swap {fmt(totalOf(plan.give))}</Txt>
            <CountSquares counts={plan.give} label="Put in the drawer (yours)" total align="start" />
            <CountSquares counts={plan.take} label="Take out of the drawer" total align="start" />
          </View>
          <Txt size={13} sub style={{ textAlign: 'center' }}>Played against a typical day of cash sales, the drawer could give exact change for about {pct(plan.okAfter)} of them{Math.abs(plan.okAfter - plan.okBefore) >= 0.01 ? ` (now ${pct(plan.okBefore)})` : ', the same as now'}, and would hold {plan.piecesAfter} notes and coins instead of {plan.piecesBefore}.</Txt>
          {plan.stopped === 'time' ? <Txt size={12} sub style={{ textAlign: 'center' }}>It ran out of thinking time, so this is the best swap it found, not the only one.</Txt> : null}
          <Btn title="I swapped it: record it" onPress={() => void record()} />
        </> : <Txt size={14} style={{ textAlign: 'center' }}>{plan.stopped === 'no-gain' ? 'Nothing worth swapping: the drawer has nothing it can spare that would help, or it already copes well with these notes in it.' : 'Nothing to swap.'}</Txt>}
        <Btn title="Close" kind="secondary" onPress={onClose} />
      </View>
    </Sheet>
  );
}
