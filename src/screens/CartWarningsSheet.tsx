// Location: src/screens/CartWarningsSheet.tsx
// "Customer warning": shown by Charge before payment (normal and guided checkout) when the cart holds an item or category
// that has a warning set in Settings ▸ Cart warnings, or when a warning is set to always show.
// The popup IS the warning: its header is the warning's header and its message is the popup's main text. With several warnings it is one popup
// paged like the Show stage (dots at the bottom, Back and Next, Next becomes Continue to payment on the last one).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Btn, PageDots, Sheet, Txt } from '../ui/kit';
import { useUi } from '../ui/uiProfile';
import { SPOT } from '../lib/trainingSpots';
import { useTheme } from '../ui/theme';
import { useApp } from '../state/store';
import { useCatalogue } from '../state/selectors';
import { matchCartWarnings, pendingCartWarnings, triggerNames, unacknowledged, warningKey, warningTitle, type MatchedCartWarning } from '../lib/cartWarnings';

/**
 * Charge uses this to decide whether to stop at the warnings first. `pages` is what would be shown right now; `markSeen`
 * remembers the ones the cashier carried on from, so a warning is not asked again on the same sale unless it changes
 * (a warning set to always show is the exception: it comes up on every press of Charge).
 */
export function useCartWarningGate() {
  const cart = useApp(s => s.pos.cart); const warnings = useApp(s => s.settings.cartWarnings); const cat = useCatalogue();
  const [open, setOpen] = useState(false); const [seen, setSeen] = useState<string[]>([]);
  const pages = useMemo(() => pendingCartWarnings(matchCartWarnings(cart, warnings, cat), seen), [cart, warnings, cat, seen]);
  const markSeen = () => setSeen(s => Array.from(new Set([...s, ...pages.map(warningKey)])));
  const reset = () => { setOpen(false); setSeen([]); };
  // A new sale starts with nothing seen.
  const empty = cart.lines.length === 0;
  useEffect(() => { if (empty) setSeen([]); }, [empty]);
  return { pages, open, setOpen, markSeen, reset };
}

/** The header (with its icon), the message and the items that set the warning off. This is the whole face of one page. */
function WarningFace({ m }: { m: MatchedCartWarning }) {
  const { c } = useTheme(); const k = useUi().textScale; const names = triggerNames(m);
  return (
    <View style={{ gap: 12 }}>
      <View accessible accessibilityRole="header" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="warning" size={Math.round(26 * k)} color={c.warn} />
        <Txt size={20} weight="700" style={{ flex: 1 }}>{warningTitle(m.warning)}</Txt>
      </View>
      <Txt size={19} weight="600" style={{ lineHeight: Math.round(27 * k) }}>{m.warning.body}</Txt>
      {names.length ? <Txt size={13} sub>For: {names.join(', ')}</Txt> : null}
    </View>
  );
}

export default function CartWarningsSheet({ visible, pages, onClose, onContinue }: { visible: boolean; pages: MatchedCartWarning[]; onClose: () => void; onContinue: () => void }) {
  const { c } = useTheme(); const k = useUi().textScale;
  const [page, setPage] = useState(0); const [ticked, setTicked] = useState<string[]>([]); const [reduce, setReduce] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const dir = useRef(1); const t = useRef(new Animated.Value(1)).current;
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {}); }, []);
  // Each time the window opens it starts on the first warning with nothing ticked.
  useEffect(() => { if (visible) { setPage(0); setTicked([]); } }, [visible]);
  const total = pages.length; const at = Math.min(page, Math.max(0, total - 1)); const cur = pages[at];
  // A short slide and fade of the message when the page changes. The frame, dots and buttons stay still. Off with Reduce Motion.
  useEffect(() => {
    if (reduce) { t.setValue(1); return; }
    t.setValue(0); Animated.timing(t, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [at, reduce, t]);
  if (!cur) return null;
  const go = (n: number) => { const to = Math.max(0, Math.min(total - 1, n)); dir.current = to >= at ? 1 : -1; setPage(to); };
  const last = at >= total - 1; const need = unacknowledged(pages, ticked); const done = ticked.includes(warningKey(cur));
  const anyAck = pages.some(p => p.warning.requireAcknowledgement);
  // The message area is as tall as the tallest page, so the buttons stay in the same place on every page (measured by invisible copies).
  const tallest = Math.max(0, ...pages.map(p => heights[warningKey(p)] ?? 0));
  const note = last && need.length ? (need.length === 1 ? 'Tick the box on one warning to carry on.' : `Tick the box on ${need.length} warnings to carry on.`) : '';
  const finish = <Btn spot={SPOT.warningContinue} title="Continue to payment" disabled={need.length > 0} onPress={onContinue} style={{ flex: 2 }} />;
  return (
    <Sheet visible={visible} onClose={onClose} popup screen="sheet_cart_warnings">
      <View style={{ flexShrink: 1 }}>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }}>
          {pages.map(p => <View key={warningKey(p)} onLayout={e => { const h = Math.ceil(e.nativeEvent.layout.height); setHeights(x => (x[warningKey(p)] === h ? x : { ...x, [warningKey(p)]: h })); }}><WarningFace m={p} /></View>)}
        </View>
        <Animated.View style={{ flexShrink: 1, opacity: t, transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [dir.current * 24, 0] }) }] }}>
          <ScrollView style={{ height: tallest > 0 ? tallest : undefined }} showsVerticalScrollIndicator={false}>
            <WarningFace m={cur} />
          </ScrollView>
        </Animated.View>
      </View>
      {anyAck ? (
        <View style={{ marginTop: 14 }}>
          {cur.warning.requireAcknowledgement
            ? <Btn spot={SPOT.warningAcknowledge} title={done ? 'Read and handled ✓' : 'I have read this and dealt with it'} kind={done ? 'secondary' : 'primary'} onPress={() => setTicked(x => (done ? x.filter(key => key !== warningKey(cur)) : [...x, warningKey(cur)]))} />
            : <View style={{ height: Math.round(50 * k) }} />}
          <Txt size={13} color={c.warn} weight="600" style={{ marginTop: 8, textAlign: 'center', minHeight: Math.round(18 * k) }}>{note}</Txt>
        </View>
      ) : null}
      {total > 1 ? <View style={{ marginTop: 14 }}><PageDots count={total} index={at} label={`Warning ${at + 1} of ${total}`} /></View> : null}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        {total > 1 ? <Btn spot={SPOT.warningBack} title="Back" kind="secondary" disabled={at === 0} onPress={() => go(at - 1)} style={{ flex: 1 }} /> : null}
        {last ? finish : <Btn spot={SPOT.warningNext} title="Next" onPress={() => go(at + 1)} style={{ flex: 2 }} />}
      </View>
      <Btn spot={SPOT.warningCancel} title="Back to cart" kind="ghost" onPress={onClose} style={{ marginTop: 6 }} />
    </Sheet>
  );
}
