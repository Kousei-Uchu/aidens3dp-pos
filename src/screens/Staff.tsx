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
import { MODES, MODE_BLURB, MODE_LABEL, MORE_GROUPS, MORE_LABEL, TAB_LABEL, TAB_ORDER, TABS_BY_LEVEL, TEXT_LABEL, isSoleAdmin, moreLevelIncludes, readUi, readCustom, withCustom, withMode, type CustomUi, type MoreRowId, type TabId, type UiMode } from '../lib/uiMode';
import type { Role } from '../lib/types';
import { ADJUST_KINDS, KIND_NAME, RESTRICTABLE_ROLES, ROLE_PLURAL, actingRole, canAdjust, canEditAdjustPerms, permsSummary, setAdjustPerm } from '../lib/adjustPerms';

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
  const setPreference = (id: string, key: 'theme' | 'accent' | 'tileSize', value: string) => {
    patch({ staff: s.staff.map(x => {
      if (x.id !== id) return x;
      const preferences = { ...x.preferences, [key]: value === 'default' ? undefined : value };
      return { ...x, preferences };
    }) });
    void pushSharedSettings().catch(() => {});
  };
  return (
    <Page title="Staff" onBack={nav.pop} helpId="concepts/roles">
      <Section footer="PINs lock the till and tag each sale with who made it. They’re stored hashed, and shared to your other registers.">
        <Toggle label="Require PIN to use the register" value={s.requirePin && s.staff.length > 0} onChange={v => { if (v && !s.staff.length) return alertMsg('Add a staff member first'); patch({ requirePin: v }); void pushSharedSettings().catch(() => {}); }} /></Section>
      <AdjustRoleRules />
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
            <Txt size={13} sub weight="600" style={{ textTransform: 'uppercase', marginTop: 12 }}>Personal display preferences</Txt>
            <Txt size={12} sub>These override the register defaults for this staff member only.</Txt>
            <Segmented value={m.preferences?.theme ?? 'default'} onChange={v => setPreference(m.id, 'theme', v)} options={[{ v: 'default', label: 'Register' }, { v: 'brand', label: 'Brand' }, { v: 'light', label: 'Light' }, { v: 'dark', label: 'Dark' }, { v: 'system', label: 'System' }]} />
            <Segmented value={m.preferences?.tileSize ?? 'default'} onChange={v => setPreference(m.id, 'tileSize', v)} options={[{ v: 'default', label: 'Register tiles' }, { v: 'S', label: 'Small' }, { v: 'M', label: 'Medium' }, { v: 'L', label: 'Large' }]} />
            <Segmented value={m.preferences?.accent ?? 'default'} onChange={v => setPreference(m.id, 'accent', v)} options={[{ v: 'default', label: 'Register accent' }, { v: '#FAE9DC', label: 'Peach' }, { v: '#13111C', label: 'Plum' }, { v: '#2563EB', label: 'Blue' }, { v: '#16A34A', label: 'Green' }, { v: '#9333EA', label: 'Purple' }]} />
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
  const tabNames: Record<TabId, string> = { checkout: 'Checkout tab', inventory: 'Inventory tab', transactions: 'Transactions tab', notifications: 'Notifications tab', more: 'More tab' };
  const moreNames: Record<MoreRowId, string> = { orders: 'Orders', items: 'Items', customers: 'Customers', saved: 'Saved carts', giftcards: 'Gift cards', reports: 'Reports', drawer: 'Cash drawer', staff: 'Staff', settings: 'Settings', diagnostics: 'Diagnostics', help: 'Help', training: 'Training', lock: 'Lock register' };
  const flipTab = (id: TabId, shown: boolean) => onChange({ tabOverrides: { ...value.tabOverrides, [id]: shown } });
  const flipMore = (id: MoreRowId, shown: boolean) => onChange({ moreOverrides: { ...value.moreOverrides, [id]: shown } });
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
      <Txt size={12} sub>Guided steps ask one question at a time: items, discount, check and pay.</Txt>
      {value.guided ? <Toggle label="Ask for a customer as a separate step" value={value.guidedCustomer ?? false} onChange={guidedCustomer => onChange({ guidedCustomer })} /> : null}
      {label('Show individual tabs')}
      {TAB_ORDER.map(id => <Toggle key={id} label={tabNames[id]} value={id === 'checkout' || id === 'more' || (value.tabOverrides?.[id] ?? TABS_BY_LEVEL[value.tabs].includes(id))} disabled={id === 'checkout' || id === 'more'} onChange={shown => flipTab(id, shown)} />)}
      {label('More menu')}
      <Segmented<CustomUi['more']> value={value.more} onChange={more => onChange({ more })} options={(['all', 'everyday', 'essential'] as const).map(v => ({ v, label: v === 'all' ? 'All' : v === 'everyday' ? 'Everyday' : 'Essentials' }))} />
      <Txt size={12} sub>{MORE_LABEL[value.more]}</Txt>
      {label('Show individual More entries')}
      {MORE_GROUPS.flat().map(id => <Toggle key={id} label={moreNames[id]} value={value.moreOverrides?.[id] ?? moreLevelIncludes(value.more, id)} onChange={shown => flipMore(id, shown)} />)}
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

/** A16.9: which roles may set which price adjustments. Everything is allowed until a switch is turned off. */
function AdjustRoleRules() {
  const s = useApp(st => st.settings); const staffId = useApp(st => st.staffId); const patch = useApp(st => st.patchSettings);
  const me = actingRole(s.requirePin, s.staff, staffId); const mayEdit = canEditAdjustPerms(me, s.staff);
  const notes = permsSummary(s.adjustPerms);
  const flip = (role: Role, kind: (typeof ADJUST_KINDS)[number], allowed: boolean) => {
    if (!mayEdit) return alertMsg('Only an owner can change this', 'Ask an owner to change who may set price adjustments.');
    patch({ adjustPerms: setAdjustPerm(s.adjustPerms, role, kind, allowed) }); void pushSharedSettings().catch(() => {});
  };
  return (
    <Section title="Price adjustments by role" footer={`${notes.length ? notes.join(' ') + ' ' : 'Everyone is allowed. '}Owners are never restricted. Taking an adjustment off is always allowed. Keeping or changing one a colleague set follows the same switches.${mayEdit ? '' : ' Only an owner can change these.'}`}>
      {RESTRICTABLE_ROLES.flatMap(role => ADJUST_KINDS.map(kind => (
        <Toggle key={`${role}:${kind}`} label={`${ROLE_PLURAL[role]} can set ${KIND_NAME[kind]}`} value={canAdjust(s.adjustPerms, role, kind)} onChange={v => flip(role, kind, v)} disabled={!mayEdit} />
      )))}
    </Section>
  );
}
