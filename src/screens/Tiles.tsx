// Location: src/screens/Tiles.tsx
import React, { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { Btn, Chip, Empty, Field, Money, Row, Sheet, Txt, alertMsg, confirm, tap } from '../ui/kit';
import { TILE_COLORS, useLayout, useTheme } from '../ui/theme';
import { useApp } from '../state/store';
import { useCatalogue, stockTone } from '../state/selectors';
import { ACTION_LABEL, ACTIONS, addPage, addTile, moveTile, removePage, removeTile, renamePage, type ActionId, type Tile } from '../lib/grid';
import { pushLayout } from '../lib/sync';
import { pickerVariants, stockText, stockToneOf } from '../lib/lookup';
import type { Variant } from '../lib/types';

const ACTION_ICON: Record<ActionId, React.ComponentProps<typeof Ionicons>['name']> = {
  custom_amount: 'calculator-outline', add_gift_card: 'gift-outline', clear_cart: 'trash-outline', create_item: 'add-circle-outline',
  customers: 'people-outline', discounts: 'pricetags-outline', discount: 'pricetag-outline', saved_carts: 'bookmarks-outline', switch_staff: 'person-circle-outline',
  lock_pos: 'lock-closed-outline', price_check: 'pricetag-outline', stock_check: 'layers-outline', check_change: 'cash-outline',
};

export type TileHandlers = { onAction: (a: ActionId) => void; onVariants: (vs: Variant[]) => void; onDiscount: (t: Extract<Tile, { type: 'discount' }>) => void };

export function useTileLabel() {
  const cat = useCatalogue(); const staffNow = useApp(s => s.settings.staff.find(x => x.id === s.staffId)); const staffCount = useApp(s => s.settings.staff.length);
  return (t: Tile): { label: string; sub?: string; icon?: React.ComponentProps<typeof Ionicons>['name']; stock?: ReturnType<typeof stockTone>; missing?: boolean; image?: string } => {
    switch (t.type) {
      case 'action':
        if (t.action === 'switch_staff') return { label: t.label ?? (staffNow ? staffNow.name : 'Sign in'), sub: staffCount ? (staffNow ? `${staffNow.role} · tap to switch` : 'Tap to sign in') : 'No staff set up', icon: ACTION_ICON[t.action] };
        return { label: t.label ?? ACTION_LABEL[t.action], icon: ACTION_ICON[t.action] };
      case 'category': { const col = cat.collections.find(c => c.id === t.collectionId); return { label: t.label ?? col?.title ?? 'Missing category', icon: 'folder-outline', missing: !col, image: col?.image, sub: t.subs?.length ? `${t.subs.length} inside` : col ? `${col.productIds.length} items` : undefined }; }
      case 'item': {
        const v = t.variantId ? cat.variants[t.variantId] : cat.byProduct[t.productId!]?.[0];
        if (!v) return { label: t.label ?? 'Missing item', missing: true };
        const many = !t.variantId && (cat.byProduct[v.productId]?.length ?? 0) > 1;
        return { label: t.label ?? (t.variantId && v.variantTitle ? `${v.productTitle} · ${v.variantTitle}` : v.productTitle), sub: many ? 'Choose variation' : undefined, stock: stockTone(v) };
      }
      case 'discount': return { label: t.label ?? (t.pct ? `${t.pct}% off` : t.amtCents ? `$${(t.amtCents / 100).toFixed(2)} off` : t.code ?? 'Discount'), icon: 'pricetag-outline' };
      case 'group': { const col = t.collectionId ? cat.collections.find(c => c.id === t.collectionId) : undefined; return { label: t.name, icon: 'albums-outline', image: col?.image, sub: `${t.tiles.length} tiles` }; }
    }
  };
}

export function TileView({ tile, idx, editing, onPress, onEdit, onRemove, onMove, color, size, count }: { tile: Tile; idx: number; editing: boolean; onPress: () => void; onEdit?: () => void; onRemove: () => void; onMove: (d: -1 | 1) => void; color: string; size: number; count: number }) {
  const { c } = useTheme(); const info = useTileLabel()(tile); const cat = useCatalogue();
  const v = tile.type === 'item' ? (tile.variantId ? cat.variants[tile.variantId] : cat.byProduct[tile.productId!]?.[0]) : undefined;
  const img = !info.missing ? (v?.image ?? info.image) : undefined; // item photo, or the collection image on category and group tiles
  return (
    <View style={{ width: size, height: size * 0.82, padding: 4 }}>
      <Pressable onPress={() => { tap(); if (editing) onEdit?.(); else onPress(); }} accessibilityRole="button" accessibilityLabel={`${info.label}${info.sub ? ', ' + info.sub : ''}`}
        style={({ pressed }) => ({ flex: 1, overflow: "hidden", borderRadius: 14, backgroundColor: info.missing ? c.fill : color, padding: 10, justifyContent: 'space-between', opacity: pressed ? 0.7 : 1, borderWidth: editing ? 1.5 : 0, borderColor: c.sub, borderStyle: editing ? 'dashed' : 'solid' })}>
        {img ? <Image source={{ uri: img }} resizeMode="cover" accessibilityIgnoresInvertColors style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14 }} /> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {info.icon ? <Ionicons name={info.icon} size={20} color="#111" /> : <View />}
          {info.stock && info.stock !== 'none' ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: info.stock === 'neg' ? '#DC2626' : info.stock === 'low' ? '#F59E0B' : '#16A34A' }} /> : null}
        </View>
        <View style={img ? { backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, margin: -4 } : undefined}><Txt size={14} weight="700" color="#111" numberOfLines={img ? 2 : 3}>{info.label}</Txt>{v && !info.sub ? <Money cents={v.priceCents} size={13} color="#374151" /> : info.sub ? <Txt size={12} color="#374151">{info.sub}</Txt> : null}</View>
      </Pressable>
      {editing ? <>
        <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${info.label}`} style={{ position: 'absolute', top: -2, left: -2 }}><Ionicons name="remove-circle" size={26} color="#DC2626" /></Pressable>
        <View style={{ position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', gap: 4 }}>
          {idx > 0 ? <Pressable onPress={() => onMove(-1)} hitSlop={6} accessibilityLabel="Move earlier"><Ionicons name="arrow-back-circle" size={24} color="#111" /></Pressable> : null}
          {idx < count - 1 ? <Pressable onPress={() => onMove(1)} hitSlop={6} accessibilityLabel="Move later"><Ionicons name="arrow-forward-circle" size={24} color="#111" /></Pressable> : null}
        </View></> : null}
    </View>
  );
}

/** Width of one square-ish tile, from the pane width and the tile size setting. Shared by the grid and the variation picker so they line up. */
export function useTileSize(): number {
  const { width, tablet } = useLayout(); const tileSize = useApp(s => s.settings.tileSize);
  const pane = tablet ? width * 0.6 : width; const target = tileSize === 'S' ? 96 : tileSize === 'L' ? 160 : 124; const cols = Math.max(2, Math.floor((pane - 16) / target));
  return (pane - 16) / cols;
}

const TONE_DOT: Record<ReturnType<typeof stockToneOf>, string | null> = { none: null, ok: '#16A34A', low: '#F59E0B', out: '#F59E0B', neg: '#DC2626' };
/**
 * The variation picker, drawn inside the grid area (a sub-page of it) instead of as a popup. One tile per variation:
 * photo, name, price and a stock line. Tapping one calls onPick. Out of stock and oversold stay tappable, because stock may go negative by design.
 */
export function VariantPicker({ variants, onPick }: { variants: Variant[]; onPick: (v: Variant) => void }) {
  const size = useTileSize(); const vs = pickerVariants(variants);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8 }}>
      {vs.map(v => { const tone = stockToneOf(v.stock); const dot = TONE_DOT[tone]; const name = v.variantTitle || 'Default'; return (
        <View key={v.id} style={{ width: size, height: size * 0.9, padding: 4 }}>
          <Pressable onPress={() => { tap(); onPick(v); }} accessibilityRole="button" accessibilityLabel={`${name}, ${stockText(v.stock)}`}
            style={({ pressed }) => ({ flex: 1, overflow: 'hidden', borderRadius: 14, backgroundColor: TILE_COLORS[3], padding: 10, justifyContent: 'space-between', opacity: pressed ? 0.7 : 1 })}>
            {v.image ? <Image source={{ uri: v.image }} resizeMode="cover" accessibilityIgnoresInvertColors style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14 }} /> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', minHeight: 9 }}>{dot ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: dot }} /> : null}</View>
            <View style={v.image ? { backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, margin: -4 } : undefined}>
              <Txt size={14} weight="700" color="#111" numberOfLines={2}>{name}</Txt>
              <Money cents={v.priceCents} size={13} color="#374151" />
              <Txt size={12} color={tone === 'neg' ? '#B91C1C' : tone === 'out' || tone === 'low' ? '#B45309' : '#374151'} numberOfLines={1}>{stockText(v.stock)}</Txt>
            </View>
          </Pressable>
        </View>); })}
      {!vs.length ? <Empty title="No variations" sub="This product has nothing to choose from." /> : null}
    </View>
  );
}

export function TileGrid({ tiles, editing, handlers, onRemove, onMove, onOpen, onEdit, onAdd, emptyHint }: {
  tiles: Tile[]; editing: boolean; handlers: TileHandlers; onRemove?: (i: number) => void; onMove?: (i: number, d: -1 | 1) => void; onOpen: (i: number) => void; onEdit?: (i: number) => void; onAdd?: () => void; emptyHint?: string;
}) {
  const { c } = useTheme(); const cat = useCatalogue(); const size = useTileSize();
  const press = (t: Tile, i: number) => {
    switch (t.type) {
      case 'action': return handlers.onAction(t.action);
      case 'category': case 'group': return onOpen(i);
      case 'discount': return handlers.onDiscount(t);
      case 'item': {
        const v = t.variantId ? cat.variants[t.variantId] : undefined; if (v) return handlers.onVariants([v]);
        const vs = cat.byProduct[t.productId!] ?? []; if (vs.length) handlers.onVariants(vs); else alertMsg('Item not found', 'It may have been removed from Shopify. Re-import or remove this tile.');
      }
    }
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8 }}>
      {tiles.map((t, i) => <TileView key={i} tile={t} idx={i} count={tiles.length} editing={editing} size={size} color={(t as any).color ?? TILE_COLORS[(t.type === 'category' ? 5 : t.type === 'action' ? 0 : t.type === 'discount' ? 4 : t.type === 'group' ? 6 : 3)]} onPress={() => press(t, i)} onEdit={() => onEdit?.(i)} onRemove={() => onRemove?.(i)} onMove={d => onMove?.(i, d)} />)}
      {editing && onAdd ? <View style={{ width: size, height: size * 0.82, padding: 4 }}><Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel="Add tile" style={{ flex: 1, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.sub, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="add" size={30} color={c.sub} /></Pressable></View> : null}
      {!tiles.length && !editing ? <Empty title={emptyHint ? 'Nothing here' : 'No tiles yet'} sub={emptyHint ?? 'Tap the pencil to edit the grid, or import your layout in Settings ▸ Grid.'} /> : null}
    </View>
  );
}

/** Add-tile picker used in Edit grid: Items, Categories, Display groups, Actions, Discounts. */
export function AddTileSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (t: Tile) => void }) {
  const cat = useCatalogue(); const presets = useApp(s => s.data.presets); const [mode, setMode] = useState<'menu' | 'items' | 'cats' | 'actions' | 'discounts' | 'group'>('menu'); const [q, setQ] = useState(''); const [groupName, setGroupName] = useState('');
  const items = useMemo(() => { const t = q.trim().toLowerCase(); const seen = new Set<string>(); const out: Variant[] = []; for (const v of cat.list) { if (seen.has(v.productId)) continue; if (!t || `${v.productTitle} ${v.sku ?? ''} ${v.barcode ?? ''}`.toLowerCase().includes(t)) { seen.add(v.productId); out.push(v); if (out.length > 60) break; } } return out; }, [q, cat.list]);
  const close = () => { setMode('menu'); setQ(''); onClose(); };
  const pick = (t: Tile) => { onPick(t); close(); };
  return (
    <Sheet visible={visible} onClose={close} title={mode === 'menu' ? 'Add to grid' : mode === 'items' ? 'Items' : mode === 'cats' ? 'Categories' : mode === 'actions' ? 'Actions' : mode === 'discounts' ? 'Discounts' : 'Display group'} full>
      {mode === 'menu' ? <View>
        <Row icon="cube-outline" title="Items" onPress={() => setMode('items')} /><Row icon="folder-outline" title="Categories" onPress={() => setMode('cats')} />
        <Row icon="albums-outline" title="Display groups" onPress={() => setMode('group')} /><Row icon="flash-outline" title="Actions" onPress={() => setMode('actions')} /><Row icon="pricetag-outline" title="Discounts" last onPress={() => setMode('discounts')} /></View> : null}
      {mode === 'items' ? <View><Field kind="search" placeholder="Search items" value={q} onChangeText={setQ} />{items.map(v => <Row key={v.productId} image={v.image ?? null} title={v.productTitle} sub={(cat.byProduct[v.productId]?.length ?? 1) > 1 ? `${cat.byProduct[v.productId].length} variations` : undefined} onPress={() => pick({ type: 'item', productId: v.productId })} />)}</View> : null}
      {mode === 'cats' ? <View>{cat.collections.map(col => <Row key={col.id} image={col.image ?? null} title={col.title} sub={`${col.productIds.length} items`} onPress={() => pick({ type: 'category', collectionId: col.id })} />)}{!cat.collections.length ? <Empty title="No categories" sub="Import from Shopify first." /> : null}</View> : null}
      {mode === 'actions' ? <View>{ACTIONS.map(a => <Row key={a} title={ACTION_LABEL[a]} icon={ACTION_ICON[a]} onPress={() => pick({ type: 'action', action: a })} />)}</View> : null}
      {mode === 'discounts' ? <View>{presets.map(p => <Row key={p.id} title={p.label} onPress={() => pick({ type: 'discount', code: p.label, pct: p.kind === 'pct' ? p.value : undefined, amtCents: p.kind === 'amt' ? p.value : undefined, label: p.label })} />)}{!presets.length ? <Empty title="No discount codes" sub="Create discount codes in Shopify, then re-import." /> : null}</View> : null}
      {mode === 'group' ? <View><Field kind="name" label="Group name" value={groupName} onChangeText={setGroupName} placeholder="e.g. Plushies" /><Btn title="Create group" disabled={!groupName.trim()} onPress={() => { pick({ type: 'group', name: groupName.trim(), tiles: [] }); setGroupName(''); }} /></View> : null}
    </Sheet>
  );
}

/** Edit-grid helpers: apply a grid transform, auto-save, push to the other registers (debounced). */
let pushT: any;
export const commitGrid = (f: (g: ReturnType<typeof useApp.getState>['grid']) => ReturnType<typeof useApp.getState>['grid']) => {
  const s = useApp.getState(); s.setGrid(f(s.grid)); clearTimeout(pushT); pushT = setTimeout(() => { void pushLayout().catch(() => {}); }, 1500);
};
export const gridOps = { addPage, addTile, moveTile, removePage, removeTile, renamePage };
void Chip; void ScrollView; void confirm;
