// Location: src/screens/DemoHome.tsx
// Demo mode's home (F8): every feature, in the areas it is used in. A feature with a Training Show plays that
// animation; one without is simply opened live. The till is running on a copy of its own data while this is open (practice
// data only where it has none), so trying anything here touches nothing real.
import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Btn, Card, Page, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useNav, type Tab } from '../ui/nav';
import { useDemo } from '../state/demoSession';
import { entriesByArea, type DemoEntry } from '../lib/demoCatalog';
import { demoIntro } from '../lib/demoData';
import { SPOT } from '../lib/trainingSpots';
import { Enter } from '../ui/Motion';

export default function DemoHome() {
  const { c } = useTheme(); const nav = useNav(); const intro = demoIntro(useDemo(s => s.source));
  const open = (e: DemoEntry) => { if (e.tab) nav.setTab(e.tab as Tab); if (e.route) nav.push(e.route); };
  return (
    <Page title="Demo mode" onBack={nav.pop}>
      <View style={{ padding: 16, gap: 12 }}>
        <Card style={{ padding: 16, gap: 10, borderColor: c.accent, borderWidth: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}><Txt size={12} weight="700" color={c.onAccent}>DEMO MODE</Txt></View>
          </View>
          <Txt size={17} weight="700">Try the whole till, safely</Txt>
          <Txt sub>{intro.using}{intro.gaps ? ` ${intro.gaps}` : ''}</Txt>
          <Txt sub>{intro.rules} Watch a feature, or open it and have a go.</Txt>
          <Btn title="Leave demo mode" kind="secondary" icon="exit-outline" onPress={() => { useDemo.getState().leave(); nav.reset(); nav.setTab('more'); }} />
        </Card>
        {entriesByArea().map((g, gi) => (
          <View key={g.area} style={{ gap: 10, marginTop: gi ? 6 : 0 }}>
            <Txt size={13} weight="700" sub>{g.area.toUpperCase()}</Txt>
            {g.entries.map((e, ei) => (
              <Enter key={e.id} delay={Math.min(8, ei) * 40} distance={14}>
                <Card style={{ padding: 14, gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Ionicons name={e.icon as any} size={30} color={c.sub} />
                    <View style={{ flex: 1 }}><Txt size={16} weight="700">{e.title}</Txt><Txt size={13} sub>{e.summary}</Txt></View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {e.module ? <Btn spot={SPOT.demoWatch} title="Watch" icon="play" small style={{ flex: 1 }} onPress={() => nav.push('demoShow', { id: e.id })} /> : null}
                    {e.tab || e.route ? <Pressable onPress={() => open(e)} accessibilityRole="button" accessibilityLabel={`Open ${e.title}`} style={{ flex: 1, backgroundColor: c.fill, borderRadius: 999, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}><Ionicons name="open-outline" size={15} color={c.text} /><Txt weight="700">{e.module ? 'Try it' : 'Open'}</Txt></Pressable> : null}
                  </View>
                </Card>
              </Enter>
            ))}
          </View>
        ))}
      </View>
    </Page>
  );
}
