import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Btn, Empty, Row, Sheet, Txt, confirm } from '../ui/kit';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { Page } from '../ui/kit';
import { itemCount } from '../lib/cartOps';
import { assignSavedCart, deleteSavedCart, openSavedCart } from '../lib/savedOps';
import { fmt } from '../lib/money';
import { usePriced } from '../state/selectors';

/** Saved carts: Open (merge prompt when the cart isn't empty), Delete (void), Assign to a staff member. Shared across registers. */
export default function SavedCarts() {
  const nav = useNav(); const saved = useApp(s => s.pos.saved).filter(s => s.status === 'open'); const staff = useApp(s => s.settings.staff); const [sel, setSel] = useState<string | null>(null);
  const cur = saved.find(s => s.id === sel); void usePriced;
  const open = async () => { if (cur && await openSavedCart(cur)) { setSel(null); nav.reset(); nav.setTab('checkout'); } };
  return (
    <Page title="Saved carts" onBack={nav.pop}>
      {saved.length === 0 ? <Empty icon="bookmarks-outline" title="No saved carts" sub="Use ⋯ ▸ Save cart on the checkout screen. Saved carts appear on your other registers too." /> :
        saved.map(s => <Row key={s.id} icon="bookmark-outline" title={s.name} sub={`${itemCount(s.cart)} items · ${fmt(s.cart.lines.reduce((t, l) => t + (l.overrideCents ?? l.unitCents) * l.qty, 0))}${s.cart.customer ? ' · ' + s.cart.customer.name : ''}${s.assignedTo ? ' · → ' + (staff.find(x => x.id === s.assignedTo)?.name ?? 'staff') : ''}${s.dirty ? ' · not synced' : ''}${s.note ? '\n' + s.note : ''}`} onPress={() => setSel(s.id)} />)}
      <Sheet visible={!!cur} onClose={() => setSel(null)} title={cur?.name}>
        {cur?.cart.lines.map(l => <Txt key={l.id} sub>{l.qty} × {l.title}</Txt>)}
        <View style={{ gap: 8, marginTop: 14 }}>
          <Btn title="Open" onPress={() => void open()} />
          {staff.length ? <ScrollView horizontal><View style={{ flexDirection: 'row', gap: 8 }}>{staff.map(m => <Btn key={m.id} small kind="secondary" title={`Assign → ${m.name}`} onPress={() => { assignSavedCart(cur!.id, m.id); setSel(null); }} />)}</View></ScrollView> : null}
          <Btn title="Delete" kind="danger" onPress={async () => { if (await confirm('Delete saved cart?', 'This removes it from all registers.', 'Delete', true)) { deleteSavedCart(cur!.id); setSel(null); } }} />
        </View>
      </Sheet>
    </Page>
  );
}
