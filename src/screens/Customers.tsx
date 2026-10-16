import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Btn, Empty, Field, IconBtn, Money, Page, Row, Sheet, Txt, alertMsg } from '../ui/kit';
import { Spot } from '../ui/Spot';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { createCustomer, updateCustomer, searchRemote } from '../lib/shopify/customers';
import { isTraining } from '../lib/trainingGuard';
import { SPOT, customersRowSpot } from '../lib/trainingSpots';
import { setCustomersDraftProbe } from '../lib/trainingProbe';
import type { Customer } from '../lib/types';

export default function Customers() {
  const nav = useNav(); const list = useApp(s => s.data.customers); const [q, setQ] = useState(''); const [sel, setSel] = useState<Customer | null>(null); const [form, setForm] = useState<{ id?: string; first: string; last: string; email: string; phone: string; note: string } | null>(null); const [busy, setBusy] = useState(false); const [remote, setRemote] = useState<Customer[]>([]);
  const hits = useMemo(() => { const t = q.trim().toLowerCase(); return (t ? list.filter(c => `${c.name} ${c.email ?? ''} ${c.phone ?? ''}`.toLowerCase().includes(t)) : list).slice(0, 200); }, [q, list]);
  const shown = [...hits, ...remote.filter(r => !hits.some(h => h.id === r.id))];
  useEffect(() => { setCustomersDraftProbe(form ? { first: form.first, last: form.last, email: form.email, phone: form.phone } : undefined); return () => setCustomersDraftProbe(undefined); }, [form]); // training reads what is typed
  const save = async () => {
    if (!form) return; setBusy(true);
    try { const input = { firstName: form.first.trim() || undefined, lastName: form.last.trim() || undefined, email: form.email.trim() || undefined, phone: form.phone.trim() || undefined, note: form.note.trim() || undefined };
      const name = [form.first.trim(), form.last.trim()].filter(Boolean).join(' ') || form.email.trim() || form.phone.trim() || 'Customer';
      // In practice a customer is only ever made or changed on this iPad: nothing goes to Shopify.
      const c: Customer = isTraining()
        ? (form.id
          ? { ...(list.find(x => x.id === form.id) ?? { id: form.id, name, orders: 0, spentCents: 0 }), id: form.id, name, email: form.email.trim() || undefined, phone: form.phone.trim() || undefined, note: form.note.trim() || undefined }
          : { id: `train-cu-new-${Date.now()}`, name, email: form.email.trim() || undefined, phone: form.phone.trim() || undefined, note: form.note.trim() || undefined, orders: 0, spentCents: 0 })
        : form.id ? await updateCustomer(form.id, input) : await createCustomer(input);
      const all = useApp.getState().data.customers; useApp.getState().patchData({ customers: [c, ...all.filter(x => x.id !== c.id)] }); setForm(null); setSel(c); }
    catch (e: any) { alertMsg('Could not save customer', e.message, 'sales/customers'); }
    setBusy(false);
  };
  const startSale = (c: Customer) => { useApp.getState().setCart(cc => ({ ...cc, customer: { id: c.id, name: c.name, email: c.email, phone: c.phone } })); setSel(null); nav.setTab('checkout'); };
  return (
    <Page title="Customers" onBack={nav.pop} helpId="sales/customers" scroll={false} right={<IconBtn icon="person-add-outline" label="New customer" spot={SPOT.customersNew} onPress={() => setForm({ first: '', last: '', email: '', phone: '', note: '' })} />}>
      <View style={{ padding: 12 }}><Spot id={SPOT.customersSearch}><Field kind="search" placeholder="Search name, email or phone" value={q} onChangeText={setQ} onSubmitEditing={async () => { try { setRemote(await searchRemote(q.trim())); } catch {} }} style={{ marginBottom: 0 }} /></Spot></View>
      <FlatList data={shown} keyExtractor={c => c.id} ListEmptyComponent={<Empty icon="people-outline" title="No customers" />} renderItem={({ item: c }) => <Row spot={customersRowSpot(c.id)} title={c.name || c.email || c.phone || 'Customer'} sub={[c.email, c.phone].filter(Boolean).join(' · ') || undefined} onPress={() => setSel(c)} />} />
      <Sheet visible={!!sel && !form} onClose={() => setSel(null)} title={sel?.name || 'Customer'}>
        <Txt sub>{[sel?.email, sel?.phone].filter(Boolean).join(' · ')}</Txt>
        {sel?.orders !== undefined ? <Txt sub>{sel.orders} orders</Txt> : null}{sel?.spentCents !== undefined ? <Money cents={sel.spentCents} /> : null}{sel?.note ? <Txt sub>{sel.note}</Txt> : null}
        <View style={{ gap: 8, marginTop: 14 }}><Btn spot={SPOT.customersStart} title="Start sale" onPress={() => sel && startSale(sel)} /><Btn spot={SPOT.customersEdit} title="Edit" kind="secondary" onPress={() => { if (!sel) return; const [first, ...rest] = (sel.name || '').split(' '); setForm({ id: sel.id, first: first ?? '', last: rest.join(' '), email: sel.email ?? '', phone: sel.phone ?? '', note: sel.note ?? '' }); }} /></View>
      </Sheet>
      <Sheet visible={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit customer' : 'New customer'}>
        {form ? <><Spot id={SPOT.customersForm}><Field kind="name" label="First name" value={form.first} onChangeText={t => setForm({ ...form, first: t })} /><Field kind="name" label="Last name" value={form.last} onChangeText={t => setForm({ ...form, last: t })} /><Field kind="email" label="Email" value={form.email} onChangeText={t => setForm({ ...form, email: t })} /><Field kind="phone" label="Mobile" value={form.phone} onChangeText={t => setForm({ ...form, phone: t })} /><Field kind="text" label="Note" value={form.note} onChangeText={t => setForm({ ...form, note: t })} multiline /></Spot><Btn spot={SPOT.customersSave} title="Save" busy={busy} onPress={() => void save()} /></> : null}
      </Sheet>
    </Page>
  );
}
