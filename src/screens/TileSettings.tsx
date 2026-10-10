// Location: src/screens/TileSettings.tsx
// Per-tile settings in the grid editor: label, colour, and for categories and display groups the collection they show
// and the sub-categories inside them. Opened by tapping a tile while editing the grid.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Btn, Chip, Empty, Field, Row, Sheet, Txt } from '../ui/kit';
import { TILE_COLORS, useTheme } from '../ui/theme';
import { useCatalogue } from '../state/selectors';
import { childTiles, isContainer, withChildren } from '../lib/gridNav';
import type { Tile } from '../lib/grid';

type Mode = 'main' | 'collection' | 'sub' | 'subgroup';
const labelOfTile = (t: Tile, titleOf: (id: string) => string | undefined): string => {
  switch (t.type) {
    case 'category': return t.label ?? titleOf(t.collectionId) ?? 'Missing category';
    case 'group': return t.name;
    case 'item': return t.label ?? 'Item';
    case 'action': return t.label ?? t.action;
    case 'discount': return t.label ?? 'Discount';
  }
};

export function TileSettingsSheet({ tile, onClose, onChange, onRemove, onOpen }: { tile: Tile | undefined; onClose: () => void; onChange: (t: Tile) => void; onRemove: () => void; onOpen: () => void }) {
  const { c } = useTheme(); const cat = useCatalogue(); const [mode, setMode] = useState<Mode>('main'); const [q, setQ] = useState(''); const [name, setName] = useState('');
  const titleOf = (id: string) => cat.collections.find(x => x.id === id)?.title;
  const close = () => { setMode('main'); setQ(''); setName(''); onClose(); };
  const cols = (() => { const t = q.trim().toLowerCase(); return cat.collections.filter(x => !t || x.title.toLowerCase().includes(t)).slice(0, 60); })();
  const container = isContainer(tile) ? tile : undefined;
  const kids = container ? childTiles(container) : [];
  const setKids = (next: Tile[]) => container && onChange(withChildren(container, next));
  const title = mode === 'main' ? 'Tile settings' : mode === 'collection' ? 'Choose collection' : mode === 'sub' ? 'Add sub-category' : 'Add display group';

  return (
    <Sheet visible={!!tile} onClose={close} title={title} full>
      {tile && mode === 'main' ? <View>
        <Field kind="name" label={tile.type === 'group' ? 'Group name' : 'Label'} value={tile.type === 'group' ? tile.name : tile.label ?? ''} placeholder={tile.type === 'group' ? undefined : 'Leave empty to use the default'}
          onChangeText={v => onChange(tile.type === 'group' ? { ...tile, name: v } : { ...tile, label: v || undefined } as Tile)} />
        <Txt size={13} sub weight="600" style={{ marginBottom: 6 }}>Colour</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
          <Chip label="Default" active={!tile.color} onPress={() => onChange({ ...tile, color: undefined } as Tile)} />
          {TILE_COLORS.map(hex => <Pressable key={hex} onPress={() => onChange({ ...tile, color: hex } as Tile)} accessibilityRole="button" accessibilityLabel={`Colour ${hex}`} accessibilityState={{ selected: tile.color === hex }}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: hex, borderWidth: tile.color === hex ? 3 : 1, borderColor: tile.color === hex ? c.accent : c.line }} />)}
        </View>

        {tile.type === 'category' ? <Row icon="folder-outline" title="Shows items from" sub={titleOf(tile.collectionId) ?? 'Missing category'} onPress={() => setMode('collection')} /> : null}
        {tile.type === 'group' ? <Row icon="folder-outline" title="Acts like a collection" sub={tile.collectionId ? titleOf(tile.collectionId) ?? 'Missing category' : 'No, it only holds its own tiles'} onPress={() => setMode('collection')} /> : null}

        {container ? <View style={{ marginTop: 14 }}>
          <Txt size={13} sub weight="600" style={{ marginBottom: 4 }}>{container.type === 'category' ? 'Sub-categories and tiles inside' : 'Tiles inside'}</Txt>
          {kids.length ? kids.map((k, i) => <Row key={i} icon={k.type === 'category' ? 'folder-outline' : k.type === 'group' ? 'albums-outline' : 'cube-outline'} title={labelOfTile(k, titleOf)} sub={k.type === 'category' || k.type === 'group' ? `${childTiles(k).length} inside` : k.type}
            right={<Pressable onPress={() => setKids(kids.filter((_, x) => x !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${labelOfTile(k, titleOf)}`}><Ionicons name="remove-circle" size={24} color={c.bad} /></Pressable>} />)
            : <Txt size={13} sub style={{ paddingVertical: 8 }}>Nothing inside yet.</Txt>}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Btn title="Add sub-category" kind="secondary" small icon="folder-outline" onPress={() => setMode('sub')} style={{ flex: 1 }} />
            <Btn title="Add display group" kind="secondary" small icon="albums-outline" onPress={() => setMode('subgroup')} style={{ flex: 1 }} />
          </View>
          <Btn title="Open to edit its tiles" kind="secondary" icon="enter-outline" onPress={() => { onOpen(); close(); }} style={{ marginTop: 10 }} />
          <Txt size={12} sub style={{ marginTop: 8 }}>An item that is in a sub-category and also in this category only shows in the sub-category, however deep it is.</Txt>
        </View> : null}

        <Btn title="Remove tile" kind="danger" icon="trash-outline" onPress={() => { onRemove(); close(); }} style={{ marginTop: 18 }} />
      </View> : null}

      {tile && (mode === 'collection' || mode === 'sub') ? <View>
        <Field kind="search" placeholder="Search categories" value={q} onChangeText={setQ} />
        {mode === 'collection' && tile.type === 'group' ? <Row icon="close-circle-outline" title="None" sub="Only show this group's own tiles" onPress={() => { onChange({ ...tile, collectionId: undefined }); setMode('main'); setQ(''); }} /> : null}
        {cols.map(col => <Row key={col.id} image={col.image ?? null} title={col.title} sub={`${col.productIds.length} items`}
          onPress={() => {
            if (mode === 'collection') onChange({ ...tile, collectionId: col.id } as Tile);
            else if (container) setKids([...kids, { type: 'category', collectionId: col.id }]);
            setMode('main'); setQ('');
          }} />)}
        {!cols.length ? <Empty title="No categories" sub="Import from Shopify first." /> : null}
      </View> : null}

      {tile && mode === 'subgroup' && container ? <View>
        <Field kind="name" label="Group name" value={name} onChangeText={setName} placeholder="e.g. Plushies" />
        <Btn title="Create group" disabled={!name.trim()} onPress={() => { setKids([...kids, { type: 'group', name: name.trim(), tiles: [] }]); setName(''); setMode('main'); }} />
      </View> : null}
    </Sheet>
  );
}
