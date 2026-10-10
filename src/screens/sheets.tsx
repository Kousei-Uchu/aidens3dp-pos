// Location: src/screens/sheets.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Btn, Chip, Field, Keypad, Money, Row, Segmented, Sheet, Txt, alertMsg, confirm } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../state/store';
import { useCatalogue, usePriced, usePricer } from '../state/selectors';
import { digitsToCents, fmt } from '../lib/money';
import * as ops from '../lib/cartOps';
import { hasItemPrice, itemReviewReasons } from '../lib/itemAdjust';
import { keepOrderAdjust, makeOrderAdjust, orderAdjustProblem, orderReviewReasons, stripAdjustments } from '../lib/orderAdjust';
import { adjustProblem, beforeAdjustCents, canAdjustLine, keepAdjust, makeAdjust, reviewReasons } from '../lib/lineAdjust';
import { saveCartLocal } from '../lib/sync';
import { uid } from '../lib/ids';
import { searchRemote, createCustomer } from '../lib/shopify/customers';
import { lookupGiftCard, newGiftCode, type GiftCardInfo } from '../lib/shopify/giftcards';
import { stripGiftPrefix } from '../lib/giftCode';
import { CameraScanner } from './Scanner';
import type { CartLine, Customer, ManualDiscount } from '../lib/types';

/** Manual discount: Shopify discount-code presets as tappable chips + custom % / $ keypad. */
export function DiscountSheet({ visible, onClose, onApply, current, title = 'Discount' }: { visible: boolean; onClose: () => void; onApply: (d?: ManualDiscount) => void; current?: ManualDiscount; title?: string }) {
  const presets = useApp(s => s.data.presets); const [mode, setMode] = useState<'pct' | 'amt'>('pct'); const [digits, setDigits] = useState('');
  const apply = () => {
    if (mode === 'pct') { const p = Math.min(100, Number(digits) || 0); if (p > 0) { onApply({ kind: 'pct', value: p, label: `${p}% off` }); setDigits(''); onClose(); } }
    else { const cents = digitsToCents(digits); if (cents > 0) { onApply({ kind: 'amt', value: cents, label: `${fmt(cents)} off` }); setDigits(''); onClose(); } }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {presets.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>{presets.map(p => <Chip key={p.id} label={p.label} onPress={() => { onApply({ kind: p.kind, value: p.value, label: p.label }); onClose(); }} />)}</View> : null}
      <Segmented value={mode} onChange={m => { setMode(m); setDigits(''); }} options={[{ v: 'pct', label: '% percent' }, { v: 'amt', label: '$ amount' }]} />
      <Txt size={34} weight="700" style={{ textAlign: 'center', marginVertical: 14 }}>{mode === 'pct' ? `${digits || 0}%` : fmt(digitsToCents(digits))}</Txt>
      <Keypad value={digits} onChange={setDigits} decimal={mode === 'amt'} onSubmit={apply} submitLabel="Apply discount" />
      {current ? <Btn title={`Remove “${current.label}”`} kind="ghost" onPress={() => { onApply(undefined); onClose(); }} style={{ marginTop: 8 }} /> : null}
    </Sheet>
  );
}

export function CustomAmountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [digits, setDigits] = useState(''); const [note, setNote] = useState(''); const setCart = useApp(s => s.setCart);
  const add = () => { setCart(c => ops.addCustom(c, digitsToCents(digits), 'Custom amount', note.trim() || undefined)); setDigits(''); setNote(''); onClose(); };
  return (
    <Sheet visible={visible} onClose={onClose} title="Custom amount">
      <Txt size={40} weight="700" style={{ textAlign: 'center', marginBottom: 10 }}>{fmt(digitsToCents(digits))}</Txt>
      <Field kind="text" placeholder="Note (optional)" value={note} onChangeText={setNote} />
      <Keypad value={digits} onChange={setDigits} onSubmit={add} submitLabel="Add to cart" />
    </Sheet>
  );
}

export function SaveCartSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved?: () => void }) {
  const { c } = useTheme(); const cart = useApp(s => s.pos.cart); const [name, setName] = useState(''); const [note, setNote] = useState('');
  const staff = useApp(s => s.settings.staff.find(x => x.id === s.staffId)?.name);
  const save = () => {
    saveCartLocal({ id: uid(), name: name.trim() || cart.customer?.name || `Cart ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, note: note.trim() || undefined, cart: { ...cart, name: undefined, orderAdjust: undefined }, ts: new Date().toISOString(), employee: staff });
    setName(''); setNote(''); onClose(); onSaved?.();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Save cart">
      {cart.orderAdjust ? <Txt size={13} color={c.warn} style={{ marginBottom: 8 }}>This cart's whole order price ({fmt(cart.orderAdjust.finalCents)}) is not kept in a saved cart. It will come back at its normal total.</Txt> : null}
      <Field kind="name" label="Name" placeholder={cart.customer?.name ?? 'e.g. Sam – holding for Friday'} value={name} onChangeText={setName} autoFocus />
      <Field kind="text" label="Notes" placeholder="Optional" value={note} onChangeText={setNote} multiline />
      <Btn title="Save to Saved carts" onPress={save} />
    </Sheet>
  );
}

export function CustomerSheet({ visible, onClose, onPick, allowCreate = true, startCreating = false }: { visible: boolean; onClose: () => void; onPick: (c: Customer) => void; allowCreate?: boolean; startCreating?: boolean }) {
  const local = useApp(s => s.data.customers); const [q, setQ] = useState(''); const [remote, setRemote] = useState<Customer[]>([]); const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ first: '', last: '', email: '', phone: '' }); const [busy, setBusy] = useState(false);
  React.useEffect(() => { if (visible) setCreating(startCreating); }, [visible, startCreating]);
  const hits = useMemo(() => { const t = q.trim().toLowerCase(); if (!t) return local.slice(0, 30); return local.filter(c => `${c.name} ${c.email ?? ''} ${c.phone ?? ''}`.toLowerCase().includes(t)).slice(0, 40); }, [q, local]);
  const search = async () => { if (!q.trim()) return; setBusy(true); try { setRemote(await searchRemote(q.trim())); } catch (e: any) { alertMsg('Search failed', e.message); } setBusy(false); };
  const shown = [...hits, ...remote.filter(r => !hits.some(h => h.id === r.id))];
  const create = async () => {
    if (!f.first.trim() && !f.last.trim() && !f.email.trim() && !f.phone.trim()) return alertMsg('Add at least a name, email or phone');
    setBusy(true);
    try {
      const c = await createCustomer({ firstName: f.first.trim() || undefined, lastName: f.last.trim() || undefined, email: f.email.trim() || undefined, phone: f.phone.trim() || undefined });
      useApp.getState().patchData({ customers: [c, ...useApp.getState().data.customers] }); setCreating(false); setF({ first: '', last: '', email: '', phone: '' }); onPick(c); onClose();
    } catch (e: any) { alertMsg('Could not create customer', e.message); } setBusy(false);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={creating ? 'New customer' : 'Customer'} full>
      {creating ? (
        <View>
          <Field kind="name" label="First name" value={f.first} onChangeText={v => setF({ ...f, first: v })} /><Field kind="name" label="Last name" value={f.last} onChangeText={v => setF({ ...f, last: v })} />
          <Field kind="email" label="Email" value={f.email} onChangeText={v => setF({ ...f, email: v })} />
          <Field kind="phone" label="Mobile" value={f.phone} onChangeText={v => setF({ ...f, phone: v })} />
          <Btn title="Create & attach" onPress={create} busy={busy} /><Btn title="Back" kind="ghost" onPress={() => setCreating(false)} />
        </View>
      ) : (
        <View>
          <Field kind="search" placeholder="Search name, email or phone" value={q} onChangeText={setQ} onSubmitEditing={search} />
          {shown.map(cu => <Row key={cu.id} title={cu.name || cu.email || cu.phone || 'Customer'} sub={[cu.email, cu.phone].filter(Boolean).join(' · ')} onPress={() => { onPick(cu); onClose(); }} />)}
          {q.trim() && !busy ? <Btn title="Search Shopify" kind="secondary" small onPress={search} style={{ marginTop: 8 }} /> : null}
          {allowCreate ? <Btn title="Create customer" icon="person-add-outline" kind="secondary" onPress={() => setCreating(true)} style={{ marginTop: 12 }} /> : null}
        </View>
      )}
    </Sheet>
  );
}

/** A16.4: set what the whole order costs. Also the review sheet (Keep / Adjust / Remove) when the cart changed under an existing order price. */
export function OrderAdjustSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { c } = useTheme(); const cart = useApp(s => s.pos.cart); const setCart = useApp(s => s.setCart); const priced = usePriced(); const price = usePricer();
  const [digits, setDigits] = useState(''); const [reason, setReason] = useState('');
  useEffect(() => { if (visible) setReason(cart.orderAdjust?.reason ?? ''); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = useMemo(() => price(stripAdjustments(cart)), [cart, price]);
  const reasons = orderReviewReasons(cart, priced); const cents = digitsToCents(digits);
  const problem = digits ? orderAdjustProblem(cents, base) : null; const lineCount = cart.lines.filter(l => l.adjust).length;
  const close = () => { setDigits(''); onClose(); };
  const set = async () => {
    const p = orderAdjustProblem(cents, base); if (p) return alertMsg('Cannot use that total', p);
    // A16.7: a whole-order price and line prices are never both active.
    if (lineCount && !(await confirm('Remove the line prices?', `A whole order price and line prices can't both be used. Setting the order total removes the ${lineCount} line price adjustment${lineCount === 1 ? '' : 's'} on this order.`, 'Replace', true))) return;
    setCart(cc => ops.setOrderAdjust(ops.clearLineAdjusts(cc), makeOrderAdjust(cents, cc, base, reason))); close();
  };
  return (
    <Sheet visible={visible} onClose={close} title="Whole order price">
      {reasons.length && cart.orderAdjust ? (
        <View style={{ borderWidth: 1, borderColor: c.warn, borderRadius: 12, padding: 12, gap: 6, marginBottom: 10 }}>
          <Txt weight="700" color={c.warn}>Check the order price</Txt>
          {reasons.map((r, i) => <Txt key={i} size={13}>{r}</Txt>)}
          <Txt size={13} sub>The order still costs {fmt(priced.netCents)}. Keep it, set a new total, or take the adjustment off.</Txt>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Btn title="Keep" small onPress={() => { setCart(cc => ops.setOrderAdjust(cc, keepOrderAdjust(cc.orderAdjust!, cc, priced))); close(); }} style={{ flex: 1 }} />
            <Btn title="Remove" small kind="danger" onPress={() => { setCart(cc => ops.setOrderAdjust(cc, undefined)); close(); }} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}
      <Txt size={13} sub style={{ textAlign: 'center' }}>What should the whole order cost? It costs {fmt(base.netCents)} now, after deals and discounts. The difference is shared over the items (gift cards are never reduced).</Txt>
      <Txt size={40} weight="700" style={{ textAlign: 'center', marginVertical: 10 }}>{fmt(cents)}</Txt>
      {problem ? <Txt size={13} color={c.bad} style={{ textAlign: 'center', marginBottom: 6 }}>{problem}</Txt> : null}
      <Field kind="text" label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="e.g. Damaged box, price match" />
      <Keypad value={digits} onChange={setDigits} onSubmit={set} submitLabel="Set order total" />
      {cart.orderAdjust ? <Btn title="Remove adjustment" kind="ghost" onPress={() => { setCart(cc => ops.setOrderAdjust(cc, undefined)); close(); }} style={{ marginTop: 6 }} /> : null}
    </Sheet>
  );
}

export function LineEditor({ line, onClose }: { line: CartLine | null; onClose: () => void }) {
  const setCart = useApp(s => s.setCart); const cat = useCatalogue(); const { c } = useTheme();
  const [disc, setDisc] = useState(false); const [price, setPrice] = useState(false); const [digits, setDigits] = useState(''); const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [adj, setAdj] = useState(false); const [adjDigits, setAdjDigits] = useState(''); const [adjReason, setAdjReason] = useState(''); const [itemReason, setItemReason] = useState(''); const priced = usePriced(); const orderAdj = useApp(s => s.pos.cart.orderAdjust);
  const [scope, setScope] = useState<'qty' | 'all'>('qty'); const [scopeQty, setScopeQty] = useState(1);
  if (!line) return null;
  const pl = priced.lines.find(x => x.line.id === line.id); const reasons = pl ? reviewReasons(pl) : []; const itemReasons = pl ? itemReviewReasons(pl) : [];
  const canAll = line.kind === 'item' && !!line.variantId;
  const openPrice = () => { setDigits(''); setItemReason(line.overrideReason ?? ''); setScope(line.overrideAll && canAll ? 'all' : 'qty'); setScopeQty(Math.max(1, Math.min(line.qty, line.overrideSeenQty ?? line.qty))); setPrice(true); };
  const setItemPrice = () => { const how = scope === 'all' && canAll ? { scope: 'all' as const } : { scope: 'qty' as const, qty: scopeQty }; const split = how.scope === 'qty' && how.qty < line.qty; setCart(cc => ops.setItemPrice(cc, line.id, digitsToCents(digits), how, itemReason)); setPrice(false); if (split) onClose(); };
  const adjProblem = pl && adjDigits ? adjustProblem(digitsToCents(adjDigits), pl) : null;
  const setAdjustment = async () => {
    if (!pl) return; const cents = digitsToCents(adjDigits); const p = adjustProblem(cents, pl); if (p) return alertMsg('Cannot use that price', p);
    // A16.7: a whole-order price and line prices are never both active.
    if (orderAdj && !(await confirm('Remove the whole order price?', `This order has its total set to ${fmt(orderAdj.finalCents)}. A whole order price and line prices can't both be used, so setting this line's price removes the order price.`, 'Replace', true))) return;
    setCart(cc => ops.setLineAdjust(ops.setOrderAdjust(cc, undefined), line.id, makeAdjust(cents, pl, adjReason))); setAdj(false);
  };
  const v = line.variantId ? cat.variants[line.variantId] : undefined; const siblings = v ? (cat.byProduct[v.productId] ?? []) : [];
  const note = noteDraft ?? line.note ?? '';
  return (
    <>
      <Sheet visible={!disc && !price && !adj} onClose={() => { if (noteDraft !== null) setCart(cc => ops.patchLine(cc, line.id, { note: noteDraft.trim() || undefined })); setNoteDraft(null); onClose(); }} title={line.title}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, marginBottom: 12 }}>
          <Btn title="−" kind="secondary" onPress={() => setCart(cc => ops.setQty(cc, line.id, line.qty - 1))} style={{ width: 64 }} />
          <Txt size={30} weight="700">{line.qty}</Txt>
          <Btn title="+" kind="secondary" onPress={() => setCart(cc => ops.setQty(cc, line.id, line.qty + 1))} style={{ width: 64 }} />
        </View>
        {siblings.length > 1 ? <View style={{ marginBottom: 12 }}><Txt size={13} sub weight="600" style={{ marginBottom: 6 }}>Variation</Txt><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {siblings.map(s => <Chip key={s.id} label={s.variantTitle || 'Default'} active={s.id === line.variantId} onPress={() => setCart(cc => ops.swapVariant(cc, line.id, s))} />)}</View></View> : null}
        <Row title="Discount" sub={line.discount?.label ?? (line.noDiscount ? 'Not discountable' : undefined)} icon="pricetag-outline" onPress={line.noDiscount ? undefined : () => setDisc(true)} />
        <Row title="Item price adjustment" icon="create-outline"
          sub={line.kind === 'gift_card' ? 'Not available for gift cards' : hasItemPrice(line) ? `${fmt(line.overrideCents!)} (was ${fmt(line.unitCents)}) · ${line.overrideAll ? 'all in cart' : line.overrideSeenQty !== undefined ? `for ${line.overrideSeenQty} unit${line.overrideSeenQty === 1 ? '' : 's'}` : 'this line'}` : fmt(line.unitCents)}
          onPress={line.kind === 'gift_card' ? undefined : openPrice} />
        {itemReasons.length ? (
          <View style={{ borderWidth: 1, borderColor: c.warn, borderRadius: 12, padding: 12, gap: 6, marginVertical: 8 }}>
            <Txt weight="700" color={c.warn}>Check this item's adjusted price</Txt>
            {itemReasons.map((r, i) => <Txt key={i} size={13}>{r}</Txt>)}
            <Txt size={13} sub>The adjusted price of {fmt(line.overrideCents ?? 0)} now applies to all {line.qty}. Keep it, change it, or take it off.</Txt>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <Btn title="Keep" small onPress={() => setCart(cc => ops.keepItemPrice(cc, line.id))} style={{ flex: 1 }} />
              <Btn title="Adjust" small kind="secondary" onPress={openPrice} style={{ flex: 1 }} />
              <Btn title="Remove" small kind="danger" onPress={() => setCart(cc => ops.clearItemPrice(cc, line.id))} style={{ flex: 1 }} />
            </View>
          </View>
        ) : null}
        <Row title="Line price adjustment" icon="cut-outline" sub={line.adjust ? `${fmt(line.adjust.finalCents)} for the whole line` : canAdjustLine(line) ? 'Set what the whole line costs' : 'Not available for gift cards'}
          onPress={canAdjustLine(line) ? () => { setAdjDigits(''); setAdjReason(line.adjust?.reason ?? ''); setAdj(true); } : undefined} />
        {reasons.length ? (
          <View style={{ borderWidth: 1, borderColor: c.warn, borderRadius: 12, padding: 12, gap: 6, marginVertical: 8 }}>
            <Txt weight="700" color={c.warn}>Check this line's price adjustment</Txt>
            {reasons.map((r, i) => <Txt key={i} size={13}>{r}</Txt>)}
            <Txt size={13} sub>The line still costs {fmt(pl?.netCents ?? 0)}. Keep it, change it, or take the adjustment off.</Txt>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <Btn title="Keep" small onPress={() => pl && line.adjust && setCart(cc => ops.setLineAdjust(cc, line.id, keepAdjust(line.adjust!, pl)))} style={{ flex: 1 }} />
              <Btn title="Adjust" small kind="secondary" onPress={() => { setAdjDigits(''); setAdjReason(line.adjust?.reason ?? ''); setAdj(true); }} style={{ flex: 1 }} />
              <Btn title="Remove" small kind="danger" onPress={() => setCart(cc => ops.setLineAdjust(cc, line.id, undefined))} style={{ flex: 1 }} />
            </View>
          </View>
        ) : null}
        <Field kind="text" label="Note" value={note} onChangeText={setNoteDraft} placeholder="Add a note to this item" />
        <Btn title="Remove item" kind="danger" icon="trash-outline" onPress={() => { setCart(cc => ops.removeLine(cc, line.id)); onClose(); }} />
        <Btn title="Done" kind="secondary" onPress={() => { if (noteDraft !== null) setCart(cc => ops.patchLine(cc, line.id, { note: noteDraft.trim() || undefined })); setNoteDraft(null); onClose(); }} style={{ marginTop: 8 }} />
      </Sheet>
      <DiscountSheet visible={disc} onClose={() => setDisc(false)} current={line.discount} title="Item discount" onApply={d => setCart(cc => ops.setLineDiscount(cc, line.id, d))} />
      <Sheet visible={price} onClose={() => setPrice(false)} title="Item price adjustment">
        <Txt size={13} sub style={{ textAlign: 'center' }}>New unit price for this sale only</Txt>
        <Txt size={40} weight="700" style={{ textAlign: 'center', marginVertical: 10 }}>{fmt(digitsToCents(digits))}</Txt>
        {canAll ? <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
          <Chip label="Fixed quantity" active={scope === 'qty'} onPress={() => setScope('qty')} />
          <Chip label="All in cart" active={scope === 'all'} onPress={() => setScope('all')} />
        </View> : null}
        {scope === 'qty' || !canAll ? <>
          {line.qty > 1 ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 4 }}>
            <Btn title="−" small kind="secondary" onPress={() => setScopeQty(q => Math.max(1, q - 1))} style={{ width: 52 }} />
            <Txt weight="700">{scopeQty} of {line.qty}</Txt>
            <Btn title="+" small kind="secondary" onPress={() => setScopeQty(q => Math.min(line.qty, q + 1))} style={{ width: 52 }} />
          </View> : null}
          <Txt size={12} sub style={{ textAlign: 'center', marginBottom: 6 }}>{scopeQty >= line.qty ? `Applies to the ${line.qty} on this line.` : `Applies to ${scopeQty} of the ${line.qty}. They become their own line; the rest stay at the normal price.`}</Txt>
        </> : <Txt size={12} sub style={{ textAlign: 'center', marginBottom: 6 }}>Applies to every {line.title} in this order, including any you add later.</Txt>}
        <Field kind="text" label="Reason (optional)" value={itemReason} onChangeText={setItemReason} placeholder="e.g. Damaged box, price match" />
        <Keypad value={digits} onChange={setDigits} onSubmit={setItemPrice} submitLabel="Set price" />
        {hasItemPrice(line) ? <Btn title={line.overrideAll ? 'Reset to catalogue price (all in cart)' : 'Reset to catalogue price'} kind="ghost" onPress={() => { setCart(cc => ops.clearItemPrice(cc, line.id)); setPrice(false); }} style={{ marginTop: 6 }} /> : null}
      </Sheet>
      <Sheet visible={adj} onClose={() => setAdj(false)} title="Line price adjustment">
        <Txt size={13} sub style={{ textAlign: 'center' }}>What should the whole line cost?{pl ? ` It costs ${fmt(beforeAdjustCents(pl))} now, after deals and discounts.` : ''}</Txt>
        <Txt size={40} weight="700" style={{ textAlign: 'center', marginVertical: 10 }}>{fmt(digitsToCents(adjDigits))}</Txt>
        {adjProblem ? <Txt size={13} color={c.bad} style={{ textAlign: 'center', marginBottom: 6 }}>{adjProblem}</Txt> : null}
        <Field kind="text" label="Reason (optional)" value={adjReason} onChangeText={setAdjReason} placeholder="e.g. Damaged box, price match" />
        <Keypad value={adjDigits} onChange={setAdjDigits} onSubmit={setAdjustment} submitLabel="Set line price" />
        {line.adjust ? <Btn title="Remove adjustment" kind="ghost" onPress={() => { setCart(cc => ops.setLineAdjust(cc, line.id, undefined)); setAdj(false); }} style={{ marginTop: 6 }} /> : null}
      </Sheet>
      <View style={{ height: 0, backgroundColor: c.bg }} />
    </>
  );
}

const GIFT_PRESETS = [2500, 5000, 10000];
export function GiftSellSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const setCart = useApp(s => s.setCart); const buyer = useApp(s => s.pos.cart.customer);
  const [digits, setDigits] = useState(''); const [cents, setCents] = useState(0); const [how, setHow] = useState<'hand' | 'email'>('hand');
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [msg, setMsg] = useState('');
  const reset = () => { setDigits(''); setCents(0); setHow('hand'); setEmail(''); setName(''); setMsg(''); };
  const close = () => { reset(); onClose(); };
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const confirmAdd = () => {
    if (how === 'email' && !validEmail) return alertMsg('Check the email address', 'Enter a valid email to send the gift card to.');
    const rec = how === 'email' ? { email: email.trim(), name: name.trim() || undefined, message: msg.trim() || undefined } : undefined;
    setCart(cc => ops.addGiftCardLine(cc, cents, newGiftCode(), rec)); close();
  };
  if (cents > 0) return (
    <Sheet visible={visible} onClose={close} title={`Gift card ${fmt(cents)}`}>
      <Txt sub style={{ marginBottom: 8 }}>How should the customer get it?</Txt>
      <Segmented value={how} onChange={setHow} options={[{ v: 'hand', label: 'Hand over / print' }, { v: 'email', label: 'Email it' }]} />
      {how === 'email' ? <View style={{ marginTop: 12 }}>
        {buyer?.email && email !== buyer.email ? <Chip label={`Use ${buyer.email}`} onPress={() => { setEmail(buyer.email!); if (!name) setName(buyer.name ?? ''); }} /> : null}
        <Field kind="email" label="Recipient email" value={email} onChangeText={setEmail} placeholder="name@example.com" />
        <Field kind="name" label="Recipient name (optional)" value={name} onChangeText={setName} />
        <Field kind="text" label="Message (optional)" value={msg} onChangeText={setMsg} placeholder="Happy birthday!" />
        <Txt size={12} sub>Shopify emails the card after payment completes. Add to Apple Wallet appears in that email if enabled in Shopify settings.</Txt>
      </View> : <Txt size={13} sub style={{ marginTop: 10 }}>The code is shown on the receipt screen after payment.</Txt>}
      <Btn title="Add gift card to cart" onPress={confirmAdd} style={{ marginTop: 14 }} />
      <Btn title="Change amount" kind="ghost" onPress={() => setCents(0)} />
    </Sheet>
  );
  return (
    <Sheet visible={visible} onClose={close} title="Sell gift card">
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>{GIFT_PRESETS.map(p => <Chip key={p} label={fmt(p)} onPress={() => setCents(p)} />)}</View>
      <Txt size={36} weight="700" style={{ textAlign: 'center', marginBottom: 10 }}>{fmt(digitsToCents(digits))}</Txt>
      <Keypad value={digits} onChange={setDigits} onSubmit={() => { const c = digitsToCents(digits); if (c > 0) setCents(c); }} submitLabel="Next" />
    </Sheet>
  );
}

/** Check balance by scanning a QR/barcode or typing the code. */
export function GiftCheckSheet({ visible, onClose, onUse }: { visible: boolean; onClose: () => void; onUse?: (g: GiftCardInfo, code: string) => void }) {
  const [code, setCode] = useState(''); const [info, setInfo] = useState<GiftCardInfo | null | undefined>(undefined); const [busy, setBusy] = useState(false); const [cam, setCam] = useState(false);
  const look = async (raw: string) => { setBusy(true); try { const clean = stripGiftPrefix(raw); setCode(clean); setInfo(await lookupGiftCard(clean)); } catch (e: any) { alertMsg('Lookup failed', e.message); } setBusy(false); };
  return (
    <>
      <Sheet visible={visible && !cam} onClose={() => { setInfo(undefined); setCode(''); onClose(); }} title="Check gift card">
        <Field kind="code" label="Code" value={code} onChangeText={t => { setCode(stripGiftPrefix(t)); setInfo(undefined); }} autoCapitalize="characters" placeholder="Type or scan the code" />
        <View style={{ flexDirection: 'row', gap: 8 }}><Btn title="Scan" icon="qr-code-outline" kind="secondary" onPress={() => setCam(true)} style={{ flex: 1 }} /><Btn title="Check" onPress={() => void look(code)} busy={busy} disabled={code.trim().length < 4} style={{ flex: 1 }} /></View>
        {info === null ? <Txt color="#DC2626" style={{ marginTop: 14 }}>No gift card found for that code.</Txt> : null}
        {info ? <View style={{ marginTop: 16, gap: 4 }}><Txt sub>Card ••••{info.last4}</Txt><Money cents={info.balanceCents} size={34} weight="700" /><Txt sub size={13}>{info.enabled ? 'Active' : 'Disabled'}{info.verified ? '' : ' · code could not be verified'}{info.expiresOn ? ` · expires ${info.expiresOn}` : ''}</Txt>
          {onUse && info.enabled && info.balanceCents > 0 ? <Btn title="Use as payment" onPress={() => { onUse(info, code); setInfo(undefined); setCode(''); }} style={{ marginTop: 10 }} /> : null}</View> : null}
      </Sheet>
      <CameraScanner visible={cam} onClose={() => setCam(false)} title="Scan gift card" onScan={c => { setCam(false); void look(c); return 'Scanned'; }} />
    </>
  );
}
export const confirmClear = () => confirm('Clear cart?', 'All items will be removed.', 'Clear', true);
