// Location: src/screens/sheets.tsx
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Btn, Chip, Field, Keypad, Money, Row, Segmented, Sheet, Txt, alertMsg, confirm } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../state/store';
import { useCatalogue } from '../state/selectors';
import { digitsToCents, fmt } from '../lib/money';
import * as ops from '../lib/cartOps';
import { saveCartLocal } from '../lib/sync';
import { uid } from '../lib/ids';
import { searchRemote, createCustomer } from '../lib/shopify/customers';
import { lookupGiftCard, newGiftCode, type GiftCardInfo } from '../lib/shopify/giftcards';
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
  const cart = useApp(s => s.pos.cart); const [name, setName] = useState(''); const [note, setNote] = useState('');
  const staff = useApp(s => s.settings.staff.find(x => x.id === s.staffId)?.name);
  const save = () => {
    saveCartLocal({ id: uid(), name: name.trim() || cart.customer?.name || `Cart ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, note: note.trim() || undefined, cart: { ...cart, name: undefined }, ts: new Date().toISOString(), employee: staff });
    setName(''); setNote(''); onClose(); onSaved?.();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Save cart">
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

export function LineEditor({ line, onClose }: { line: CartLine | null; onClose: () => void }) {
  const setCart = useApp(s => s.setCart); const cat = useCatalogue(); const { c } = useTheme();
  const [disc, setDisc] = useState(false); const [price, setPrice] = useState(false); const [digits, setDigits] = useState(''); const [noteDraft, setNoteDraft] = useState<string | null>(null);
  if (!line) return null;
  const v = line.variantId ? cat.variants[line.variantId] : undefined; const siblings = v ? (cat.byProduct[v.productId] ?? []) : [];
  const note = noteDraft ?? line.note ?? '';
  return (
    <>
      <Sheet visible={!disc && !price} onClose={() => { if (noteDraft !== null) setCart(cc => ops.patchLine(cc, line.id, { note: noteDraft.trim() || undefined })); setNoteDraft(null); onClose(); }} title={line.title}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, marginBottom: 12 }}>
          <Btn title="−" kind="secondary" onPress={() => setCart(cc => ops.setQty(cc, line.id, line.qty - 1))} style={{ width: 64 }} />
          <Txt size={30} weight="700">{line.qty}</Txt>
          <Btn title="+" kind="secondary" onPress={() => setCart(cc => ops.setQty(cc, line.id, line.qty + 1))} style={{ width: 64 }} />
        </View>
        {siblings.length > 1 ? <View style={{ marginBottom: 12 }}><Txt size={13} sub weight="600" style={{ marginBottom: 6 }}>Variation</Txt><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {siblings.map(s => <Chip key={s.id} label={s.variantTitle || 'Default'} active={s.id === line.variantId} onPress={() => setCart(cc => ops.swapVariant(cc, line.id, s))} />)}</View></View> : null}
        <Row title="Discount" sub={line.discount?.label ?? (line.noDiscount ? 'Not discountable' : undefined)} icon="pricetag-outline" onPress={line.noDiscount ? undefined : () => setDisc(true)} />
        <Row title="Price adjustment" sub={line.overrideCents !== undefined ? `${fmt(line.overrideCents)} (was ${fmt(line.unitCents)})` : fmt(line.unitCents)} icon="create-outline" onPress={() => { setDigits(''); setPrice(true); }} />
        <Field kind="text" label="Note" value={note} onChangeText={setNoteDraft} placeholder="Add a note to this item" />
        <Btn title="Remove item" kind="danger" icon="trash-outline" onPress={() => { setCart(cc => ops.removeLine(cc, line.id)); onClose(); }} />
        <Btn title="Done" kind="secondary" onPress={() => { if (noteDraft !== null) setCart(cc => ops.patchLine(cc, line.id, { note: noteDraft.trim() || undefined })); setNoteDraft(null); onClose(); }} style={{ marginTop: 8 }} />
      </Sheet>
      <DiscountSheet visible={disc} onClose={() => setDisc(false)} current={line.discount} title="Item discount" onApply={d => setCart(cc => ops.setLineDiscount(cc, line.id, d))} />
      <Sheet visible={price} onClose={() => setPrice(false)} title="Price adjustment">
        <Txt size={13} sub style={{ textAlign: 'center' }}>New unit price for this sale only</Txt>
        <Txt size={40} weight="700" style={{ textAlign: 'center', marginVertical: 10 }}>{fmt(digitsToCents(digits))}</Txt>
        <Keypad value={digits} onChange={setDigits} onSubmit={() => { setCart(cc => ops.patchLine(cc, line.id, { overrideCents: digitsToCents(digits) })); setPrice(false); }} submitLabel="Set price" />
        {line.overrideCents !== undefined ? <Btn title="Reset to catalogue price" kind="ghost" onPress={() => { setCart(cc => ops.patchLine(cc, line.id, { overrideCents: undefined })); setPrice(false); }} style={{ marginTop: 6 }} /> : null}
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
  const look = async (raw: string) => { setBusy(true); try { setCode(raw); setInfo(await lookupGiftCard(raw)); } catch (e: any) { alertMsg('Lookup failed', e.message); } setBusy(false); };
  return (
    <>
      <Sheet visible={visible && !cam} onClose={() => { setInfo(undefined); setCode(''); onClose(); }} title="Check gift card">
        <Field kind="code" label="Code" value={code} onChangeText={t => { setCode(t); setInfo(undefined); }} autoCapitalize="characters" placeholder="Type or scan the code" />
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
