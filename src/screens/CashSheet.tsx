// Location: src/screens/CashSheet.tsx
// Taking cash by tapping the notes and coins handed over (0019), with prompts for the awkward cases (0020): too little cash, change the
// drawer can't make, a smaller handover that would work, or part cash + card. Also the "give cash" step used for change and cash refunds.
// Everything is confirmed by hand: the cashier taps what they received and confirms what they gave. No hardware is involved.
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useUi } from '../ui/uiProfile';
import { cashHint } from '../lib/simpleLabels';
import { Btn, Money, Sheet, Txt } from '../ui/kit';
import { DenomPad } from '../ui/DenomPad';
import { useTheme } from '../ui/theme';
import { useApp } from '../state/store';
import { addCounts, draftCounts, summariseCounts, totalOf, type Counts, type Draft } from '../lib/cashLedger';
import { cashStatus, countsToDraft, handBackOptions, ledgerEmpty, partCashOption, planChange } from '../lib/cashSale';
import { planChangeSmart } from '../lib/changeScore';
import { useCashProfile } from '../state/cashProfile';
import { fmt } from '../lib/money';

/** What the sheet hands back. `received` / `given` are null when the cashier chose not to track notes and coins for this sale.
 *  `applyCents` is set when only part of the bill is being paid in cash (the rest goes on card). */
export type CashResult = { tendered: number; received: Counts | null; given: Counts | null; applyCents?: number };

/** Notes and coins to hand to the customer: the suggestion from `pool`, or tap what is really given. */
export function GiveCash({ pool, owed, headline = 'Give the customer', detail, onConfirm }: { pool: Counts; owed: number; headline?: string; detail?: string; onConfirm: (given: Counts | null) => void }) {
  const { c } = useTheme(); const [manual, setManual] = useState(false); const [draft, setDraft] = useState<Draft>([]); const [alt, setAlt] = useState(0);
  const profile = useCashProfile(); const plan = useMemo(() => planChangeSmart(pool, owed, profile), [pool, owed, profile]); const none = ledgerEmpty(pool);
  useEffect(() => { setAlt(0); }, [pool, owed]);
  const giving = draftCounts(draft); const gave = totalOf(giving); const manualMode = manual || plan.kind === 'impossible';
  const options = plan.kind === 'exact' ? [plan.counts, ...plan.alternatives] : []; const shown = options[Math.min(alt, Math.max(0, options.length - 1))];
  return (
    <View style={{ gap: 14 }}>
      <View style={{ alignItems: 'center', gap: 2 }}><Txt sub>{headline}</Txt><Money cents={owed} size={38} weight="700" />{detail ? <Txt size={13} sub>{detail}</Txt> : null}</View>
      {!manualMode && plan.kind === 'exact' && shown ? (
        <>
          <View style={{ backgroundColor: c.fill, borderRadius: 14, padding: 14, alignItems: 'center' }}>
            <Txt size={13} sub weight="600">Take from the drawer</Txt>
            <Txt size={22} weight="700" style={{ textAlign: 'center' }}>{summariseCounts(shown)}</Txt>
            {plan.smart ? <Txt size={12} sub style={{ textAlign: 'center' }}>{alt === 0 ? plan.why : 'Another way to make the same change.'}</Txt> : null}
            {plan.truncated ? <Txt size={12} sub style={{ textAlign: 'center' }}>The drawer holds a lot, so this is a good answer, not the only one.</Txt> : null}
          </View>
          <Btn title="Gave this" onPress={() => onConfirm(shown)} />
          {options.length > 1 ? <Btn title={alt === 0 ? 'Show another way' : alt < options.length - 1 ? 'Show the next way' : 'Back to the suggested way'} kind="secondary" onPress={() => setAlt(a => (a + 1) % options.length)} /> : null}
          <Btn title="I'll give different notes and coins" kind="secondary" onPress={() => { setManual(true); setDraft([]); }} />
        </>
      ) : (
        <>
          {plan.kind === 'impossible' ? <Txt size={14} color={c.bad} style={{ textAlign: 'center' }}>{none ? 'The ledger shows no cash in the drawer, so nothing can be suggested.' : `The drawer can't make exactly ${fmt(owed)} from what it holds.`} Tap what you actually give.</Txt> : <Txt size={14} sub style={{ textAlign: 'center' }}>Tap the notes and coins you give.</Txt>}
          <DenomPad draft={draft} onChange={setDraft} totalLabel="Given" />
          {gave !== owed ? <Txt weight="600" color={gave > owed ? c.bad : c.sub} style={{ textAlign: 'center' }}>{gave > owed ? `${fmt(gave - owed)} too much` : `${fmt(owed - gave)} still to give`}</Txt> : null}
          <Btn title="Gave this" disabled={gave !== owed} onPress={() => onConfirm(giving)} />
        </>
      )}
      <Btn title="Done, but don't track it" kind="ghost" onPress={() => onConfirm(null)} />
    </View>
  );
}

/** Cash refund: which notes and coins to hand the customer. */
export function GiveCashSheet({ visible, amount, onDone }: { visible: boolean; amount: number; onDone: (given: Counts | null) => void }) {
  const drawer = useApp(s => s.pos.ledger.counts);
  return <Sheet visible={visible} onClose={() => onDone(null)} title="Give cash refund" dismissable={false}><GiveCash pool={drawer} owed={amount} headline="Give the customer" onConfirm={onDone} /></Sheet>;
}

export function CashSheet({ visible, onClose, due, onTake }: { visible: boolean; onClose: () => void; due: number; onTake: (r: CashResult) => void }) {
  const { c } = useTheme(); const ui = useUi(); const drawer = useApp(s => s.pos.ledger.counts);
  const [step, setStep] = useState<'receive' | 'change'>('receive'); const [draft, setDraft] = useState<Draft>([]); const [partX, setPartX] = useState<number | null>(null); const [force, setForce] = useState(false);
  useEffect(() => { if (visible) { setStep('receive'); setDraft([]); setPartX(null); setForce(false); } }, [visible]);

  const billDue = partX ?? due; const received = useMemo(() => draftCounts(draft), [draft]); const got = totalOf(received); const st = cashStatus(billDue, got);
  const change = st.state === 'change' ? st.change : 0; const pool = useMemo(() => addCounts(drawer, received), [drawer, received]);
  const plan = useMemo(() => (change > 0 ? planChange(pool, change) : { kind: 'none' as const }), [pool, change]);
  const blocked = st.state === 'change' && plan.kind === 'impossible' && !force;
  const empty = ledgerEmpty(drawer);
  const hand = useMemo(() => (blocked ? handBackOptions(drawer, received, billDue) : null), [blocked, drawer, received, billDue]);
  const part = useMemo(() => (blocked && partX === null ? partCashOption(drawer, received, due) : null), [blocked, partX, drawer, received, due]);

  const finish = (given: Counts | null) => onTake({ tendered: got, received, given, ...(partX !== null ? { applyCents: partX } : {}) });

  return (
    <Sheet visible={visible} onClose={onClose} title={step === 'receive' ? 'Cash received' : 'Give change'}>
      {step === 'receive' ? (
        <View style={{ gap: 14 }}>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Txt sub>{partX !== null ? 'Cash part of the bill' : 'Due'}</Txt><Money cents={billDue} size={30} weight="700" />
            {partX !== null ? <Txt size={13} sub>{fmt(due - partX)} will be left to pay another way</Txt> : null}
            {st.state === 'short' ? <Txt weight="600" color={c.bad}>Short by {fmt(st.shortBy)}</Txt> : st.state === 'change' ? <Txt weight="600" color={blocked ? c.bad : c.good}>Change to give: {fmt(st.change)}</Txt> : st.state === 'exact' && got > 0 ? <Txt weight="600" color={c.good}>Exact</Txt> : <Txt sub>Tap what the customer hands over</Txt>}
          </View>
          {cashHint(ui.explain) ? <Txt size={13} sub style={{ textAlign: 'center' }}>{cashHint(ui.explain)}</Txt> : null}
          <DenomPad draft={draft} onChange={d => { setDraft(d); setForce(false); }} totalLabel="Received" />

          {st.state === 'short' ? (
            <>
              <Txt size={13} sub style={{ textAlign: 'center' }}>That doesn't cover the bill. Ask for {fmt(st.shortBy)} more, or take this as a part payment and put the other {fmt(st.shortBy)} on card or another method.</Txt>
              <Btn title={`Take ${fmt(got)} as part payment`} onPress={() => finish(null)} />
            </>
          ) : null}
          {st.state === 'exact' && got > 0 ? <Btn title="Take cash" onPress={() => finish(null)} /> : null}

          {st.state === 'change' ? (
            <>
              {blocked ? (
                <View style={{ gap: 8, backgroundColor: c.bad + '14', borderRadius: 14, padding: 12 }}>
                  <Txt weight="700" color={c.bad}>{empty ? 'No cash in the ledger' : `Can't make ${fmt(change)} change`}</Txt>
                  <Txt size={13}>{empty ? 'The ledger shows an empty drawer (it was never opened or counted), so change can\'t be suggested.' : 'The drawer ledger doesn\'t hold the notes and coins for exact change.'} Options:</Txt>
                  {hand ? <Txt size={13}>• Ask for less: take {summariseCounts(hand.take)} and hand back {summariseCounts(hand.handBack)}.</Txt> : null}
                  {part ? <Txt size={13}>• Take {fmt(part.cashCents)} in cash and put the other {fmt(part.restCents)} on card.</Txt> : null}
                  <Txt size={13}>• Or take the full {fmt(billDue)} by card.</Txt>
                  {hand ? <Btn title="Use that smaller handover" kind="secondary" small onPress={() => { setDraft(countsToDraft(hand.take)); setForce(false); }} /> : null}
                  {part ? <Btn title={`Cash ${fmt(part.cashCents)} + the rest another way`} kind="secondary" small onPress={() => setPartX(part.cashCents)} /> : null}
                </View>
              ) : null}
              <Btn title={`Next: give ${fmt(change)} change`} disabled={blocked} onPress={() => setStep('change')} />
              {blocked ? <Btn title="The drawer has it (ledger is out of date)" kind="ghost" onPress={() => { setForce(true); setStep('change'); }} /> : null}
            </>
          ) : null}
          {partX !== null ? <Btn title="Back to the full amount" kind="ghost" onPress={() => { setPartX(null); setForce(false); }} /> : null}
          {billDue > 0 && got === 0 ? <Btn title="Exact amount (don't track notes)" kind="secondary" onPress={() => onTake({ tendered: billDue, received: null, given: null, ...(partX !== null ? { applyCents: partX } : {}) })} /> : null}
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <GiveCash pool={pool} owed={change} detail={`from ${fmt(got)} received for ${fmt(billDue)} due`} onConfirm={finish} />
          <Btn title="Back" kind="ghost" onPress={() => setStep('receive')} />
        </View>
      )}
    </Sheet>
  );
}
