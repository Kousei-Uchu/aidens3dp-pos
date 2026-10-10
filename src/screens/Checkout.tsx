// Location: src/screens/Checkout.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Btn, Chip, Empty, Field, IconBtn, Keypad, Money, Row, Segmented, Sheet, Txt, alertMsg, confirm, useToast } from '../ui/kit';
import { useLayout, useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { useCatalogue, usePriced, stockTone } from '../state/selectors';
import * as ops from '../lib/cartOps';
import { digitsToCents, fmt } from '../lib/money';
import { CheckChangeSheet } from './CheckChange';
import { ACTION_LABEL, type ActionId, type Tile } from '../lib/grid';
import { AddTileSheet, TileGrid, VariantPicker, commitGrid, gridOps, useTileLabel, type TileHandlers } from './Tiles';
import { LookupSheet } from './Lookup';
import { pickerCrumbs, pickerTitle } from '../lib/lookup';
import { TileSettingsSheet } from './TileSettings';
import { addTileAt, breadcrumbs, childTiles, isContainer, moveTileAt, removeTileAt, resolvePath, updateTileAt, viewTiles, type Path } from '../lib/gridNav';
import { CameraScanner, HidScanner } from './Scanner';
import { isGiftQr } from '../lib/giftCode';
import { SwitchStaffSheet } from './StaffLogin';
import { isBadgeCode } from '../lib/badge';
import { lockNow, signInWithPass } from '../lib/staffAuth';
import { CustomAmountSheet, CustomerSheet, DiscountSheet, GiftSellSheet } from './sheets';
import CartPane from './CartPane';
import { openSavedCart } from '../lib/savedOps';
import type { Variant } from '../lib/types';

const QTYS = [1, 2, 3, 5, 10];

export function StatusStrip() {
  const { c } = useTheme(); const { tablet } = useLayout(); const z = useApp(s => s.zeller); const sync = useApp(s => s.sync); const nav = useNav(); const queued = useApp(s => s.pos.outbox.length);
  const issues: { text: string; color: string; route: string }[] = [];
  if (!z.ready) issues.push({ text: 'Reader issue', color: c.bad, route: 'diagnostics' });
  if (sync.state === 'offline') issues.push({ text: queued ? `Offline · ${queued} queued` : 'Offline', color: c.warn, route: 'notifications' });
  else if (sync.state === 'error') issues.push({ text: `Sync issue${queued ? ` · ${queued} queued` : ''}`, color: c.warn, route: 'notifications' });
  // iPad: always show reader + sync state; iPhone: only when there is an issue
  if (!tablet && !issues.length) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
      {tablet && !issues.length ? <><Pill icon="card" text="Reader ready" color={c.good} /><Pill icon={sync.state === 'syncing' ? 'sync' : 'cloud-done'} text={sync.state === 'syncing' ? 'Syncing…' : 'Synced'} color={c.good} /></> : null}
      {issues.map(i => <Pressable key={i.text} onPress={() => nav.go(i.route)} accessibilityRole="button"><Pill icon="alert-circle" text={i.text} color={i.color} /></Pressable>)}
    </View>
  );
}
const Pill = ({ icon, text, color }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string; color: string }) =>
  <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: color + '22' }}><Ionicons name={icon} size={13} color={color} /><Txt size={12} weight="600" color={color}>{text}</Txt></View>;

export default function Checkout() {
  const { c } = useTheme(); const { tablet } = useLayout(); const nav = useNav(); const toast = useToast();
  const cart = useApp(s => s.pos.cart); const setCart = useApp(s => s.setCart); const grid = useApp(s => s.grid); const consolidate = useApp(s => s.settings.consolidate);
  const cat = useCatalogue(); const priced = usePriced(); const labelOf = useTileLabel();
  const staffList = useApp(s => s.settings.staff); const curStaff = useApp(s => s.settings.staff.find(x => x.id === s.staffId));
  const [tab, setTab] = useState<'keypad' | 'quick' | 'all'>('quick'); const [pageIdx, setPageIdx] = useState(0); const [editing, setEditing] = useState(false);
  const [path, setPath] = useState<Path>([]); const [editIdx, setEditIdx] = useState<number | null>(null); // path = where you are in nested categories/groups; editIdx = tile whose settings are open
  const [qty, setQty] = useState(1); const [digits, setDigits] = useState(''); const [variants, setVariants] = useState<Variant[] | null>(null);
  const [sheet, setSheet] = useState<'none' | 'custom' | 'gift' | 'discount' | 'customers' | 'add' | 'search' | 'pages' | 'staff' | 'price' | 'stock' | 'change'>('none'); const [cam, setCam] = useState(false);
  const [q, setQ] = useState(''); const [filter, setFilter] = useState<'all' | 'items' | 'customers' | 'discounts' | 'carts'>('all'); const [allQ, setAllQ] = useState('');
  const page = grid.pages[Math.min(pageIdx, grid.pages.length - 1)];
  const locked = !!cart.tenders?.length; const n = ops.itemCount(cart);

  const add = (v: Variant, count = qty) => {
    if (locked) return alertMsg('Payment in progress', 'Finish or cancel the payment before changing the cart.');
    setCart(cc => ops.addVariant(cc, v, count, consolidate)); setQty(1);
    if (v.stock !== null && v.stock - count < 0) toast.show(`${v.productTitle}: stock will go negative`); else toast.show(`Added ${v.productTitle}`);
  };
  const addItems = (vs: Variant[]) => (vs.length === 1 ? add(vs[0]) : setVariants(vs));
  const pick = (v: Variant) => { add(v); setVariants(null); }; // a tap in the variation picker adds it and goes back to where you were
  const onScan = (code: string): string | null => {
    if (isBadgeCode(code)) { void signInWithPass(code).then(r => toast.show(r.message)); return 'Pass scanned'; } // a cashier pass takes over the register; the cart stays
    const v = ops.findByBarcode(Object.values(useApp.getState().data.variants), code);
    if (!v) { toast.show(isGiftQr(code) ? 'That is a gift card. Redeem it from Charge ▸ Gift card.' : `No item for ${code}`); return null; }
    add(v, 1); return `Added ${v.productTitle}${v.variantTitle ? ' · ' + v.variantTitle : ''}`;
  };

  const handlers: TileHandlers = {
    onVariants: addItems,
    onDiscount: t => { const d = t.pct ? { kind: 'pct' as const, value: t.pct, label: t.label ?? `${t.pct}% off` } : t.amtCents ? { kind: 'amt' as const, value: t.amtCents, label: t.label ?? `${fmt(t.amtCents)} off` } : cat && useApp.getState().data.presets.find(p => p.label === t.code); if (d) setCart(cc => ops.setCartDiscount(cc, { kind: d.kind, value: d.value, label: d.label })); else alertMsg('Discount not found'); },
    onAction: (a: ActionId) => {
      switch (a) {
        case 'custom_amount': return setSheet('custom');
        case 'add_gift_card': return setSheet('gift');
        case 'clear_cart': return void (async () => { if (locked) return alertMsg('Payment in progress'); if (!cart.lines.length || await confirm('Clear cart?', 'All items will be removed.', 'Clear', true)) setCart(ops.emptyCart()); })();
        case 'create_item': return nav.push('createItem');
        case 'customers': return setSheet('customers');
        case 'discounts': case 'discount': return setSheet('discount');
        case 'saved_carts': return nav.push('saved');
        case 'switch_staff': return setSheet('staff');
        case 'lock_pos': { const d = lockNow(); if (!d.ok) alertMsg(d.title, d.message); return; } // success: the app shows the sign-in screen, the cart stays
        case 'price_check': return setSheet('price');
        case 'stock_check': return setSheet('stock');
        case 'check_change': return setSheet('change');
      }
    },
  };

  // where we are: the page's tiles, or inside nested categories / display groups (path = one tile index per level)
  const { nodes, valid } = useMemo(() => resolvePath(page?.tiles ?? [], path), [page, path]);
  useEffect(() => { if (valid.length !== path.length) setPath(valid); }, [valid, path.length]); // a synced layout change removed a level we were in
  const node = nodes[nodes.length - 1];
  useEffect(() => { setVariants(null); }, [tab, pageIdx, editing, valid.join('.')]); // the picker is a level of the grid: leaving this spot (tab, page, path, edit mode) closes it
  const nodeLabel = (t: (typeof nodes)[number]) => (t.type === 'category' ? t.label ?? cat.collections.find(x => x.id === t.collectionId)?.title ?? 'Category' : t.name);
  // editing shows only the tiles stored in the container (its collection's items are filled in when not editing)
  const tiles = !node ? page?.tiles ?? [] : editing ? childTiles(node) : viewTiles(node, cat.collections, pid => !!cat.byProduct[pid]);
  const crumbs = breadcrumbs(page?.name ?? 'Home', nodes, valid, nodeLabel);
  const trail = variants ? pickerCrumbs(crumbs, variants) : crumbs; // while choosing a variation the product is the last step of the path

  const edit = (f: (g: typeof grid) => typeof grid) => commitGrid(f);
  const editPage = (fn: (t: Tile[]) => Tile[]) => edit(g => ({ ...g, pages: g.pages.map(p => (p.id === page.id ? { ...p, tiles: fn(p.tiles) } : p)) }));
  const onRemove = (i: number) => editPage(t => removeTileAt(t, valid, i));
  const onMove = (i: number, d: -1 | 1) => editPage(t => moveTileAt(t, valid, i, i + d));
  const onAddTile = (t: Tile) => editPage(l => addTileAt(l, valid, t));
  const onOpen = (i: number) => { if (isContainer(tiles[i])) setPath([...valid, i]); };
  const editing_ = editIdx === null ? undefined : childOrPage()[editIdx];
  function childOrPage(): Tile[] { return node ? childTiles(node) : page?.tiles ?? []; }

  // search
  const results = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return { items: [], customers: [], discounts: [], carts: [] };
    const has = (s: string) => s.toLowerCase().includes(t);
    const seen = new Set<string>(); const items: Variant[] = [];
    for (const v of cat.list) if (has(`${v.productTitle} ${v.variantTitle} ${v.sku ?? ''} ${v.barcode ?? ''}`)) { if (items.length < 40) items.push(v); }
    void seen;
    return { items, customers: useApp.getState().data.customers.filter(cu => has(`${cu.name} ${cu.email ?? ''} ${cu.phone ?? ''}`)).slice(0, 15),
      discounts: useApp.getState().data.presets.filter(p => has(p.label)), carts: useApp.getState().pos.saved.filter(sc => sc.status === 'open' && has(`${sc.name} ${sc.note ?? ''} ${sc.cart.customer?.name ?? ''}`)) };
  }, [q, cat.list]);
  const show = (k: typeof filter) => filter === 'all' || filter === k;

  const allList = useMemo(() => { const t = allQ.trim().toLowerCase(); const seen = new Set<string>(); const out: Variant[] = [];
    for (const v of cat.list) { if (seen.has(v.productId)) continue; if (!t || `${v.productTitle} ${v.sku ?? ''} ${v.barcode ?? ''}`.toLowerCase().includes(t)) { seen.add(v.productId); out.push(v); } }
    return out.sort((a, b) => a.productTitle.localeCompare(b.productTitle)); }, [allQ, cat.list]);

  const left = (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: 54, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }}>
          <Pressable onPress={() => setSheet('search')} accessibilityRole="search" accessibilityLabel="Search" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.fill, borderRadius: 12, paddingHorizontal: 12, height: 40 }}>
            <Ionicons name="search" size={18} color={c.sub} /><Txt sub>Search items, customers, discounts</Txt></Pressable>
          {staffList.length ? <Pressable onPress={() => setSheet('staff')} accessibilityRole="button" accessibilityLabel={curStaff ? `Signed in as ${curStaff.name}. Switch staff` : 'Sign in'} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.fill, borderRadius: 12, paddingHorizontal: 10, height: 40, maxWidth: 140 }}>
            <Ionicons name="person-circle-outline" size={20} color={c.text} /><Txt size={13} weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>{curStaff?.name ?? 'Sign in'}</Txt></Pressable> : null}
          <IconBtn icon="barcode-outline" label="Scan with camera" onPress={() => setCam(true)} />
          {tab === 'quick' ? <IconBtn icon={editing ? 'checkmark-circle' : 'pencil'} label={editing ? 'Done editing' : 'Edit grid'} onPress={() => { setEditing(e => !e); setEditIdx(null); }} color={editing ? c.good : undefined} /> : null}
        </View>
        <View style={{ padding: 12, paddingBottom: 8 }}><Segmented value={tab} onChange={t => { setTab(t); setPath([]); setEditing(false); }} options={[{ v: 'keypad', label: 'Keypad' }, { v: 'quick', label: 'Quick Menu' }, { v: 'all', label: 'All products' }]} /></View>
        <StatusStrip />
      </View>

      {tab !== 'keypad' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Txt size={13} sub weight="600">Qty</Txt>{QTYS.map(x => <Chip key={x} label={`×${x}`} active={qty === x} onPress={() => setQty(x)} />)}</View> : null}

      {tab === 'keypad' ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Txt size={46} weight="700" style={{ textAlign: 'center', paddingVertical: 12 }}>{fmt(digitsToCents(digits))}</Txt>
          <Keypad big value={digits} onChange={setDigits} submitLabel={`Add ${fmt(digitsToCents(digits))}`} onSubmit={() => { if (locked) return alertMsg('Payment in progress'); setCart(cc => ops.addCustom(cc, digitsToCents(digits))); setDigits(''); toast.show('Custom amount added'); }} />
        </ScrollView>
      ) : null}

      {tab === 'quick' ? (
        <ScrollView>
          {node || variants ? <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: 8, gap: 4 }}>
            <IconBtn icon="chevron-back" label={variants ? 'Back to the grid' : 'Back one level'} onPress={() => (variants ? setVariants(null) : setPath(valid.slice(0, -1)))} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 6, paddingRight: 16 }} accessibilityRole="menu">
              {trail.map((cr, i) => i === trail.length - 1
                ? <Txt key={i} size={18} weight="700">{cr.label}</Txt>
                : <React.Fragment key={i}><Pressable onPress={() => { setVariants(null); setPath((cr as { path: Path }).path); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Go to ${cr.label}`}><Txt size={16} color={c.accent}>{cr.label}</Txt></Pressable><Txt size={16} sub>{'>'}</Txt></React.Fragment>)}
            </ScrollView></View>
            : grid.pages.length > 1 || editing ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 12 }}>
              {grid.pages.map((p, i) => <Chip key={p.id} label={p.name} active={i === pageIdx} onPress={() => (editing && i === pageIdx ? setSheet('pages') : (setPageIdx(i), setPath([])))} />)}
              {editing ? <Chip label="Pages" icon="settings-outline" onPress={() => setSheet('pages')} /> : null}</ScrollView> : null}
          {variants ? <VariantPicker variants={variants} onPick={pick} /> : <TileGrid tiles={tiles} editing={editing} handlers={handlers} onOpen={onOpen} onEdit={i => setEditIdx(i)}
            onRemove={onRemove} onMove={onMove} onAdd={() => setSheet('add')} emptyHint={node ? 'This one has no tiles or items yet. Tap the pencil to add some.' : undefined} />}
          {editing && node && !variants ? <Txt size={12} sub style={{ textAlign: 'center', paddingHorizontal: 16 }}>{node.type === 'category' || node.collectionId ? 'The items in its collection show after these tiles when you are not editing.' : 'Tap a tile to change its label, colour or contents.'}</Txt> : null}
          {editing && !variants ? <Txt size={12} sub style={{ textAlign: 'center', padding: 12 }}>Changes save automatically and sync to your other registers.</Txt> : null}
        </ScrollView>
      ) : null}

      {tab === 'all' ? (
        variants ? <ScrollView>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: 8, gap: 4 }}>
            <IconBtn icon="chevron-back" label="Back to all products" onPress={() => setVariants(null)} />
            <Txt size={16} sub>All products {'>'}</Txt><Txt size={18} weight="700" numberOfLines={1} style={{ flexShrink: 1 }}>{pickerTitle(variants)}</Txt>
          </View>
          <VariantPicker variants={variants} onPick={pick} />
        </ScrollView> : <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 12 }}><Field kind="search" placeholder="Filter products" value={allQ} onChangeText={setAllQ} style={{ marginBottom: 0 }} /></View>
          <FlatList data={allList} keyExtractor={v => v.productId} style={{ marginTop: 8 }} ListEmptyComponent={<Empty title="No products" sub="Import from Shopify in More ▸ Settings ▸ Shopify." />}
            renderItem={({ item: v }) => { const many = (cat.byProduct[v.productId]?.length ?? 1) > 1; const tone = stockTone(v); return (
              <Row image={v.image ?? null} title={v.productTitle} sub={many ? `${cat.byProduct[v.productId].length} variations` : v.stock === null ? undefined : `${v.stock} in stock`} onPress={() => addItems(many ? cat.byProduct[v.productId] : [v])}
                right={<View style={{ alignItems: 'flex-end' }}>{many ? <Txt sub size={13}>from</Txt> : null}<Money cents={Math.min(...cat.byProduct[v.productId].map(x => x.priceCents))} weight="600" color={tone === 'neg' ? c.bad : undefined} /></View>} />); }} />
        </View>
      ) : null}
      {toast.node}
    </View>
  );

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ flex: tablet ? 6 : 1 }}>
        {left}
        {!tablet && n > 0 ? (
          <Pressable onPress={() => nav.push('cart')} accessibilityRole="button" accessibilityLabel={`Cart, ${n} items, ${fmt(priced.netCents)}`} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line, padding: 12, paddingHorizontal: 16, gap: 12 }}>
            <Ionicons name="cart" size={22} color={c.text} /><Txt weight="700" style={{ flex: 1 }}>{n} item{n === 1 ? '' : 's'} · {fmt(priced.netCents)}</Txt>
            <View style={{ backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 10 }}><Txt weight="700" color={c.onAccent}>Charge</Txt></View>
          </Pressable>
        ) : null}
      </View>
      {tablet ? <View style={{ flex: 4, borderLeftWidth: 1, borderLeftColor: c.line }}><CartPane /></View> : null}

      <HidScanner enabled={nav.tab === 'checkout' && sheet === 'none' && !cam && nav.stack.length === 0} onScan={code => void onScan(code)} />
      <CameraScanner visible={cam} onClose={() => setCam(false)} onScan={onScan} />
      <SwitchStaffSheet visible={sheet === 'staff'} onClose={() => setSheet('none')} onSwitched={m => toast.show(m)} />
      <CustomAmountSheet visible={sheet === 'custom'} onClose={() => setSheet('none')} />
      <GiftSellSheet visible={sheet === 'gift'} onClose={() => setSheet('none')} />
      <DiscountSheet visible={sheet === 'discount'} onClose={() => setSheet('none')} current={cart.discount} title="Cart discount" onApply={d => setCart(cc => ops.setCartDiscount(cc, d))} />
      <CustomerSheet visible={sheet === 'customers'} onClose={() => setSheet('none')} onPick={cu => setCart(cc => ({ ...cc, customer: { id: cu.id, name: cu.name, email: cu.email, phone: cu.phone } }))} />
      <AddTileSheet visible={sheet === 'add'} onClose={() => setSheet('none')} onPick={onAddTile} />
      <TileSettingsSheet tile={editing_} onClose={() => setEditIdx(null)} onChange={t => editPage(l => updateTileAt(l, valid, editIdx!, () => t))} onRemove={() => { if (editIdx !== null) onRemove(editIdx); setEditIdx(null); }} onOpen={() => { if (editIdx !== null) setPath([...valid, editIdx]); }} />

      <LookupSheet mode="price" visible={sheet === 'price'} onClose={() => setSheet('none')} />
      <LookupSheet mode="stock" visible={sheet === 'stock'} onClose={() => setSheet('none')} />
      <CheckChangeSheet visible={sheet === 'change'} onClose={() => setSheet('none')} />
      <Sheet visible={sheet === 'pages'} onClose={() => setSheet('none')} title="Pages">
        {grid.pages.map((p, i) => <Row key={p.id} title={p.name} sub={`${p.tiles.length} tiles`} last={false}
          right={<View style={{ flexDirection: 'row' }}><IconBtn icon="arrow-up" label="Move earlier" onPress={() => edit(g => ({ ...g, pages: i > 0 ? (() => { const a = [...g.pages]; const [x] = a.splice(i, 1); a.splice(i - 1, 0, x); return a; })() : g.pages }))} /><IconBtn icon="arrow-down" label="Move later" onPress={() => edit(g => ({ ...g, pages: i < g.pages.length - 1 ? (() => { const a = [...g.pages]; const [x] = a.splice(i, 1); a.splice(i + 1, 0, x); return a; })() : g.pages }))} />
            <IconBtn icon="trash-outline" label="Delete page" color={c.bad} onPress={async () => { if (grid.pages.length < 2) return alertMsg('Keep at least one page'); if (await confirm('Delete page?', `“${p.name}” and its tiles will be removed.`, 'Delete', true)) { edit(g => gridOps.removePage(g, p.id)); setPageIdx(0); } }} /></View>} />)}
        <PageAdder onAdd={name => { edit(g => gridOps.addPage(g, name)); setPageIdx(grid.pages.length); }} onRename={name => edit(g => gridOps.renamePage(g, page.id, name))} currentName={page?.name ?? ''} />
      </Sheet>

      <Sheet visible={sheet === 'search'} onClose={() => { setSheet('none'); setQ(''); }} title="Search" full>
        <Field kind="search" placeholder="Search items, customers, discounts, saved carts" value={q} onChangeText={setQ} autoFocus />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
          {([['all', 'All'], ['items', 'Items'], ['customers', 'Customers'], ['discounts', 'Discounts'], ['carts', 'Saved carts']] as const).map(([k, l]) => <Chip key={k} label={l} active={filter === k} onPress={() => setFilter(k)} />)}</ScrollView>
        {show('items') && results.items.map(v => <Row key={v.id} image={v.image ?? null} title={v.productTitle + (v.variantTitle ? ` · ${v.variantTitle}` : '')} sub={[v.sku, v.barcode].filter(Boolean).join(' · ')} right={<Money cents={v.priceCents} weight="600" />} onPress={() => { add(v); setSheet('none'); setQ(''); }} />)}
        {show('customers') && results.customers.map(cu => <Row key={cu.id} icon="person-outline" title={cu.name || cu.email || 'Customer'} sub={[cu.email, cu.phone].filter(Boolean).join(' · ')} onPress={() => { setCart(cc => ({ ...cc, customer: { id: cu.id, name: cu.name, email: cu.email, phone: cu.phone } })); setSheet('none'); setQ(''); }} />)}
        {show('discounts') && results.discounts.map(d => <Row key={d.id} icon="pricetag-outline" title={d.label} onPress={() => { setCart(cc => ops.setCartDiscount(cc, { kind: d.kind, value: d.value, label: d.label })); setSheet('none'); setQ(''); }} />)}
        {show('carts') && results.carts.map(sc => <Row key={sc.id} icon="bookmark-outline" title={sc.name} sub={`${ops.itemCount(sc.cart)} items`} onPress={async () => { if (await openSavedCart(sc)) { setSheet('none'); setQ(''); } }} />)}
        {q.trim() && !results.items.length && !results.customers.length && !results.discounts.length && !results.carts.length ? <Empty title="No matches" /> : null}
      </Sheet>
    </View>
  );
}
function PageAdder({ onAdd, onRename, currentName }: { onAdd: (n: string) => void; onRename: (n: string) => void; currentName: string }) {
  const [name, setName] = useState('');
  return <View style={{ marginTop: 14 }}><Field kind="name" label="Page name" value={name} onChangeText={setName} placeholder={currentName || 'e.g. Drinks'} />
    <View style={{ flexDirection: 'row', gap: 8 }}><Btn title="Add page" kind="secondary" small disabled={!name.trim()} onPress={() => { onAdd(name.trim()); setName(''); }} style={{ flex: 1 }} /><Btn title="Rename current" kind="secondary" small disabled={!name.trim()} onPress={() => { onRename(name.trim()); setName(''); }} style={{ flex: 1 }} /></View></View>;
}
void ACTION_LABEL;
