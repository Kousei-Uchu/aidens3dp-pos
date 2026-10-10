// Location: src/screens/AdjustmentReview.tsx
// A16.5: "Check the price adjustments" – shown by Charge before payment (normal and guided checkout).
import React from 'react';
import { ScrollView, View } from 'react-native';
import { Btn, Card, Sheet, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../state/store';
import { usePriced } from '../state/selectors';
import { fmt } from '../lib/money';
import { adjustmentRows, keepRow, removeRow, signedSaving, unresolvedRows, type AdjustRow } from '../lib/adjustReview';

const KIND_LABEL = { item: 'Item price', line: 'Line price', order: 'Whole order price' } as const;

export default function AdjustmentReviewSheet({ visible, onClose, onContinue, onAdjust }: { visible: boolean; onClose: () => void; onContinue: () => void; onAdjust: (row: AdjustRow) => void }) {
  const { c } = useTheme(); const cart = useApp(s => s.pos.cart); const setCart = useApp(s => s.setCart); const priced = usePriced();
  const rows = adjustmentRows(cart, priced); const todo = unresolvedRows(rows);
  return (
    <Sheet visible={visible} onClose={onClose} title="Check the price adjustments">
      <Txt sub style={{ marginBottom: 10 }}>{rows.length === 0 ? 'There are no price adjustments on this sale.' : todo.length ? 'Some adjustments need a second look. Keep, adjust or remove each flagged one to carry on.' : 'These prices were changed by hand. Check they are what you meant.'}</Txt>
      <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 10 }}>
        {rows.map(r => (
          <Card key={r.id} style={{ padding: 12, gap: 6, ...(r.reasons.length ? { borderColor: c.warn } : {}) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Txt size={12} sub weight="600" style={{ textTransform: 'uppercase' }}>{KIND_LABEL[r.kind]}</Txt>
                <Txt weight="700">{r.title}</Txt>
              </View>
              <Txt weight="700" color={r.cents >= 0 ? c.good : c.bad}>{signedSaving(r.cents)}</Txt>
            </View>
            <Txt size={13} sub>{r.detail}</Txt>
            {r.reason ? <Txt size={13}>Reason: {r.reason}</Txt> : null}
            {r.reasons.map((x, i) => <Txt key={i} size={13} weight="600" color={c.warn}>{x}</Txt>)}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              {r.reasons.length ? <Btn title="Keep" small onPress={() => setCart(cc => keepRow(cc, priced, r))} style={{ flex: 1 }} /> : null}
              <Btn title="Adjust" small kind="secondary" onPress={() => onAdjust(r)} style={{ flex: 1 }} />
              <Btn title="Remove" small kind="danger" onPress={() => setCart(cc => removeRow(cc, r))} style={{ flex: 1 }} />
            </View>
          </Card>
        ))}
      </ScrollView>
      <Txt weight="700" style={{ textAlign: 'center', marginTop: 12 }}>Total {fmt(priced.netCents)}</Txt>
      <View style={{ gap: 8, marginTop: 10 }}>
        <Btn title="Continue to payment" disabled={todo.length > 0} onPress={onContinue} />
        <Btn title="Back to cart" kind="secondary" onPress={onClose} />
      </View>
    </Sheet>
  );
}
