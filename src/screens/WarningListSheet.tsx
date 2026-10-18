// Location: src/screens/WarningListSheet.tsx
// The warning list: warnings set to "Add to the list" (Settings ▸ Cart warnings) were recorded here instead of being
// shown on Charge, so someone can read them later - "someone bought an item from a fixed number display, put another
// out". Opened from a Quick Menu tile or the cart menu; the list is shared between registers.
import React from 'react';
import { ScrollView, View } from 'react-native';
import { Btn, Empty, Sheet, Txt } from '../ui/kit';
import { SPOT } from '../lib/trainingSpots';
import { useTheme } from '../ui/theme';
import { useApp } from '../state/store';
import { clearWarningList } from '../lib/sync';

export default function WarningListSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { c } = useTheme();
  const list = (useApp(s => s.settings.warningList) ?? []).slice();
  list.sort((a, b) => b.ts.localeCompare(a.ts));
  return (
    <Sheet visible={visible} onClose={onClose} title="Warnings list" full screen="sheet_warning_list">
      <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
        {list.length === 0 ? <Empty title="No warnings" sub="Lines added when a sale is paid will show here." /> : list.map(e => (
          <View key={e.id} style={{ borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: 12, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt size={16} weight="700">{e.title}</Txt>
              <Txt size={12} sub>{tryTime(e.ts)}</Txt>
            </View>
            <Txt size={15} style={{ lineHeight: 22 }}>{e.message}</Txt>
            {e.items.length ? <Txt size={12} sub>Items: {e.items.join(', ')}</Txt> : null}
          </View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        <Btn title="Done" kind="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Btn spot={SPOT.warningListOpen} title="Clear list" kind="ghost" disabled={!list.length} onPress={() => void clearWarningList().catch(() => {})} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

function tryTime(ts: string) {
  try { return new Date(ts).toLocaleString(); } catch { return ''; }
}
