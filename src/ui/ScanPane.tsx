// Location: src/ui/ScanPane.tsx
// The scan popup that fills Checkout's inner left pane (S5): the item's name and image, or nothing but the confirmation
// when the item spotlight settings are off. It stays fully opaque for 3 seconds, then fades on a rising slope, gone by 5
// seconds, and any tap or click dismisses it at once. Plain React Native views, not ./kit, so it can never pull the
// training overlay in behind it.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, Text, View } from 'react-native';
import { useTheme } from './theme';
import { popupOpacity, popupTiming } from '../lib/scanFeedback';

export type PaneItem = { productTitle: string; variantTitle?: string | null; image?: string | null };

/**
 * `item` is null when the item spotlight settings are off and the confirmation text is all there is to show.
 * `startedAt` is a clock reading (Date.now()) taken when the scan landed, so a re-render in the middle does not replay
 * the popup from the top. `onDismiss` fires on a tap, on a click, and when the fade runs out.
 */
export default function ScanPane({ item, params, startedAt, onDismiss }: {
  item: PaneItem | null; params: { name: boolean; image: boolean }; startedAt: number; onDismiss: () => void;
}) {
  const { c } = useTheme(); const timing = popupTiming(true);
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt); const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => { shake.setValue(0); }, [shake]);
  useEffect(() => {
    const tick = () => { const e = Date.now() - startedAt; setElapsed(e); if (e >= timing.goneMs) onDismiss(); };
    tick(); const t = setInterval(tick, 50); return () => clearInterval(t);
  }, [startedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const showImage = params.image && item?.image;
  const showName = params.name && item;
  return (
    <Animated.View style={{ flex: 1, opacity: popupOpacity(elapsed, true) }}>
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss scan confirmation" accessibilityLiveRegion="polite"
        style={{ flex: 1, alignSelf: 'stretch', backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
        {showImage ? <Image source={{ uri: item!.image! }} resizeMode="contain" style={{ width: '80%', height: '55%', borderRadius: 16 }} /> : null}
        {showName ? <Text style={{ color: c.text, fontSize: 30, fontWeight: '700', textAlign: 'center' }}>{item!.productTitle}{item!.variantTitle ? ` · ${item!.variantTitle}` : ''}</Text> : null}
        {!showImage && !showName ? <Text style={{ color: c.text, fontSize: 24, fontWeight: '700', textAlign: 'center' }}>Added</Text> : null}
      </Pressable>
    </Animated.View>
  );
}
