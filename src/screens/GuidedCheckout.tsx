// Location: src/screens/GuidedCheckout.tsx
// Minimal mode's checkout (B5b): one question per screen - Items, Customer, Discount, Check, Pay.
// It reuses the normal cart, pricing, sheets and Pay screen, so nothing about how a sale is recorded changes.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Btn, Card, IconBtn, Money, Row, Sheet, Thumb, Txt, alertMsg, confirm } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { useCatalogue, usePriced } from '../state/selectors';
import * as ops from '../lib/cartOps';
import { fmt } from '../lib/money';
import { invoiceRows, unitLine } from '../lib/invoiceRows';
import { oddBundles } from '../lib/bundles';
import { STEPS, barState, back, canAdvance, next, progress, settle, stepInfo, type FlowCtx, type StepId } from '../lib/guidedFlow';
import Checkout from './Checkout';
import { BundleRow } from './CartPane';
import { CheckChangeSheet } from './CheckChange';
import { CustomAmountSheet, CustomerSheet, DiscountSheet, GiftSellSheet, LineEditor, SaveCartSheet } from './sheets';
import type { CartLine } from '../lib/types';

export default function GuidedCheckout() {
  const { c } = useTheme(); const nav = useNav();
  const cart = useApp(s => s.pos.cart); const setCart = useApp(s => s.setCart); const priced = usePriced(); const cat = useCatalogue();
  const [step, setStep] = useState<StepId>('items');
  const [sheet, setSheet] = useState<'none' | 'customer' | 'discount' | 'more' | 'custom' | 'gift' | 'save' | 'change'>('none');
  const [edit, setEdit] = useState<CartLine | null>(null);
  const locked = !!cart.tenders?.length; const count = ops.itemCount(cart);
  const ctx: FlowCtx = { itemCount: cart.lines.length, payStarted: locked };

  // An empty cart (a new sale, or the sale just finished) starts again at Items; a part-paid sale goes to Pay.
  useEffect(() => { const s = settle(step, ctx); if (s !== step) setStep(s); }); // eslint-disable-line react-hooks/exhaustive-deps

  const info = stepInfo(step); const pr = progress(step); const bar = barState(step); const adv = canAdvance(step, ctx);
  const goNext = () => { if (!adv.ok) { if (adv.why) alertMsg('Not yet', adv.why); return; } setStep(next(step)); };
  const goBack = () => setStep(back(step, ctx));
  const openMore = (s: typeof sheet) => { setSheet('none'); setTimeout(() => setSheet(s), 250); };
  const odd = oddBundles(priced.bundles);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Where we are */}
      <View style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Txt size={13} sub weight="600" style={{ flex: 1 }}>Step {pr.n} of {pr.total}</Txt>
          <Pressable onPress={() => setSheet('more')} accessibilityRole="button" accessibilityLabel="More options" hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="ellipsis-horizontal-circle-outline" size={20} color={c.text} /><Txt size={13} weight="600">More options</Txt></Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="progressbar" accessibilityLabel={`Step ${pr.n} of ${pr.total}: ${info.label}`}>
          {STEPS.map((st, i) => <View key={st.id} style={{ flex: 1, gap: 4 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: bar[i] === 'todo' ? c.line : bar[i] === 'done' ? c.good : c.accent }} />
            <Txt size={11} weight={bar[i] === 'current' ? '700' : '500'} color={bar[i] === 'current' ? c.text : c.sub} numberOfLines={1}>{st.label}</Txt></View>)}
        </View>
        <Txt size={22} weight="700">{info.question}</Txt>
        <Txt size={14} sub>{info.help}</Txt>
      </View>

      {/* The step. The item picker stays mounted (hidden) so the grid keeps its place while you are on other steps. */}
      <View style={{ flex: 1, display: step === 'items' ? 'flex' : 'none' }}><Checkout guided active={step === 'items'} /></View>

      {step === 'customer' ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {cart.customer ? <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="person-circle" size={32} color={c.text} />
            <View style={{ flex: 1 }}><Txt weight="700">{cart.customer.name || 'Customer'}</Txt>{cart.customer.email ? <Txt size={13} sub>{cart.customer.email}</Txt> : null}</View>
            <IconBtn icon="close-circle" label="Remove customer" color={c.sub} onPress={() => setCart(cc => ({ ...cc, customer: undefined }))} /></Card> : null}
          <Btn title={cart.customer ? 'Choose a different customer' : 'Yes, find or add the customer'} kind={cart.customer ? 'secondary' : 'primary'} icon="person-add-outline" onPress={() => setSheet('customer')} />
        </ScrollView>
      ) : null}

      {step === 'discount' ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {priced.deals.length ? <Card style={{ padding: 14, gap: 6 }}>
            <Txt size={13} sub weight="600" style={{ textTransform: 'uppercase' }}>Already applied for you</Txt>
            {priced.deals.map((d, i) => <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Txt color={c.good} style={{ flex: 1 }}>{d.label}</Txt><Money cents={-d.cents} color={c.good} /></View>)}</Card>
            : <Txt sub>No automatic deals apply to this cart.</Txt>}
          {cart.discount ? <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="pricetag" size={22} color={c.good} /><Txt weight="700" style={{ flex: 1 }}>{cart.discount.label}</Txt>
            <IconBtn icon="close-circle" label="Remove discount" color={c.sub} onPress={() => setCart(cc => ops.setCartDiscount(cc, undefined))} /></Card> : null}
          <Btn title={cart.discount ? 'Change the discount' : 'Yes, add a discount'} kind={cart.discount ? 'secondary' : 'primary'} icon="pricetag-outline" onPress={() => setSheet('discount')} />
        </ScrollView>
      ) : null}

      {step === 'review' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
          {locked ? <View style={{ backgroundColor: c.fill, padding: 10 }}><Txt size={13} weight="600" style={{ textAlign: 'center' }}>Part-paid sale. Finish the payment to change it.</Txt></View> : null}
          {priced.lines.map(pl => {
            const l = pl.line; const rows = invoiceRows(pl);
            return (
              <View key={l.id} style={{ backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line, padding: 14, gap: 6 }}>
                <Pressable disabled={locked} onPress={() => setEdit(l)} accessibilityRole="button" accessibilityLabel={`${l.title}, quantity ${l.qty}. Tap to change`} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  {l.kind === 'item' ? <Thumb uri={l.variantId ? cat.variants[l.variantId]?.image : undefined} size={52} /> : null}
                  <View style={{ flex: 1 }}>
                    <Txt weight="700" numberOfLines={2}>{l.title}</Txt>
                    {l.variantTitle ? <Txt size={13} sub>{l.variantTitle}</Txt> : null}
                    <Txt size={13} sub>{unitLine(pl)}</Txt>
                  </View>
                  <Money cents={pl.netCents} weight="700" />
                </Pressable>
                {rows.map((r, i) => <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Txt size={13} color={c.good} weight="600" style={{ flex: 1 }}>{r.label}</Txt><Txt size={13} color={c.good} weight="600">−{fmt(r.cents)}</Txt></View>)}
                {!locked ? <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn title="Change" kind="secondary" small onPress={() => setEdit(l)} style={{ flex: 1 }} />
                  <Btn title="Remove" kind="secondary" small onPress={async () => { if (await confirm('Remove this item?', l.title, 'Remove', true)) setCart(cc => ops.removeLine(cc, l.id)); }} style={{ flex: 1 }} /></View> : null}
              </View>
            );
          })}
          {odd.length ? <View style={{ padding: 14, gap: 8, backgroundColor: c.fill }}>
            <Txt size={14} weight="700">Check these deals with the customer</Txt>
            <Txt size={13} sub>{odd.length === 1 ? 'This deal is' : 'These deals are'} applied, but the items are not a recommended pair. The customer still gets the deal.</Txt>
            {odd.map((b, i) => <BundleRow key={i} b={b} />)}</View> : null}
          {priced.bundles.length > odd.length ? <View style={{ padding: 14, gap: 8, backgroundColor: c.fill }}>
            <Txt size={13} sub weight="600" style={{ textTransform: 'uppercase' }}>Bundle deals</Txt>
            {priced.bundles.filter(b => b.status !== 'other').map((b, i) => <BundleRow key={i} b={b} />)}</View> : null}
          {cart.customer ? <Row icon="person-circle-outline" title={cart.customer.name || 'Customer'} sub="Customer on this sale" /> : null}
          {cart.discount ? <Row icon="pricetag-outline" title={cart.discount.label} sub="Discount on the whole cart" last /> : null}
        </ScrollView>
      ) : null}

      {step === 'pay' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
          <Txt size={15} sub>{count} item{count === 1 ? '' : 's'}{cart.customer ? ` · ${cart.customer.name || 'customer'}` : ''}</Txt>
          <Money cents={priced.netCents} size={54} weight="700" />
          {locked ? <Txt sub style={{ textAlign: 'center' }}>Part of this sale is already paid. Carry on with the rest.</Txt> : null}
        </View>
      ) : null}

      {/* Back / Next, always in the same place */}
      <View style={{ padding: 16, paddingBottom: 16, gap: 10, backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line }}>
        {step === 'items' ? <Txt weight="700" style={{ textAlign: 'center' }}>{count ? `${count} item${count === 1 ? '' : 's'} · ${fmt(priced.netCents)}` : 'Nothing added yet'}</Txt> : null}
        {step !== 'items' && step !== 'pay' ? <Txt weight="700" style={{ textAlign: 'center' }}>Total {fmt(priced.netCents)}</Txt> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {step !== 'items' && !(locked && step === 'pay') ? <Btn title="Back" kind="secondary" icon="chevron-back" onPress={goBack} style={{ flex: 1 }} /> : null}
          {step === 'pay'
            ? <Btn title={`Take payment  ${fmt(priced.netCents)}`} icon="card-outline" onPress={() => nav.push('pay')} style={{ flex: 2 }} />
            : <Btn title={step === 'review' ? 'Looks right' : step === 'customer' && !cart.customer ? 'No, carry on' : step === 'discount' && !cart.discount ? 'No, carry on' : 'Next'} disabled={!adv.ok} onPress={goNext} style={{ flex: 2 }} />}
        </View>
      </View>

      {/* The same sheets the normal checkout uses */}
      <CustomerSheet visible={sheet === 'customer'} onClose={() => setSheet('none')} onPick={cu => { setCart(cc => ({ ...cc, customer: { id: cu.id, name: cu.name, email: cu.email, phone: cu.phone } })); setSheet('none'); }} />
      <DiscountSheet visible={sheet === 'discount'} onClose={() => setSheet('none')} current={cart.discount} title="Cart discount" onApply={d => setCart(cc => ops.setCartDiscount(cc, d))} />
      <LineEditor line={edit ? cart.lines.find(l => l.id === edit.id) ?? null : null} onClose={() => setEdit(null)} />
      <CustomAmountSheet visible={sheet === 'custom'} onClose={() => setSheet('none')} />
      <GiftSellSheet visible={sheet === 'gift'} onClose={() => setSheet('none')} />
      <SaveCartSheet visible={sheet === 'save'} onClose={() => setSheet('none')} onSaved={() => setCart(ops.emptyCart())} />
      <CheckChangeSheet visible={sheet === 'change'} onClose={() => setSheet('none')} />

      {/* Everything the full checkout can do is still here */}
      <Sheet visible={sheet === 'more'} onClose={() => setSheet('none')} title="More options">
        <Row icon="calculator-outline" title="Add a custom amount" sub="For something that is not in the item list." onPress={() => openMore('custom')} />
        <Row icon="gift-outline" title="Sell a gift card" onPress={() => openMore('gift')} />
        <Row icon="cash-outline" title="Check change" sub="Can we make change for this sale?" onPress={() => openMore('change')} />
        <Row icon="bookmark-outline" title="Save this cart for later" onPress={() => (!cart.lines.length || locked ? alertMsg(locked ? 'Payment in progress' : 'Cart is empty') : openMore('save'))} />
        <Row icon="bookmarks-outline" title="Open a saved cart" onPress={() => { setSheet('none'); setTimeout(() => nav.push('saved'), 250); }} />
        <Row icon="trash-outline" title="Start again" sub="Clear the cart and go back to step 1." danger last onPress={async () => { setSheet('none'); if (locked) return alertMsg('Payment in progress', 'Cancel the payment first.'); if (!cart.lines.length || await confirm('Start again?', 'All items will be removed.', 'Clear', true)) { setCart(ops.emptyCart()); setStep('items'); } }} />
      </Sheet>
    </View>
  );
}
