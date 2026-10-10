// Location: src/screens/CheckChange.tsx
// "Check Change": tap the notes and coins the customer says they have, and see if the drawer can make the change for this cart,
// whether it is worth it, or whether to ask for card. Nothing is recorded and the cart is not changed.
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Btn, Keypad, Money, Sheet, Txt } from '../ui/kit';
import { DenomPad } from '../ui/DenomPad';
import { useTheme } from '../ui/theme';
import { useApp } from '../state/store';
import { usePriced } from '../state/selectors';
import { draftCounts, totalOf, type Draft } from '../lib/cashLedger';
import { cashDue, ledgerEmpty } from '../lib/cashSale';
import { adviceFor, checkChange } from '../lib/checkChange';
import { profileNote } from '../lib/changeScore';
import { useCashProfile } from '../state/cashProfile';
import { paidTotal } from '../lib/saleBuilder';
import { digitsToCents, fmt } from '../lib/money';

export function CheckChangeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { c } = useTheme(); const priced = usePriced(); const cart = useApp(s => s.pos.cart); const rounding = useApp(s => s.settings.cashRounding); const drawer = useApp(s => s.pos.ledger.counts); const profile = useCashProfile();
  const [draft, setDraft] = useState<Draft>([]); const [custom, setCustom] = useState<string | null>(null);
  const remaining = Math.max(0, priced.netCents - paidTotal(cart.tenders ?? []));
  useEffect(() => { if (visible) { setDraft([]); setCustom(remaining > 0 ? null : ''); } }, [visible]);
  const due = custom !== null ? digitsToCents(custom) : cashDue(remaining, remaining, rounding);
  const offered = useMemo(() => draftCounts(draft), [draft]);
  const res = useMemo(() => (due > 0 && totalOf(offered) > 0 ? checkChange(drawer, offered, due, undefined, profile) : null), [drawer, offered, due, profile]);
  const adv = res ? adviceFor(res, fmt) : null; const tone = adv ? (adv.tone === 'good' ? c.good : adv.tone === 'bad' ? c.bad : '#B45309') : c.sub;
  return (
    <Sheet visible={visible} onClose={onClose} title="Check change">
      <View style={{ gap: 14 }}>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Txt sub>{custom !== null ? 'Amount to check' : 'Cart total'}</Txt><Money cents={due} size={32} weight="700" />
          {custom !== null && remaining > 0 ? <Btn title="Use the cart total" kind="ghost" small onPress={() => setCustom(null)} /> : custom === null ? <Btn title="Check a different amount" kind="ghost" small onPress={() => setCustom('')} /> : null}
        </View>
        {custom !== null ? <Keypad value={custom} onChange={setCustom} /> : null}
        {ledgerEmpty(drawer) ? <Txt size={13} color={c.bad} style={{ textAlign: 'center' }}>The drawer ledger is empty, so this can't know what change you have. Open the drawer or correct its contents first.</Txt> : null}
        <Txt size={13} sub weight="600">What the customer says they have</Txt>
        <DenomPad draft={draft} onChange={setDraft} totalLabel="Customer has" />
        {adv ? (
          <View style={{ backgroundColor: tone + '18', borderRadius: 14, padding: 14, gap: 4, borderWidth: 1.5, borderColor: tone }}>
            <Txt weight="700" size={17} color={tone}>{adv.title}</Txt><Txt size={14}>{adv.detail}</Txt>
          </View>
        ) : <Txt size={13} sub style={{ textAlign: 'center' }}>{due > 0 ? 'Tap their notes and coins to see what we can do.' : 'Enter an amount to check.'}</Txt>}
        {profile ? <Txt size={12} sub style={{ textAlign: 'center' }}>{profileNote(profile)}</Txt> : null}
        <Btn title="Close" kind="secondary" onPress={onClose} />
      </View>
    </Sheet>
  );
}
