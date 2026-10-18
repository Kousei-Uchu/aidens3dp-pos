// Location: src/ui/DemoPlayer.tsx
// Plays one animated demonstration (a Training Show) at the person's own pace, with Back, Replay and Next.
// It is the same player the Show stage uses; Demo mode (F8) reuses it so its feature demos look and behave the same.
import React, { useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Btn, PageDots, Txt } from './kit';
import DemoView from './DemoView';
import { demoLayout } from '../lib/trainingDemo';
import type { Demo } from '../lib/trainingModule';

/** `label` is the small line above the words (for example "SHOW THE PROCESS"). `onDone` is what the last Next calls. */
export default function DemoPlayer({ demo, label = 'SHOW THE PROCESS', doneTitle = 'Done', onDone }: { demo: Demo; label?: string; doneTitle?: string; onDone?: () => void }) {
  const win = useWindowDimensions(); const side = demoLayout({ w: win.width, h: win.height }) === 'side';
  const last = demo.steps.length - 1; const [i, setI] = useState(0); const [replay, setReplay] = useState(0); const step = demo.steps[i];
  // The picture takes whatever room is left and the words and buttons are always on screen with it, so nothing needs
  // scrolling: beside the picture on a wide window, underneath it on a tall one.
  const words = (
    <ScrollView style={side ? { flex: 1 } : { maxHeight: 132, flexGrow: 0 }} contentContainerStyle={{ gap: 6 }} showsVerticalScrollIndicator={false}>
      <Txt size={13} weight="700" sub>{label}{step.title ? `  ·  ${step.title}` : ''}</Txt>
      <View accessibilityLiveRegion="polite"><Txt size={side ? 18 : 19} weight="600" style={{ lineHeight: side ? 25 : 27 }}>{step.say}</Txt></View>
    </ScrollView>
  );
  const controls = (
    <View style={{ gap: 12 }}>
      <PageDots count={demo.steps.length} index={i} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn title="Back" kind="secondary" disabled={i === 0} onPress={() => setI(i - 1)} style={{ flex: 1 }} />
        <Btn title="Replay" kind="secondary" onPress={() => setReplay(replay + 1)} style={{ flex: 1 }} />
        {i < last ? <Btn title="Next" onPress={() => setI(i + 1)} style={{ flex: 1 }} /> : <Btn title={doneTitle} onPress={onDone} style={{ flex: 1 }} />}
      </View>
    </View>
  );
  return (
    <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 12 }}>
      <View style={{ flex: 1, minWidth: side ? 320 : undefined, minHeight: 260 }}><DemoView demo={demo} index={i} replay={replay} /></View>
      <View style={side ? { width: '34%', minWidth: 260, maxWidth: 420, gap: 12 } : { width: '100%', gap: 12 }}>{words}{controls}</View>
    </View>
  );
}
