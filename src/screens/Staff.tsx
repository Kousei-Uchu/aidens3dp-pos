import React, { useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, Chip, Field, Page, Row, Section, Segmented, Sheet, Toggle, Txt, alertMsg, confirm } from '../ui/kit';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { hashPin, newSalt, verifyPin } from '../lib/pin';
import { hasBadge } from '../lib/badge';
import { forgetBadge } from '../lib/badgeStore';
import { StaffLoginPad } from './StaffLogin';
import { StaffPassSheet } from './StaffPass';
import { pushSharedSettings } from '../lib/sync';
import { uid } from '../lib/ids';
import type { Role } from '../lib/types';

/** Staff: PINs (salted hash, shared across registers via the settings metaobject) and roles. */
export default function Staff() {
  const nav = useNav(); const s = useApp(st => st.settings); const patch = useApp(st => st.patchSettings);
  const [open, setOpen] = useState(false); const [sel, setSel] = useState<string | null>(null); const [passFor, setPassFor] = useState<string | null>(null); const [f, setF] = useState<{ name: string; pin: string; role: Role }>({ name: '', pin: '', role: 'cashier' });
  const save = async () => {
    if (!f.name.trim() || !/^\d{4,6}$/.test(f.pin)) return alertMsg('Name and a 4–6 digit PIN are required');
    for (const m of s.staff) if (await verifyPin(m.salt, f.pin, m.pinHash)) return alertMsg('That PIN is already used');
    const salt = newSalt(); patch({ staff: [...s.staff, { id: uid(), name: f.name.trim(), role: f.role, salt, pinHash: await hashPin(salt, f.pin) }] }); void pushSharedSettings().catch(() => {}); setOpen(false); setF({ name: '', pin: '', role: 'cashier' });
  };
  return (
    <Page title="Staff" onBack={nav.pop}>
      <Section footer="PINs lock the till and tag each sale with who made it. They’re stored hashed, and shared to your other registers.">
        <Toggle label="Require PIN to use the register" value={s.requirePin && s.staff.length > 0} onChange={v => { if (v && !s.staff.length) return alertMsg('Add a staff member first'); patch({ requirePin: v }); void pushSharedSettings().catch(() => {}); }} /></Section>
      <Section title="Team">{s.staff.length ? s.staff.map((m, i) => <Row key={m.id} title={m.name} sub={`${m.role}${hasBadge(m) ? ' · pass issued' : ''}`} last={i === s.staff.length - 1} icon="person-outline" onPress={() => setSel(m.id)} />) : <Row title="No staff yet" last />}</Section>
      <View style={{ padding: 16 }}><Btn title="Add staff member" icon="person-add-outline" onPress={() => setOpen(true)} /></View>
      <Sheet visible={!!sel} onClose={() => setSel(null)} title={s.staff.find(x => x.id === sel)?.name ?? ''}>
        {s.staff.filter(x => x.id === sel).map(m => <View key={m.id}>
          <Row icon="qr-code-outline" title="Cashier pass" sub={hasBadge(m) ? 'Issued. Print it, add it to Apple Wallet, or replace it.' : 'Not issued yet'} onPress={() => { setSel(null); setTimeout(() => setPassFor(m.id), 350); }} />
          <Row icon="trash-outline" title={`Remove ${m.name}`} danger last onPress={async () => { setSel(null); if (await confirm(`Remove ${m.name}?`, 'Their PIN and cashier pass stop working.', 'Remove', true)) { patch({ staff: s.staff.filter(x => x.id !== m.id) }); void forgetBadge(m.id); void pushSharedSettings().catch(() => {}); } }} />
        </View>)}
      </Sheet>
      <StaffPassSheet memberId={passFor} visible={!!passFor} onClose={() => setPassFor(null)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title="New staff member">
        <Field label="Name" value={f.name} onChangeText={t => setF({ ...f, name: t })} /><Field label="PIN (4–6 digits)" value={f.pin} onChangeText={t => setF({ ...f, pin: t.replace(/\D/g, '').slice(0, 6) })} keyboardType="number-pad" secureTextEntry />
        <Segmented value={f.role} onChange={role => setF({ ...f, role })} options={[{ v: 'cashier', label: 'Cashier' }, { v: 'manager', label: 'Manager' }, { v: 'owner', label: 'Owner' }]} /><View style={{ height: 12 }} /><Btn title="Add" onPress={() => void save()} />
      </Sheet>
    </Page>
  );
}

export function PinLock() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 14 }}>
      <Txt size={26} weight="700">Sign in</Txt>
      <StaffLoginPad onDone={() => {}} />
    </View>
  );
}
void Card; void Chip;
