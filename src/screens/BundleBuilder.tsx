// Location: src/screens/BundleBuilder.tsx
// A8: GUI for bundle deals (Settings ▸ Discounts & bundles). Writes the same JSON the pricing engine reads
// (`settings.bundlesJson`); the old JSON editor stays as the "Advanced" view.
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Btn, Card, Chip, Empty, Field, Row, Section, Segmented, Sheet, Toggle, Txt, confirm } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../state/store';
import { pushSharedSettings } from '../lib/sync';
import { parseBundleConfig, validateBundleConfig } from '../lib/bundles';
import { fmt, toCents, toDecimal } from '../lib/money';
import {
  dealSummary, dealToForm, dealWindow, emptyBundleConfig, emptyDealForm, formProblems, idName, makeDealId, removeDeal, setDealEnabled,
  slotLabel, slotVariants, stringifyBundleConfig, totalUnits, unitSlots, upsertDeal, variantName, type DealForm, type DealMode, type SlotForm,
} from '../lib/bundleForm';
import type { BundleConfig, Variant } from '../lib/types';

const SAMPLE_BUNDLES = JSON.stringify({ version: 1, items: { set_a: ['gid://shopify/Product/1'], set_b: ['gid://shopify/Product/2'] }, discounts: [{ id: 'combo', label: 'Combo deal', sets: ['set_a', 'set_b'], price_delta_cents: -500, apply_to: 'set_b', max_per_cart: 5 }] }, null, 2);

function useBundleConfig() {
  const text = useApp(s => s.settings.bundlesJson); const patch = useApp(s => s.patchSettings);
  const parsed = useMemo(() => (text.trim() ? parseBundleConfig(text) : { cfg: emptyBundleConfig() }), [text]);
  const save = (cfg: BundleConfig) => { patch({ bundlesJson: stringifyBundleConfig(cfg) }); void pushSharedSettings().catch(() => {}); };
  return { text, cfg: parsed.cfg ?? null, error: parsed.error, save };
}

export function BundlesEditor() {
  const { text, cfg, error, save } = useBundleConfig(); const variants = useApp(s => s.data.variants);
  const [view, setView] = useState<'list' | 'edit' | 'json'>('list'); const [form, setForm] = useState<DealForm | null>(null); const [isNew, setIsNew] = useState(false);
  const { c } = useTheme();
  if (view === 'json' || !cfg) return <JsonEditor initial={text} reason={!cfg ? error : undefined} onDone={() => setView('list')} />;

  if (view === 'edit' && form) {
    return <DealEditor key={form.id} initial={form} isNew={isNew} cfg={cfg} variants={variants}
      onCancel={() => setView('list')}
      onSave={f => { save(upsertDeal(cfg, f)); setView('list'); }}
      onDelete={async () => { if (await confirm('Delete this bundle?', 'It stops applying at checkout straight away.', 'Delete', true)) { save(removeDeal(cfg, form.id)); setView('list'); } }} />;
  }

  const now = Date.now();
  const open = (f: DealForm, fresh: boolean) => { setForm(f); setIsNew(fresh); setView('edit'); };
  return (
    <View style={{ paddingTop: 4 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8 }}><Txt size={13} sub>Bundle deals take a set number of items (any variations you allow) and change their price. Several can apply to one order, and every item only counts towards one deal. Shopify automatic discounts apply afterwards. Items tagged no-discount are left out.</Txt></View>
      {cfg.discounts.length === 0 ? <Empty icon="pricetags-outline" title="No bundle deals yet" sub="Create one, for example “2 Highland Cows for $2 off”." /> : (
        <Section>
          {cfg.discounts.map((d, i) => {
            const f = dealToForm(cfg, d); const win = dealWindow(d, now);
            const state = d.enabled === false ? 'Off' : win === 'scheduled' ? 'Scheduled' : win === 'ended' ? 'Ended' : 'Live';
            return <Row key={d.id} title={d.label} sub={`${state} · ${dealSummary(f, variants, fmt)}${d.recommended?.length ? ` · ${d.recommended.length} recommended pair${d.recommended.length === 1 ? '' : 's'}` : ''}`}
              right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Pressable hitSlop={10} accessibilityRole="switch" accessibilityLabel={`${d.label} on or off`} accessibilityState={{ checked: d.enabled !== false }} onPress={() => save(setDealEnabled(cfg, d.id, d.enabled === false))}>
                  <Ionicons name={d.enabled === false ? 'toggle-outline' : 'toggle'} size={34} color={d.enabled === false ? c.sub : c.good} /></Pressable>
                <Ionicons name="chevron-forward" size={18} color={c.sub} /></View>}
              last={i === cfg.discounts.length - 1} onPress={() => open(f, false)} />;
          })}
        </Section>
      )}
      <View style={{ padding: 16, gap: 8 }}>
        <Btn title="New bundle deal" icon="add" onPress={() => open(emptyDealForm(cfg), true)} />
        <Btn title="Advanced: edit as JSON" kind="ghost" onPress={() => setView('json')} />
      </View>
    </View>
  );
}

// ── one deal ─────────────────────────────────────────────────────────────────
function DealEditor({ initial, isNew, cfg, variants, onSave, onCancel, onDelete }: { initial: DealForm; isNew: boolean; cfg: BundleConfig; variants: Record<string, Variant>; onSave: (f: DealForm) => void; onCancel: () => void; onDelete: () => void }) {
  const { c } = useTheme();
  const [f, setF] = useState<DealForm>(initial);
  const [amountText, setAmountText] = useState(initial.mode === 'percent' ? String(initial.percent) : initial.amountCents ? toDecimal(initial.amountCents) : '');
  const [picking, setPicking] = useState<number | null>(null); const [pairing, setPairing] = useState(false); const [tried, setTried] = useState(false);
  const set = (p: Partial<DealForm>) => setF(cur => ({ ...cur, ...p }));
  const units = totalUnits(f); const problems = formProblems(f);
  const setMode = (mode: DealMode) => { set({ mode }); setAmountText(''); };
  const setAmount = (t: string) => { setAmountText(t); if (f.mode === 'percent') set({ percent: parseFloat(t) || 0 }); else set({ amountCents: toCents(t) }); };
  // Changing the shape of the deal makes old recommended pairs meaningless, so they are cleared (after asking).
  const reshape = async (next: Partial<DealForm>) => {
    if (f.recommended.length && !(await confirm('Clear recommended pairs?', 'Changing the items or quantities makes the recommended pairs out of date, so they will be removed.', 'Clear pairs', true))) return;
    set({ ...next, recommended: [] });
  };
  const updateSlot = (i: number, p: Partial<SlotForm>) => reshape({ slots: f.slots.map((s, k) => (k === i ? { ...s, ...p } : s)) });
  const addSlot = () => reshape({ slots: [...f.slots, { ids: [], qty: 1 }] });
  const removeSlot = (i: number) => reshape({ slots: f.slots.filter((_, k) => k !== i), applyToSlot: f.applyToSlot == null || f.applyToSlot === i ? null : f.applyToSlot > i ? f.applyToSlot - 1 : f.applyToSlot });
  const submit = () => {
    setTried(true); if (problems.length) return;
    const id = isNew ? makeDealId(f.label, cfg.discounts.map(d => d.id)) : f.id;
    onSave({ ...f, id });
  };
  // Soft warnings about THIS deal only (unknown items, overlapping deals, odd dates). They don't block saving.
  const warnings = useMemo(() => {
    const known = new Set(Object.values(variants).flatMap(v => [v.id, v.productId]));
    return validateBundleConfig(upsertDeal(cfg, f), known).filter(x => x.includes(`"${f.id}"`) || x.includes(`"${f.id}_`));
  }, [f, cfg, variants]);

  return (
    <View style={{ padding: 16, gap: 4 }}>
      <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Back to bundle list" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
        <Ionicons name="chevron-back" size={18} color={c.sub} /><Txt sub>All bundle deals</Txt></Pressable>

      <Field kind="name" label="Deal name (shown on the cart and receipt)" value={f.label} onChangeText={t => set({ label: t })} placeholder="e.g. Dragon + Egg combo" />
      <Card><Toggle label="Deal is on" sub="Switch off to keep it saved but stop it applying" value={f.enabled} onChange={v => set({ enabled: v })} /></Card>

      <Txt weight="700" size={16} style={{ marginTop: 16, marginBottom: 6 }}>What the customer buys</Txt>
      {f.slots.map((s, i) => (
        <Card key={i} style={{ marginBottom: 10, padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt weight="600" style={{ flex: 1 }}>Group {i + 1}</Txt>
            {f.slots.length > 1 ? <Pressable hitSlop={10} onPress={() => removeSlot(i)} accessibilityRole="button" accessibilityLabel={`Remove group ${i + 1}`}><Ionicons name="trash-outline" size={20} color={c.bad} /></Pressable> : null}
          </View>
          <Txt size={14} sub>{s.ids.length ? s.ids.map(id => idName(id, variants)).join(' · ') : 'No items picked yet'}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Btn title="Pick items" kind="secondary" small icon="search-outline" onPress={() => setPicking(i)} />
            <View style={{ flex: 1 }} />
            <Pressable hitSlop={8} disabled={s.qty <= 1} onPress={() => updateSlot(i, { qty: s.qty - 1 })} accessibilityRole="button" accessibilityLabel="Fewer"><Ionicons name="remove-circle-outline" size={30} color={s.qty <= 1 ? c.line : c.text} /></Pressable>
            <Txt weight="700" size={18} style={{ minWidth: 40, textAlign: 'center' }}>{s.qty} ×</Txt>
            <Pressable hitSlop={8} onPress={() => updateSlot(i, { qty: s.qty + 1 })} accessibilityRole="button" accessibilityLabel="More"><Ionicons name="add-circle-outline" size={30} color={c.text} /></Pressable>
          </View>
        </Card>
      ))}
      <Btn title="Add another group of items" kind="ghost" icon="add" onPress={() => void addSlot()} />
      <Txt size={12} sub>A group is “this many items from this list”. Product picks cover every variation. Choose individual variations to be stricter. Total items in the deal: {units}.</Txt>

      <Txt weight="700" size={16} style={{ marginTop: 18, marginBottom: 6 }}>The deal</Txt>
      <Segmented value={f.mode} onChange={setMode} options={[{ v: 'delta', label: '$ off' }, { v: 'percent', label: '% off' }, { v: 'fixed_price', label: 'Set price' }]} />
      <View style={{ marginTop: 12 }}>
        <Field kind={f.mode === 'percent' ? 'decimal' : 'money'} label={f.mode === 'percent' ? 'Percent off' : f.mode === 'fixed_price' ? 'Price for all the items together ($)' : 'Dollars taken off ($)'} value={amountText} onChangeText={setAmount} placeholder={f.mode === 'percent' ? '10' : '0.00'} />
      </View>
      {f.slots.length > 1 || f.slots.some(s => s.qty > 1) ? <>
        <Txt size={13} sub weight="600" style={{ marginBottom: 6 }}>Take it off</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <Chip label="Spread over all items" active={f.applyToSlot == null} onPress={() => set({ applyToSlot: null })} />
          {f.slots.map((s, i) => <Chip key={i} label={`Only group ${i + 1}`} active={f.applyToSlot === i} onPress={() => set({ applyToSlot: i })} />)}
        </View></> : null}

      <Txt weight="700" size={16} style={{ marginTop: 10, marginBottom: 6 }}>Limits (optional)</Txt>
      <Field kind="integer" label="Most times per order" value={f.maxPerCart ? String(f.maxPerCart) : ''} onChangeText={t => set({ maxPerCart: parseInt(t, 10) || null })} placeholder="No limit" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Field kind="date" label="Starts (YYYY-MM-DD)" value={f.startsOn} onChangeText={t => set({ startsOn: t.trim() })} placeholder="Any time" /></View>
        <View style={{ flex: 1 }}><Field kind="date" label="Ends (YYYY-MM-DD)" value={f.endsOn} onChangeText={t => set({ endsOn: t.trim() })} placeholder="Never" /></View>
      </View>

      <Txt weight="700" size={16} style={{ marginTop: 10, marginBottom: 2 }}>Recommended pairs (optional)</Txt>
      <Txt size={13} sub style={{ marginBottom: 8 }}>Mark the variation combinations you’d like customers to buy together, like matching colours. Any variation still gets the deal. If the cashier rings up a different combination they’re asked to check it before payment, and recommended pairs are matched first when the saving is the same.</Txt>
      {f.recommended.length ? <Section>{f.recommended.map((r, i) => (
        <Row key={i} title={r.map(id => idName(id, variants)).join('  +  ')} last={i === f.recommended.length - 1}
          right={<Pressable hitSlop={10} onPress={() => set({ recommended: f.recommended.filter((_, k) => k !== i) })} accessibilityRole="button" accessibilityLabel="Remove this pair"><Ionicons name="close-circle" size={22} color={c.sub} /></Pressable>} />))}</Section> : null}
      <Btn title="Add a recommended pair" kind="secondary" icon="heart-outline" style={{ marginTop: 8 }} disabled={f.slots.some(s => !s.ids.length)} onPress={() => setPairing(true)} />

      {warnings.length ? <View style={{ marginTop: 14, gap: 4 }}>{warnings.map((x, i) => <Txt key={i} size={13} color={c.warn}>⚠ {x}</Txt>)}</View> : null}
      {tried && problems.length ? <View style={{ marginTop: 14, gap: 4 }}>{problems.map((x, i) => <Txt key={i} size={13} color={c.bad}>• {x}</Txt>)}</View> : null}
      <Card style={{ marginTop: 16, padding: 14 }}><Txt size={13} sub weight="600">Summary</Txt><Txt>{f.label.trim() || 'Untitled deal'}</Txt><Txt sub size={14}>{dealSummary(f, variants, fmt)}</Txt></Card>
      <View style={{ gap: 8, marginTop: 16 }}>
        <Btn title={isNew ? 'Create deal' : 'Save changes'} onPress={submit} />
        <Btn title="Cancel" kind="ghost" onPress={onCancel} />
        {!isNew ? <Btn title="Delete deal" kind="danger" onPress={onDelete} /> : null}
      </View>

      <ItemPicker visible={picking != null} variants={variants} initial={picking != null ? f.slots[picking]?.ids ?? [] : []} onClose={() => setPicking(null)}
        onDone={ids => { const i = picking!; setPicking(null); void updateSlot(i, { ids }); }} />
      <PairPicker visible={pairing} form={f} variants={variants} onClose={() => setPairing(false)}
        onAdd={pair => { setPairing(false); set({ recommended: [...f.recommended, pair] }); }} />
    </View>
  );
}

// ── pick products / variations for one group ─────────────────────────────────
function ItemPicker({ visible, variants, initial, onClose, onDone }: { visible: boolean; variants: Record<string, Variant>; initial: string[]; onClose: () => void; onDone: (ids: string[]) => void }) {
  const { c } = useTheme();
  const [sel, setSel] = useState<string[]>(initial); const [q, setQ] = useState(''); const [open, setOpen] = useState<string | null>(null);
  React.useEffect(() => { if (visible) { setSel(initial); setQ(''); setOpen(null); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const products = useMemo(() => {
    const by = new Map<string, Variant[]>();
    for (const v of Object.values(variants)) { const a = by.get(v.productId) ?? []; a.push(v); by.set(v.productId, a); }
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return [...by.entries()].map(([id, vs]) => ({ id, title: vs[0].productTitle, vs: vs.sort((a, b) => a.variantTitle.localeCompare(b.variantTitle)) }))
      .filter(p => !words.length || words.every(w => p.vs.some(v => `${v.productTitle} ${v.variantTitle} ${v.sku ?? ''} ${v.barcode ?? ''}`.toLowerCase().includes(w))))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [variants, q]);
  const toggle = (id: string) => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const toggleProduct = (p: { id: string; vs: Variant[] }) => setSel(s => (s.includes(p.id) ? s.filter(x => x !== p.id) : [...s.filter(x => !p.vs.some(v => v.id === x)), p.id]));
  const shown = products.slice(0, 80);
  return (
    <Sheet visible={visible} onClose={onClose} title="Pick items" full>
      <Field kind="search" value={q} onChangeText={setQ} placeholder="Search items, variations, SKUs" />
      <Txt size={12} sub style={{ marginBottom: 8 }}>Tap an item to include every variation. Use “Choose variations” to pick specific ones. {sel.length} picked.</Txt>
      {products.length === 0 ? <Empty title="Nothing found" sub={Object.keys(variants).length ? 'Try another search.' : 'Import your catalogue from Shopify first.'} /> : (
        <Card>{shown.map((p, i) => {
          const whole = sel.includes(p.id); const some = p.vs.filter(v => sel.includes(v.id)).length; const multi = p.vs.length > 1; const expanded = open === p.id;
          return (
            <View key={p.id} style={{ borderBottomWidth: i === shown.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
              <Row title={p.title} sub={whole ? 'All variations' : some ? `${some} of ${p.vs.length} variations` : multi ? `${p.vs.length} variations` : undefined} last
                right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {multi ? <Pressable hitSlop={8} onPress={() => setOpen(expanded ? null : p.id)} accessibilityRole="button" accessibilityLabel={`Choose variations of ${p.title}`}><Ionicons name={expanded ? 'chevron-up' : 'options-outline'} size={22} color={c.sub} /></Pressable> : null}
                  <Ionicons name={whole || some ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={whole ? c.good : some ? c.sub : c.line} /></View>}
                onPress={() => toggleProduct(p)} />
              {expanded ? <View style={{ paddingLeft: 24, backgroundColor: c.fill }}>{p.vs.map((v, k) => (
                <Row key={v.id} title={variantName(v).replace(`${p.title} - `, '')} sub={fmt(v.priceCents)} last={k === p.vs.length - 1}
                  right={<Ionicons name={sel.includes(v.id) ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={sel.includes(v.id) ? c.good : c.line} />}
                  onPress={() => { if (whole) setSel(s => [...s.filter(x => x !== p.id), ...p.vs.filter(x => x.id !== v.id).map(x => x.id)]); else toggle(v.id); }} />))}</View> : null}
            </View>
          );
        })}</Card>
      )}
      {products.length > shown.length ? <Txt size={12} sub style={{ marginTop: 8 }}>Showing the first {shown.length} of {products.length}. Search to narrow down.</Txt> : null}
      <View style={{ gap: 8, marginTop: 14 }}><Btn title={`Use ${sel.length} pick${sel.length === 1 ? '' : 's'}`} disabled={!sel.length} onPress={() => onDone(sel)} /></View>
    </Sheet>
  );
}

// ── recommended pair: one variation per unit of the deal ─────────────────────
function PairPicker({ visible, form, variants, onClose, onAdd }: { visible: boolean; form: DealForm; variants: Record<string, Variant>; onClose: () => void; onAdd: (pair: string[]) => void }) {
  const positions = unitSlots(form); const [pick, setPick] = useState<(string | null)[]>([]);
  React.useEffect(() => { if (visible) setPick(positions.map(() => null)); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = pick.length === positions.length && pick.every(Boolean);
  return (
    <Sheet visible={visible} onClose={onClose} title="Recommended pair" full>
      <Txt size={13} sub style={{ marginBottom: 10 }}>Choose the variation for each item in the deal.</Txt>
      {positions.map((si, p) => {
        const cands = slotVariants(form.slots[si], variants);
        return (
          <View key={p} style={{ marginBottom: 14 }}>
            <Txt weight="600" style={{ marginBottom: 6 }}>Item {p + 1} · {slotLabel(form.slots[si], variants).replace(/^\d+ × /, '')}</Txt>
            {cands.length === 0 ? <Txt size={13} sub>Nothing from this group is in the catalogue on this device.</Txt> :
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{cands.slice(0, 60).map(v => <Chip key={v.id} label={variantName(v)} active={pick[p] === v.id} onPress={() => setPick(cur => cur.map((x, k) => (k === p ? v.id : x)))} />)}</View>}
          </View>
        );
      })}
      <Btn title="Add pair" disabled={!done} onPress={() => onAdd(pick as string[])} />
    </Sheet>
  );
}

// ── Advanced: raw JSON ───────────────────────────────────────────────────────
function JsonEditor({ initial, reason, onDone }: { initial: string; reason?: string; onDone: () => void }) {
  const { save } = useBundleConfig(); const variants = useApp(s => s.data.variants); const { c } = useTheme();
  const [text, setText] = useState(initial); const [msg, setMsg] = useState<string[]>(reason ? [`The saved bundle JSON can't be read (${reason}). Fix it here, or clear it to start again.`] : []);
  const apply = () => {
    if (!text.trim()) { save(emptyBundleConfig()); setMsg(['Bundles cleared.']); return; }
    const r = parseBundleConfig(text); if (!r.cfg) return setMsg([`Not saved: ${r.error}`]);
    const known = new Set(Object.values(variants).flatMap(v => [v.id, v.productId]));
    save(r.cfg); setMsg([`Saved ${r.cfg.discounts.length} deal(s).`, ...validateBundleConfig(r.cfg, known)]);
  };
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Pressable onPress={onDone} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="chevron-back" size={18} color={c.sub} /><Txt sub>Back to the bundle list</Txt></Pressable>
      <Txt size={13} sub>Advanced view of the same data. Saving rewrites the deals above. Each deal can set `mode` (delta, fixed_price or percent), `starts_at`, `ends_at` and `recommended` (lists of variant ids).</Txt>
      <Field kind="json" value={text} onChangeText={setText} style={{ minHeight: 260, fontFamily: 'Menlo', fontSize: 12 }} placeholder="Paste bundle config JSON" />
      <View style={{ flexDirection: 'row', gap: 8 }}><Btn title="Save" onPress={apply} style={{ flex: 1 }} /><Btn title="Insert example" kind="secondary" onPress={() => setText(SAMPLE_BUNDLES)} style={{ flex: 1 }} /></View>
      {msg.map((m, i) => <Txt key={i} size={13} sub>{m}</Txt>)}
    </View>
  );
}

