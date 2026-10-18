// Location: src/screens/DemoShow.tsx
// Plays one feature's Training Show inside Demo mode (F8). If the feature has no Show, it says so and offers to open it
// live instead. Nothing is real either way: Demo mode keeps the whole till on practice data.
import React from 'react';
import { View } from 'react-native';
import { Btn, Page, Txt } from '../ui/kit';
import { useNav, type Tab } from '../ui/nav';
import DemoPlayer from '../ui/DemoPlayer';
import { getDemoEntry, demoOf } from '../lib/demoCatalog';

export default function DemoShow() {
  const nav = useNav();
  const id = String(nav.stack[nav.stack.length - 1]?.params?.id ?? '');
  const entry = getDemoEntry(id); const demo = demoOf(entry);
  const open = () => { if (!entry) return; if (entry.tab) nav.setTab(entry.tab as Tab); if (entry.route) nav.push(entry.route); };
  if (!entry || !demo) return (
    <Page title={entry?.title ?? 'Demo'} onBack={nav.pop}>
      <View style={{ padding: 16, gap: 12 }}>
        <Txt sub>This feature has no animated demonstration. Open it and try it live: the till is on practice data, so nothing is real.</Txt>
        {entry && (entry.tab || entry.route) ? <Btn title="Open it" icon="open-outline" onPress={open} /> : null}
      </View>
    </Page>
  );
  return (
    <Page title={entry.title} onBack={nav.pop} scroll={false}>
      <DemoPlayer demo={demo} onDone={nav.pop} />
    </Page>
  );
}
