// Location: src/ui/AssistantGuide.tsx
// The pointer for "Guide me there" (patch 0162). While a guide is running it rings the control to tap next and says what to do in a small card.
// It never dims the screen and never takes a touch except on its own card, so the person can always tap anything else. The rules are in
// src/lib/assistantGuide.ts. It draws on the main screen only: a window is drawn above everything, so a screen that needs a tap inside a window is
// not offered a guide (see `walk` in src/lib/assistantScreens.ts).
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Btn, Txt } from './kit';
import { useTheme } from './theme';
import { useSpotlight } from './spotlight';
import { useNav } from './nav';
import { measureSpot, onSpotPressed, spotMounted } from './Spot';
import { useApp } from '../state/store';
import { DONE_SHOW_MS, GUIDE_MAX_MS, LOST_LINE, currentGuide, doneLine, guideView, guideVersion, pressedLast, progressLabel, stopGuide, subscribeGuide } from '../lib/assistantGuide';
import { grow, onScreen, placeBubble, scrollNeed, scrollSay, type Rect } from '../lib/trainingGeometry';

const CARD_W = 330; const CARD_H = 112; const POLL_MS = 400;

export default function AssistantGuideOverlay() {
  const { c } = useTheme(); const sp = useSpotlight(); const nav = useNav(); const win = useWindowDimensions(); const staffId = useApp(s => s.staffId);
  useSyncExternalStore(subscribeGuide, guideVersion, guideVersion);
  const g = currentGuide();
  const box = useRef<View>(null); const [origin, setOrigin] = useState({ x: 0, y: 0 }); const [size, setSize] = useState({ w: win.width, h: win.height });
  const [rect, setRect] = useState<Rect | null>(null); const [finished, setFinished] = useState(false); const [tick, setTick] = useState(0);

  // A new guide starts fresh, and ends by itself when someone else signs in or when it is left alone too long.
  const guideId = g ? `${g.screen}:${g.staffId ?? ''}` : '';
  useEffect(() => { setFinished(false); setRect(null); }, [guideId]);
  useEffect(() => { if (g && g.staffId !== undefined && g.staffId !== staffId) stopGuide(); }, [g, staffId]);
  useEffect(() => { if (!g) return undefined; const t = setTimeout(stopGuide, GUIDE_MAX_MS); return () => clearTimeout(t); }, [guideId]); // eslint-disable-line react-hooks/exhaustive-deps
  // What is on screen changes without any state of ours changing, so look again a few times a second.
  useEffect(() => { if (!g) return undefined; const t = setInterval(() => setTick(n => n + 1), POLL_MS); return () => clearInterval(t); }, [guideId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tapping the last control of a view ends its guide.
  useEffect(() => onSpotPressed(id => { const cur = currentGuide(); if (cur && pressedLast(cur, id)) setFinished(true); }), []);

  const view = g ? guideView(g, { mounted: spotMounted, tab: nav.tab, route: nav.stack.length ? nav.stack[nav.stack.length - 1].name : undefined, finished }) : null;
  const pointIndex = view?.kind === 'point' ? view.index : -1; const doneNow = view?.kind === 'done';
  useEffect(() => {
    if (!g || !view || view.kind !== 'point') { setRect(null); return undefined; }
    let on = true;
    box.current?.measureInWindow((x, y, w, h) => { if (on) { setOrigin({ x, y }); if (w > 0 && h > 0) setSize({ w, h }); } });
    void measureSpot(view.step.spot).then(r => { if (on) setRect(r); });
    return () => { on = false; };
  }, [tick, pointIndex, guideId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!doneNow) return undefined; const t = setTimeout(stopGuide, DONE_SHOW_MS); return () => clearTimeout(t); }, [doneNow, guideId]);

  if (!g || !view) return null;
  const local: Rect | null = rect ? { x: rect.x - origin.x, y: rect.y - origin.y, w: rect.w, h: rect.h } : null;
  const hole = view.kind === 'point' && onScreen(local, size) ? grow(local, 4) : null;
  const need = view.kind === 'point' && local && !hole ? scrollNeed(local, size) : null;
  const card = { w: Math.min(CARD_W, size.w - 24), h: CARD_H };
  const place = hole ? placeBubble(hole, size, card) : null;
  const left = place ? place.x : (size.w - card.w) / 2; const top = place ? place.y : size.h - card.h - 24;
  const line = view.kind === 'point' ? (need ? scrollSay(view.step.say, need) : view.step.say) : view.kind === 'done' ? doneLine(g.name) : LOST_LINE;

  return (
    <View ref={box} pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000 }]}>
      {hole ? <View pointerEvents="none" style={{ position: 'absolute', left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius: 14, borderWidth: 3, borderColor: sp.ring, shadowColor: sp.ring, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }} /> : null}
      <View accessibilityLiveRegion="polite" style={{ position: 'absolute', left, top, width: card.w, minHeight: card.h, backgroundColor: c.card, borderRadius: 16, borderWidth: 2, borderColor: sp.ring, padding: 12, gap: 6 }}>
        {view.kind === 'point' ? <Txt size={12} sub>{progressLabel(view.index, view.of)}</Txt> : null}
        <Txt weight="600">{line}</Txt>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}><Btn small kind="secondary" title={view.kind === 'done' ? 'OK' : 'Stop'} onPress={stopGuide} /></View>
      </View>
    </View>
  );
}
