import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Btn, Empty, Field, IconBtn, Money, Page, Row, Sheet, Txt, alertMsg } from '../ui/kit';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { createCustomer, updateCustomer, searchRemote } from '../lib/shopify/customers';
import type { Customer } from '../lib/types';

export default function Customers() {
  const nav = useNav(); const list = useApp(s => s.data.customers); const [q, setQ] = useState(''); const [sel, setSel] = useState<Customer | null>(null); const [form, setForm] = useState<{ id?: string; first: string; last: string; email: string; phone: string; note: string } | null>(null); const [busy, setBusy] = useState(false); const [remote, setRemote] = useState<Customer[]>([]);
  const hits = useMemo(() => { const t = q.trim().toLowerCase(); return (t ? list.filter(c => `${c.name} ${c.email ?? ''} ${c.phone ?? ''}`.toLowerCase().includes(t)) : list).slice(0, 200); }, [q, list]);
  const shown = [...hits, ...remote.filter(r => !hits.some(h => h.id === r.id))];
  const save = async () => {
    if (!form) return; setBusy(true);
    try { const input = { firstName: form.first.trim() || undefined, lastName: form.last.trim() || undefined, email: form.email.trim() || undefined, phone: form.phone.trim() || undefined, note: form.note.trim() || undefined };
      const c = form.id ? await updateCustomer(form.id, input) : await createCustomer(input); const all = useApp.getState().data.customers; useApp.getState().patchData({ customers: [c, ...all.filter(x => x.id !== c.id)] }); setForm(null); setSel(c); }
    catch (e: any) { alertMsg('Could not save customer', e.message); }
    setBusy(false);
  };
  const startSale = (c: Customer) => { useApp.getState().setCart(cc => ({ ...cc, customer: { id: c.id, name: c.name, email: c.email, phone: c.phone } })); setSel(null); nav.setTab('checkout'); };
  return (
    <Page title="Customers" onBack={nav.pop} scroll={false} right={<IconBtn icon="person-add-outline" label="New customer" onPress={() => setForm({ first: '', last: '', email: '', phone: '', note: '' })} />}>
      <View style={{ padding: 12 }}><Field placeholder="Search name, email or phone" value={q} onChangeText={setQ} onSubmitEditing={async () => { try { setRemote(await searchRemote(q.trim())); } catch {} }} autoCapitalize="none" style={{ marginBottom: 0 }} /></View>
      <FlatList data={shown} keyExtractor={c => c.id} ListEmptyComponent={<Empty icon="people-outline" title="No customers" />} renderItem={({ item: c }) => <Row title={c.name || c.email || c.phone || 'Customer'} sub={[c.email, c.phone].filter(Boolean).join(' · ') || undefined} onPress={() => setSel(c)} />} />
      <Sheet visible={!!sel && !form} onClose={() => setSel(null)} title={sel?.name || 'Customer'}>
        <Txt sub>{[sel?.email, sel?.phone].filter(Boolean).join(' · ')}</Txt>
        {sel?.orders !== undefined ? <Txt sub>{sel.orders} orders</Txt> : null}{sel?.spentCents !== undefined ? <Money cents={sel.spentCents} /> : null}{sel?.note ? <Txt sub>{sel.note}</Txt> : null}
        <View style={{ gap: 8, marginTop: 14 }}><Btn title="Start sale" onPress={() => sel && startSale(sel)} /><Btn title="Edit" kind="secondary" onPress={() => { if (!sel) return; const [first, ...rest] = (sel.name || '').split(' '); setForm({ id: sel.id, first: first ?? '', last: rest.join(' '), email: sel.email ?? '', phone: sel.phone ?? '', note: sel.note ?? '' }); }} /></View>
      </Sheet>
      <Sheet visible={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit customer' : 'New customer'}>
        {form ? <><Field label="First name" value={form.first} onChangeText={t => setForm({ ...form, first: t })} /><Field label="Last name" value={form.last} onChangeText={t => setForm({ ...form, last: t })} /><Field label="Email" value={form.email} onChangeText={t => setForm({ ...form, email: t })} keyboardType="email-address" autoCapitalize="none" /><Field label="Mobile" value={form.phone} onChangeText={t => setForm({ ...form, phone: t })} keyboardType="phone-pad" /><Field label="Note" value={form.note} onChangeText={t => setForm({ ...form, note: t })} multiline /><Btn title="Save" busy={busy} onPress={() => void save()} /></> : null}
      </Sheet>
    </Page>
  );
}
