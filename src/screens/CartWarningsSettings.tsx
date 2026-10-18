// Location: src/screens/CartWarningsSettings.tsx
// Settings ▸ Cart warnings: prompts shown on Charge, before payment, when the cart holds a chosen item, product or
// category (collection), or on every sale. Shared to every register like the staff list and bundle deals.
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, Chip, Empty, Field, Row, Section, Segmented, Sheet, Toggle, Txt, confirm } from '../ui/kit';
import { useApp } from '../state/store';
import { useCatalogue } from '../state/selectors';
import { pushSharedSettings } from '../lib/sync';
import { uid } from '../lib/ids';
import { DEFAULT_WARNING_TITLE, normaliseScope, warningTitle } from '../lib/cartWarnings';
import { TEMPLATE_HINTS } from '../lib/textTemplates';
import type { CartWarning, CartWarningMode } from '../lib/types';

type Scope = 'variant' | 'product' | 'collection';
const SCOPES: { v: Scope; label: string }[] = [{ v: 'variant', label: 'Variation' }, { v: 'product', label: 'Product' }, { v: 'collection', label: 'Category' }];
const SCOPE_NOUN: Record<Scope, string> = { variant: 'variation', product: 'product', collection: 'category' };
const MODES: { v: CartWarningMode; label: string }[] = [{ v: 'charge', label: 'Show at Charge' }, { v: 'queue', label: 'Add to the list' }];
const MAX_SHOWN = 30;

/** What the warning is for, in words: the item, product or category's name, or "Every sale". */
function useTargetName() {
  const cat = useCatalogue();
  return (w: CartWarning): string => {
    if (w.alwaysShow && !w.targetId) return 'Every sale';
    const scope = normaliseScope(w.scope);
    if (scope === 'variant') { const v = cat.variants[w.targetId]; return v ? `${v.productTitle}${v.variantTitle ? ' · ' + v.variantTitle : ''}` : 'An item that is no longer in the catalogue'; }
    if (scope === 'product') { const v = cat.all.find(x => x.productId === w.targetId); return v ? v.productTitle : 'A product that is no longer in the catalogue'; }
    return cat.collections.find(x => x.id === w.targetId)?.title ?? 'A category that is no longer in the catalogue';
  };
}

export function CartWarningsSettings() {
  const warnings = useApp(s => s.settings.cartWarnings) ?? []; const patch = useApp(s => s.patchSettings);
  const [editing, setEditing] = useState<CartWarning | 'new' | null>(null); const nameOf = useTargetName();
  const save = (next: CartWarning[]) => { patch({ cartWarnings: next }); void pushSharedSettings().catch(() => {}); };
  const put = (w: CartWarning) => { save(warnings.some(x => x.id === w.id) ? warnings.map(x => (x.id === w.id ? w : x)) : [...warnings, w]); setEditing(null); };
  const remove = async (w: CartWarning) => { if (await confirm('Delete this warning?', `“${warningTitle(w)}” stops appearing at Charge.`, 'Delete', true)) save(warnings.filter(x => x.id !== w.id)); };
  return (
    <View style={{ padding: 16, gap: 10 }}>
      <Txt size={13} sub>When Charge is pressed, the cashier sees a warning for each of these that applies to the sale, one page each with Next and Back, before payment starts. It can need ticking off, and it is the same on every register.</Txt>
      {warnings.length === 0 ? <Empty title="No warnings yet" sub="Add one for a fragile item, or one that shows on every sale." /> : warnings.map(w => (
        <Card key={w.id} style={{ padding: 12, gap: 6, opacity: w.enabled ? 1 : 0.6 }}>
          <Row title={warningTitle(w)} sub={nameOf(w)} last right={<Chip label={w.enabled ? 'On' : 'Off'} active={w.enabled} onPress={() => save(warnings.map(x => (x.id === w.id ? { ...x, enabled: !w.enabled } : x)))} />} />
          <Txt size={13} sub numberOfLines={3}>{w.body}</Txt>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {w.alwaysShow ? <Chip label="Always shows" active /> : null}
            {w.requireAcknowledgement ? <Chip label="Must be ticked" active /> : null}
            {(w.mode ?? 'charge') === 'queue' ? <Chip label="Add to the list" active /> : <Chip label="Show at Charge" active />}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn title="Edit" small kind="secondary" onPress={() => setEditing(w)} style={{ flex: 1 }} />
            <Btn title="Delete" small kind="danger" onPress={() => void remove(w)} style={{ flex: 1 }} />
          </View>
        </Card>
      ))}
      <Btn title="Add warning" icon="add" onPress={() => setEditing('new')} />
      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add cart warning' : 'Edit cart warning'} full>
        {editing !== null ? <WarningEditor initial={editing === 'new' ? undefined : editing} onSave={put} onCancel={() => setEditing(null)} /> : null}
      </Sheet>
    </View>
  );
}

function WarningEditor({ initial, onSave, onCancel }: { initial?: CartWarning; onSave: (w: CartWarning) => void; onCancel: () => void }) {
  const cat = useCatalogue();
  const [w, setW] = useState<CartWarning>(() => initial ? { ...initial, scope: normaliseScope(initial.scope) } : { id: uid(), enabled: true, title: DEFAULT_WARNING_TITLE, body: '', scope: 'product', targetId: '', alwaysShow: false, requireAcknowledgement: false, mode: 'charge' });
  const [q, setQ] = useState('');
  const [help, setHelp] = useState(false);
  const scope = normaliseScope(w.scope);
  const options = useMemo(() => {
    const t = q.trim().toLowerCase(); const hit = (...xs: (string | undefined)[]) => !t || xs.some(x => x?.toLowerCase().includes(t));
    if (scope === 'variant') return cat.list.filter(v => hit(v.productTitle, v.variantTitle, v.sku, v.barcode)).map(v => ({ id: v.id, title: v.productTitle + (v.variantTitle ? ' · ' + v.variantTitle : ''), sub: v.sku })).sort((a, b) => a.title.localeCompare(b.title));
    if (scope === 'product') { const seen = new Map<string, string>(); for (const v of cat.list) if (!seen.has(v.productId) && hit(v.productTitle)) seen.set(v.productId, v.productTitle); return Array.from(seen, ([id, title]) => ({ id, title, sub: undefined as string | undefined })).sort((a, b) => a.title.localeCompare(b.title)); }
    return cat.collections.filter(c => hit(c.title)).map(c => ({ id: c.id, title: c.title, sub: `${c.productIds.length} product${c.productIds.length === 1 ? '' : 's'}` })).sort((a, b) => a.title.localeCompare(b.title));
  }, [cat, scope, q]);
  const nameOf = useTargetName();
  const ready = w.body.trim().length > 0 && (w.alwaysShow || !!w.targetId);
  return (
    <View style={{ gap: 12 }}>
      <Field kind="name" label="Header" value={w.title} onChangeText={t => setW({ ...w, title: t })} placeholder={DEFAULT_WARNING_TITLE} />
      <Field kind="text" label="Message for the cashier" value={w.body} onChangeText={t => setW({ ...w, body: t })} multiline numberOfLines={4} style={{ minHeight: 90 }} placeholder="e.g. Joints are fragile, do not bend or apply pressure as it will snap." />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt size={13} sub>Use in the message</Txt>
        <Btn title="What can I use?" small kind="ghost" onPress={() => setHelp(h => !h)} />
      </View>
      {help ? <Card style={{ padding: 10, gap: 4 }}>{TEMPLATE_HINTS.map(h => (
        <View key={h.name} style={{ flexDirection: 'row', gap: 8 }}>
          <Txt size={12} weight="700" style={{ width: 96 }}>{`{{ ${h.name} }}`}</Txt>
          <Txt size={12} sub style={{ flex: 1 }}>{h.what}</Txt>
        </View>))}</Card> : null}
      <View style={{ gap: 4 }}>
        <Txt size={13} sub>What happens when it applies</Txt>
        <Segmented value={w.mode ?? 'charge'} onChange={v => setW({ ...w, mode: v })} options={MODES} />
        <Txt size={12} sub>{(w.mode ?? 'charge') === 'queue'
          ? 'The message is added to the warnings list instead of the Charge popup, so it can be read later from a tile or the cart menu.'
          : 'The message pops up on Charge, before payment starts.'}</Txt>
      </View>
      <Toggle label="Show on every sale" sub="Appears every time Charge is pressed, whatever is in the cart." value={w.alwaysShow} onChange={v => setW({ ...w, alwaysShow: v })} />
      <Toggle label="Cashier must tick it" sub="Payment cannot start until they tick that they have read it and dealt with it." value={w.requireAcknowledgement} onChange={v => setW({ ...w, requireAcknowledgement: v })} />
      {w.alwaysShow ? null : <Section title="Shows when the cart has">
        <View style={{ padding: 12, gap: 10 }}>
          <Segmented value={scope} onChange={v => { setW({ ...w, scope: v, targetId: '' }); setQ(''); }} options={SCOPES} />
          {w.targetId ? <Row title={nameOf(w)} sub={`Chosen ${SCOPE_NOUN[scope]}`} icon="checkmark-circle" last right={<Btn title="Clear" small kind="secondary" onPress={() => setW({ ...w, targetId: '' })} />} /> : null}
          <Field kind="search" label={`Find a ${SCOPE_NOUN[scope]}`} value={q} onChangeText={setQ} placeholder="Search" />
          {options.slice(0, MAX_SHOWN).map((o, i) => <Row key={o.id} title={o.title} sub={o.sub} icon={w.targetId === o.id ? 'radio-button-on' : 'radio-button-off'} onPress={() => setW({ ...w, targetId: o.id })} last={i === Math.min(options.length, MAX_SHOWN) - 1} />)}
          {options.length > MAX_SHOWN ? <Txt size={12} sub>Showing {MAX_SHOWN} of {options.length}. Type to narrow it down.</Txt> : null}
          {options.length === 0 ? <Txt size={13} sub>Nothing matches.</Txt> : null}
        </View>
      </Section>}
      {!ready ? <Txt size={13} sub>{w.body.trim() ? 'Choose what it is for, or turn on Show on every sale.' : 'Write the message first.'}</Txt> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn title="Cancel" kind="secondary" onPress={onCancel} style={{ flex: 1 }} />
        <Btn title="Save" disabled={!ready} onPress={() => onSave({ ...w, title: w.title.trim(), body: w.body.trim(), targetId: w.alwaysShow ? '' : w.targetId, mode: w.mode ?? 'charge' })} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
