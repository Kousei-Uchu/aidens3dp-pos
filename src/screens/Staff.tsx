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
import { MODES, MODE_BLURB, MODE_LABEL, MORE_LABEL, TAB_LABEL, TEXT_LABEL, isSoleAdmin, readUi, readCustom, withCustom, withMode, type CustomUi, type UiMode } from '../lib/uiMode';
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
  /** Saves a person's display mode and shares it to the other registers with the rest of the staff list. */
  const setUi = (id: string, ui: ReturnType<typeof withMode>) => { patch({ staff: s.staff.map(x => (x.id === id ? { ...x, ui } : x)) }); void pushSharedSettings().catch(() => {}); };
  return (
    <Page title="Staff" onBack={nav.pop}>
      <Section footer="PINs lock the till and tag each sale with who made it. They’re stored hashed, and shared to your other registers.">
        <Toggle label="Require PIN to use the register" value={s.requirePin && s.staff.length > 0} onChange={v => { if (v && !s.staff.length) return alertMsg('Add a staff member first'); patch({ requirePin: v }); void pushSharedSettings().catch(() => {}); }} /></Section>
      <Section title="Team">{s.staff.length ? s.staff.map((m, i) => <Row key={m.id} title={m.name} sub={`${m.role}${hasBadge(m) ? ' · pass issued' : ''}`} last={i === s.staff.length - 1} icon="person-outline" onPress={() => setSel(m.id)} />) : <Row title="No staff yet" last />}</Section>
      <View style={{ padding: 16 }}><Btn title="Add staff member" icon="person-add-outline" onPress={() => setOpen(true)} /></View>
      <Sheet visible={!!sel} onClose={() => setSel(null)} title={s.staff.find(x => x.id === sel)?.name ?? ''}>
        {s.staff.filter(x => x.id === sel).map(m => <View key={m.id}>
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, gap: 8 }}>
            <Txt size={13} sub weight="600" style={{ textTransform: 'uppercase' }}>Display mode</Txt>
            <Segmented<UiMode> value={readUi(m.ui).mode} onChange={mode => setUi(m.id, withMode(m.ui, mode))} options={MODES.map(v => ({ v, label: MODE_LABEL[v] }))} />
            <Txt size={13} sub>{MODE_BLURB[readUi(m.ui).mode]}</Txt>
            {readUi(m.ui).mode === 'custom' ? <CustomModeEditor value={readCustom(readUi(m.ui).custom)} onChange={p => setUi(m.id, withCustom(m.ui, p))} /> : null}
            {readUi(m.ui).mode !== 'standard' && m.role !== 'cashier' && isSoleAdmin(s.staff, m.id) ? <Txt size={12} sub>You are the only manager or owner, so this mode keeps Staff and Settings in the More menu.</Txt> : null}
          </View>
          <Row icon="qr-code-outline" title="Cashier pass" sub={hasBadge(m) ? 'Issued. Print it, add it to Apple Wallet, or replace it.' : 'Not issued yet'} onPress={() => { setSel(null); setTimeout(() => setPassFor(m.id), 350); }} />
          <Row icon="trash-outline" title={`Remove ${m.name}`} danger last onPress={async () => { setSel(null); if (await confirm(`Remove ${m.name}?`, 'Their PIN and cashier pass stop working.', 'Remove', true)) { patch({ staff: s.staff.filter(x => x.id !== m.id) }); void forgetBadge(m.id); void pushSharedSettings().catch(() => {}); } }} />
        </View>)}
      </Sheet>
      <StaffPassSheet memberId={passFor} visible={!!passFor} onClose={() => setPassFor(null)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title="New staff member">
        <Field kind="name" label="Name" value={f.name} onChangeText={t => setF({ ...f, name: t })} /><Field kind="pin" label="PIN (4–6 digits)" value={f.pin} onChangeText={t => setF({ ...f, pin: t.replace(/\D/g, '').slice(0, 6) })} />
        <Segmented value={f.role} onChange={role => setF({ ...f, role })} options={[{ v: 'cashier', label: 'Cashier' }, { v: 'manager', label: 'Manager' }, { v: 'owner', label: 'Owner' }]} /><View style={{ height: 12 }} /><Btn title="Add" onPress={() => void save()} />
      </Sheet>
    </Page>
  );
}

/** The four dials of Custom mode. */
function CustomModeEditor({ value, onChange }: { value: CustomUi; onChange: (p: Partial<CustomUi>) => void }) {
  const label = (t: string) => <Txt size={13} weight="600" style={{ marginTop: 6 }}>{t}</Txt>;
  return (
    <View style={{ gap: 6 }}>
      {label('Text size')}
      <Segmented<CustomUi['textSize']> value={value.textSize} onChange={textSize => onChange({ textSize })} options={(['normal', 'large', 'xlarge'] as const).map(v => ({ v, label: TEXT_LABEL[v] }))} />
      {label('Plain-English line under each More entry')}
      <Segmented<'on' | 'off'> value={value.explain ? 'on' : 'off'} onChange={v => onChange({ explain: v === 'on' })} options={[{ v: 'off', label: 'Off' }, { v: 'on', label: 'On' }]} />
      {label('Tabs along the bottom')}
      <Segmented<CustomUi['tabs']> value={value.tabs} onChange={tabs => onChange({ tabs })} options={(['all', 'core', 'basic'] as const).map(v => ({ v, label: v === 'all' ? 'All' : v === 'core' ? 'No alerts' : 'Basic' }))} />
      <Txt size={12} sub>{TAB_LABEL[value.tabs]}</Txt>
      {label('Checkout')}
      <Segmented<'on' | 'off'> value={value.guided ? 'on' : 'off'} onChange={v => onChange({ guided: v === 'on' })} options={[{ v: 'off', label: 'Normal' }, { v: 'on', label: 'Guided steps' }]} />
      <Txt size={12} sub>Guided steps ask one question at a time: items, customer, discount, check, pay.</Txt>
      {label('More menu')}
      <Segmented<CustomUi['more']> value={value.more} onChange={more => onChange({ more })} options={(['all', 'everyday', 'essential'] as const).map(v => ({ v, label: v === 'all' ? 'All' : v === 'everyday' ? 'Everyday' : 'Essentials' }))} />
      <Txt size={12} sub>{MORE_LABEL[value.more]}</Txt>
    </View>
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
