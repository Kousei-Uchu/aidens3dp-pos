// Location: src/screens/Checkout.tsx
import { registerSlice, spotPressed, useSpotRef } from '../ui/Spot';
import { clearProbe, registerCheckoutReset, setProbe } from '../lib/trainingProbe';
import { SPOT, allProductSpot, findTabSpot, gridPageSpot, searchResultSpot } from '../lib/trainingSpots';
import { Spot } from '../ui/Spot';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Btn, Chip, Empty, Field, HelpButton, IconBtn, Keypad, Money, Row, Segmented, Sheet, Txt, alertMsg, confirm, useToast } from '../ui/kit';
import { useLayout, useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { useCatalogue, usePriced, stockTone } from '../state/selectors';
import * as ops from '../lib/cartOps';
import { digitsToCents, fmt } from '../lib/money';
import { CheckChangeSheet } from './CheckChange';
import WarningListSheet from './WarningListSheet';
import { ACTION_LABEL, type ActionId, type Tile } from '../lib/grid';
import { AddTileSheet, TileGrid, VariantPicker, commitGrid, gridOps, useTileLabel, type TileHandlers } from './Tiles';
import { LookupSheet } from './Lookup';
import { pickerCrumbs, pickerTitle, resolveScan } from '../lib/lookup';
import { TileSettingsSheet } from './TileSettings';
import { addTileAt, breadcrumbs, childTiles, isContainer, moveTileAt, removeTileAt, resolvePath, updateTileAt, viewTiles, type Path } from '../lib/gridNav';
import { CameraScanner, HidScanner } from './Scanner';
import ScanPane from '../ui/ScanPane';
import { POPUP_GONE_MS } from '../lib/scanFeedback';
import { getCartScan, useCartScanBlocked } from '../lib/scanBridge';
import { onScanFlush } from '../lib/scanFocus';
import { SwitchStaffSheet } from './StaffLogin';
import { lockNow, signInWithPass } from '../lib/staffAuth';
import { CustomAmountSheet, CustomerSheet, DiscountSheet, GiftSellSheet } from './sheets';
import CartPane from './CartPane';
import { openSavedCart } from '../lib/savedOps';
import type { Variant } from '../lib/types';

/** `guided`: the guided checkout (Minimal mode) embeds this as its Items step, without the cart pane, staff chip, grid editing or keypad. `active`: false while another step is showing, so the Bluetooth scanner stays quiet. */
export default function Checkout({ guided = false, active = true }: { guided?: boolean; active?: boolean } = {}) {
  const { c } = useTheme(); const { tablet } = useLayout(); const nav = useNav(); const toast = useToast(); const cartBlocked = useCartScanBlocked(); const openRef = useSpotRef(SPOT.cartOpen); const searchRef = useSpotRef(SPOT.findSearch); const chargeRef = useSpotRef(SPOT.cartCharge);
  const cart = useApp(s => s.pos.cart); const setCart = useApp(s => s.setCart); const grid = useApp(s => s.grid); const consolidate = useApp(s => s.settings.consolidate);
  const cat = useCatalogue(); const priced = usePriced(); const labelOf = useTileLabel();
  const staffList = useApp(s => s.settings.staff); const curStaff = useApp(s => s.settings.staff.find(x => x.id === s.staffId));
  const spotlightOptions = useApp(s => s.settings.itemSpotlight);
  const [tab, setTab] = useState<'keypad' | 'quick' | 'all'>('quick'); const [pageIdx, setPageIdx] = useState(0); const [editing, setEditing] = useState(false);
  const [path, setPath] = useState<Path>([]); const [editIdx, setEditIdx] = useState<number | null>(null); // path = where you are in nested categories/groups; editIdx = tile whose settings are open
  const [digits, setDigits] = useState(''); const [variants, setVariants] = useState<Variant[] | null>(null);
  const [sheet, setSheet] = useState<'none' | 'custom' | 'gift' | 'discount' | 'customers' | 'add' | 'search' | 'pages' | 'staff' | 'price' | 'stock' | 'change'>('none'); const [cam, setCam] = useState(false);
  const [q, setQ] = useState(''); const [filter, setFilter] = useState<'all' | 'items' | 'customers' | 'discounts' | 'carts'>('all'); const [allQ, setAllQ] = useState('');
  const [spotlightItem, setSpotlightItem] = useState<Variant | null>(null);
  const [warnList, setWarnList] = useState(false); // the queued warnings list (tile: Warnings list)
  // A barcode that arrives while this screen's scan box is unmounted (the screensaver was up, or the camera sheet was open
  // when the scan landed) is handed to onScan from here, S3. A ref keeps that registration from re-running on every render.
  const scanNow = React.useRef<(code: string) => void>(() => {});
  const deferredScans = React.useRef<string[]>([]);
  const busy = React.useRef(false); busy.current = cam;
  useEffect(() => onScanFlush(code => scanNow.current(code)), []);
  // Training (B6): let it see the tab, depth and typed text, point at one tab of the switch, and start a practice run from a clean Checkout.
  useEffect(() => { setProbe({ search: sheet === 'search' ? q : '', keypad: digits }, { tab, depth: path.length, sizes: !!variants }); }, [sheet, q, digits, tab, path, variants]);
  useEffect(() => () => clearProbe(), []);
  useEffect(() => { const off = (['keypad', 'quick', 'all'] as const).map((t, i) => registerSlice(findTabSpot(t), SPOT.findTabs, i, 3)); return () => off.forEach(f => f()); }, []);
  useEffect(() => registerCheckoutReset(() => { setTab('quick'); setPageIdx(0); setEditing(false); setPath([]); setEditIdx(null); setDigits(''); setVariants(null); setSheet('none'); setCam(false); setQ(''); setAllQ(''); setSpotlightItem(null); }), []);
  const spotlightTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const page = grid.pages[Math.min(pageIdx, grid.pages.length - 1)];
  const locked = !!cart.tenders?.length; const n = ops.itemCount(cart);
  useEffect(() => () => { if (spotlightTimer.current) clearTimeout(spotlightTimer.current); }, []);
  // S5: the popup fills the inner left pane for a few seconds. `spotlightItem` carries the variant, `spotlightAt` the
  // moment it arrived, so the fade is measured from the scan rather than from the render. A keyboard scan raises it too
  // (it is the same "Added" confirmation the tap path shows), except while the camera and its own popup are up.
  const [spotlightAt, setSpotlightAt] = useState(0);
  const showSpotlight = (v: Variant) => {
    if (busy.current) return; // the camera sheet has its own popup (S4), the pane popup is for the grid behind it
    setSpotlightItem(v); setSpotlightAt(Date.now());
    if (spotlightTimer.current) clearTimeout(spotlightTimer.current);
    spotlightTimer.current = setTimeout(() => setSpotlightItem(null), POPUP_GONE_MS);
  };
  const clearSpotlight = () => { if (spotlightTimer.current) clearTimeout(spotlightTimer.current); setSpotlightItem(null); };

  const add = (v: Variant, count = 1) => {
    if (locked) return alertMsg('Payment in progress', 'Finish or cancel the payment before changing the cart.');
    setCart(cc => ops.addVariant(cc, v, count, consolidate));
    showSpotlight(v);
    if (v.stock !== null && v.stock - count < 0) toast.show(`${v.productTitle}: stock will go negative`); else toast.show(`Added ${v.productTitle}`);
  };
  const addItems = (vs: Variant[]) => (vs.length === 1 ? add(vs[0]) : setVariants(vs));
  const pick = (v: Variant) => { add(v); }; // a tap in the variation picker adds it and stays on the picker, so several variations can be added in a row; the back arrow or the path leaves it
  // One scan box, one order: an item (barcode, then SKU), a cashier pass, a gift card, a saved discount, else nothing (see resolveScan).
  const onScan = (code: string): string | null => {
    // S4/S5: while the camera and its scan popup are up, the pane is theirs, so a keyboard scan must not flash the grid
    // spotlight behind them. Code that arrives with no box mounted waits in `deferredScans` and runs when the camera closes.
    if (busy.current) { deferredScans.current.push(code); return null; }
    const st = useApp.getState();
    const r = resolveScan(code, Object.values(st.data.variants), st.data.presets);
    switch (r.kind) {
      case 'variant': add(r.variant, 1); return `Added ${r.variant.productTitle}${r.variant.variantTitle ? ' · ' + r.variant.variantTitle : ''}`;
      case 'pass': void signInWithPass(code).then(x => toast.show(x.message)); return 'Pass scanned'; // a cashier pass takes over the register; the cart stays
      case 'gift': { const cartScan = getCartScan(); if (cartScan) return cartScan.scan(code); toast.show('That is a gift card. Redeem it from Charge ▸ Gift card.'); return null; }
      case 'discount': {
        const cartScan = getCartScan(); if (cartScan) return cartScan.scan(code);
        if (locked) { alertMsg('Payment in progress', 'Finish or cancel the payment before changing the cart.'); return null; }
        setCart(cc => ops.setCartDiscount(cc, { kind: r.preset.kind, value: r.preset.value, label: r.preset.label })); toast.show(`Discount applied: ${r.preset.label}`); return 'Discount applied';
      }
      default: toast.show(`No item for ${code.trim()}`); return null;
    }
  };
  scanNow.current = code => { void onScan(code); };
  // Closing the camera is also when anything that arrived while it was up (the deferred scans) runs.
  const closeCam = () => {
    setCam(false); busy.current = false;
    const waiting = deferredScans.current; deferredScans.current = [];
    for (const code of waiting) void onScan(code);
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
        case 'warning_list': return setWarnList(true);
        default: return;
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
      <View style={{ paddingTop: 8, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }}>
          <Pressable ref={searchRef} onPress={() => { spotPressed(SPOT.findSearch); setSheet('search'); }} accessibilityRole="search" accessibilityLabel="Search" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.fill, borderRadius: 12, paddingHorizontal: 12, height: 40 }}>
            <Ionicons name="search" size={18} color={c.sub} /><Txt sub>Search items, customers, discounts</Txt></Pressable>
          {staffList.length && !guided ? <Pressable onPress={() => setSheet('staff')} accessibilityRole="button" accessibilityLabel={curStaff ? `Signed in as ${curStaff.name}. Switch staff` : 'Sign in'} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.fill, borderRadius: 12, paddingHorizontal: 10, height: 40, maxWidth: 140 }}>
            <Ionicons name="person-circle-outline" size={20} color={c.text} /><Txt size={13} weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>{curStaff?.name ?? 'Sign in'}</Txt></Pressable> : null}
          <IconBtn icon="barcode-outline" label="Scan with camera" onPress={() => setCam(true)} spot={SPOT.scanCamera} />
          {!guided ? <HelpButton id="sales" label="Checkout help" /> : null}
          {tab === 'quick' && !guided ? <IconBtn icon={editing ? 'checkmark-circle' : 'pencil'} label={editing ? 'Done editing' : 'Edit grid'} onPress={() => { setEditing(e => !e); setEditIdx(null); }} color={editing ? c.good : undefined} /> : null}
        </View>
        <Spot id={SPOT.findTabs} style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}><Segmented value={tab} onChange={t => { spotPressed(findTabSpot(t)); setTab(t); setPath([]); setEditing(false); }} options={guided ? [{ v: 'quick', label: 'Quick Menu' }, { v: 'all', label: 'All products' }] : [{ v: 'keypad', label: 'Keypad' }, { v: 'quick', label: 'Quick Menu' }, { v: 'all', label: 'All products' }]} /></Spot>
      </View>


      {tab === 'keypad' ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Txt size={46} weight="700" style={{ textAlign: 'center', paddingVertical: 12 }}>{fmt(digitsToCents(digits))}</Txt>
          <Keypad big keysSpot={SPOT.findKeypad} submitSpot={SPOT.findKeypadAdd} value={digits} onChange={setDigits} submitLabel={`Add ${fmt(digitsToCents(digits))}`} onSubmit={() => { if (locked) return alertMsg('Payment in progress'); setCart(cc => ops.addCustom(cc, digitsToCents(digits))); setDigits(''); toast.show('Custom amount added'); }} />
        </ScrollView>
      ) : null}

      {tab === 'quick' ? (
        <ScrollView>
          {node || variants ? <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingLeft: 8, gap: 4 }}>
            <IconBtn icon="chevron-back" label={variants ? 'Back to the grid' : 'Back one level'} spot={SPOT.findBack} onPress={() => (variants ? setVariants(null) : setPath(valid.slice(0, -1)))} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 6, paddingRight: 16 }} accessibilityRole="menu">
              {trail.map((cr, i) => i === trail.length - 1
                ? <Txt key={i} size={18} weight="700">{cr.label}</Txt>
                : <React.Fragment key={i}><Pressable onPress={() => { setVariants(null); setPath((cr as { path: Path }).path); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Go to ${cr.label}`}><Txt size={16} color={c.accent}>{cr.label}</Txt></Pressable><Txt size={16} sub>{'>'}</Txt></React.Fragment>)}
            </ScrollView></View>
            : grid.pages.length > 1 || editing ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 12 }}>
              {grid.pages.map((p, i) => <Chip key={p.id} label={p.name} spot={gridPageSpot(p.id)} active={i === pageIdx} onPress={() => (editing && i === pageIdx ? setSheet('pages') : (setPageIdx(i), setPath([])))} />)}
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
            <IconBtn icon="chevron-back" label="Back to all products" spot={SPOT.findBack} onPress={() => setVariants(null)} />
            <Txt size={16} sub>All products {'>'}</Txt><Txt size={18} weight="700" numberOfLines={1} style={{ flexShrink: 1 }}>{pickerTitle(variants)}</Txt>
          </View>
          <VariantPicker variants={variants} onPick={pick} />
        </ScrollView> : <View style={{ flex: 1 }}>
          <Spot id={SPOT.findFilter} style={{ paddingHorizontal: 12 }}><Field kind="search" placeholder="Filter products" value={allQ} onChangeText={setAllQ} style={{ marginBottom: 0 }} /></Spot>
          <FlatList data={allList} keyExtractor={v => v.productId} style={{ marginTop: 8 }} ListEmptyComponent={<Empty title="No products" sub="Import from Shopify in More ▸ Settings ▸ Shopify." />}
            renderItem={({ item: v }) => { const many = (cat.byProduct[v.productId]?.length ?? 1) > 1; const tone = stockTone(v); return (
              <Row spot={allProductSpot(v.productId)} image={v.image ?? null} title={v.productTitle} sub={many ? `${cat.byProduct[v.productId].length} variations` : v.stock === null ? undefined : `${v.stock} in stock`} onPress={() => addItems(many ? cat.byProduct[v.productId] : [v])}
                right={<View style={{ alignItems: 'flex-end' }}>{many ? <Txt sub size={13}>from</Txt> : null}<Money cents={Math.min(...cat.byProduct[v.productId].map(x => x.priceCents))} weight="600" color={tone === 'neg' ? c.bad : undefined} /></View>} />); }} />
        </View>
      ) : null}
      {toast.node}
    </View>
  );

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ flex: tablet && !guided ? 6 : 1 }}>
        {spotlightItem ? <ScanPane item={spotlightItem} params={spotlightOptions} startedAt={spotlightAt} onDismiss={clearSpotlight} /> : left}
        {!tablet && !guided && n > 0 ? (
          <Pressable ref={openRef} onPress={() => { spotPressed(SPOT.cartOpen); nav.push('cart'); }} accessibilityRole="button" accessibilityLabel={`Cart, ${n} items, ${fmt(priced.netCents)}`} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line, padding: 12, paddingHorizontal: 16, gap: 12 }}>
            <Ionicons name="cart" size={22} color={c.text} /><Txt weight="700" style={{ flex: 1 }}>{n} item{n === 1 ? '' : 's'} · {fmt(priced.netCents)}</Txt>
            <View ref={chargeRef} collapsable={false} style={{ backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 10 }}><Txt weight="700" color={c.onAccent}>Charge</Txt></View>
          </Pressable>
        ) : null}
      </View>
      {tablet && !guided ? <View style={{ flex: 4, borderLeftWidth: 1, borderLeftColor: c.line }}><CartPane hid={false} /></View> : null}

      <HidScanner enabled={active && nav.tab === 'checkout' && sheet === 'none' && !cam && !cartBlocked && nav.stack.length === 0} onScan={code => void onScan(code)} />
      <CameraScanner visible={cam} onClose={closeCam} onScan={onScan} />
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
      <WarningListSheet visible={warnList} onClose={() => setWarnList(false)} />
      <Sheet visible={sheet === 'pages'} onClose={() => setSheet('none')} title="Pages">
        {grid.pages.map((p, i) => <Row key={p.id} title={p.name} sub={`${p.tiles.length} tiles`} last={false}
          right={<View style={{ flexDirection: 'row' }}><IconBtn icon="arrow-up" label="Move earlier" onPress={() => edit(g => ({ ...g, pages: i > 0 ? (() => { const a = [...g.pages]; const [x] = a.splice(i, 1); a.splice(i - 1, 0, x); return a; })() : g.pages }))} /><IconBtn icon="arrow-down" label="Move later" onPress={() => edit(g => ({ ...g, pages: i < g.pages.length - 1 ? (() => { const a = [...g.pages]; const [x] = a.splice(i, 1); a.splice(i + 1, 0, x); return a; })() : g.pages }))} />
            <IconBtn icon="trash-outline" label="Delete page" color={c.bad} onPress={async () => { if (grid.pages.length < 2) return alertMsg('Keep at least one page'); if (await confirm('Delete page?', `“${p.name}” and its tiles will be removed.`, 'Delete', true)) { edit(g => gridOps.removePage(g, p.id)); setPageIdx(0); } }} /></View>} />)}
        <PageAdder onAdd={name => { edit(g => gridOps.addPage(g, name)); setPageIdx(grid.pages.length); }} onRename={name => edit(g => gridOps.renamePage(g, page.id, name))} currentName={page?.name ?? ''} />
      </Sheet>

      <Sheet visible={sheet === 'search'} onClose={() => { setSheet('none'); setQ(''); }} title="Search" full>
        <Spot id={SPOT.searchField}><Field kind="search" placeholder="Search items, customers, discounts, saved carts" value={q} onChangeText={setQ} autoFocus /></Spot>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
          {([['all', 'All'], ['items', 'Items'], ['customers', 'Customers'], ['discounts', 'Discounts'], ['carts', 'Saved carts']] as const).map(([k, l]) => <Chip key={k} label={l} active={filter === k} onPress={() => setFilter(k)} />)}</ScrollView>
        {show('items') && results.items.map(v => <Row key={v.id} spot={searchResultSpot(v.id)} image={v.image ?? null} title={v.productTitle + (v.variantTitle ? ` · ${v.variantTitle}` : '')} sub={[v.sku, v.barcode].filter(Boolean).join(' · ')} right={<Money cents={v.priceCents} weight="600" />} onPress={() => { add(v); setSheet('none'); setQ(''); }} />)}
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
