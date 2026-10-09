// Location: src/ui/Screensaver.tsx
// Idle screensaver (logo on a colour) and the keep-awake switch. Mounted once in App.tsx.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useApp } from '../state/store';
import { idleMs, noteActivity } from '../lib/idle';
import { contrastOn, logoSource, normaliseHex, paymentActive, shouldShowScreensaver } from '../lib/screensaver';

const KEEP_TAG = 'pos-keep-awake';

/** Tells iOS not to auto-lock or dim while the app is open (the same switch video players use, no video needed). */
export function KeepAwake() {
  const on = useApp(s => s.settings.screensaver.keepAwake);
  useEffect(() => {
    if (!on) return;
    void activateKeepAwakeAsync(KEEP_TAG).catch(() => {});
    return () => { void Promise.resolve(deactivateKeepAwake(KEEP_TAG)).catch(() => {}); };
  }, [on]);
  return null;
}

function Clock({ color }: { color: string }) {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  return <Text style={{ color, opacity: 0.7, fontSize: 28, marginTop: 28, fontVariant: ['tabular-nums'] }}>{t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>;
}

/** Slowly wanders so no pixel stays lit in the same spot for hours. */
function Drifter({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const { width, height } = useWindowDimensions(); const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  useEffect(() => {
    if (!enabled) { pos.setValue({ x: 0, y: 0 }); return; }
    const reach = Math.min(width, height) * 0.12;
    const move = () => Animated.timing(pos, { toValue: { x: (Math.random() * 2 - 1) * reach, y: (Math.random() * 2 - 1) * reach }, duration: 12000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
    move(); const i = setInterval(move, 20000); return () => { clearInterval(i); pos.stopAnimation(); };
  }, [enabled, width, height, pos]);
  return <Animated.View style={{ alignItems: 'center', transform: pos.getTranslateTransform() }}>{children}</Animated.View>;
}

export function ScreensaverLayer() {
  const ss = useApp(s => s.settings.screensaver); const shopName = useApp(s => s.settings.shopName); const preview = useApp(s => !!s.saverPreview);
  const [idle, setIdle] = useState(false); const [failed, setFailed] = useState(false); const { width, height } = useWindowDimensions();
  useEffect(() => {
    const tick = () => {
      const st = useApp.getState(); const cfg = st.settings.screensaver;
      const locked = st.settings.requirePin && st.settings.staff.length > 0 && !st.unlocked;
      setIdle(shouldShowScreensaver({ enabled: cfg.enabled, showWhenLoggedOut: cfg.showWhenLoggedOut, locked, idleMs: idleMs(), idleMinutes: cfg.idleMinutes, lockedSeconds: cfg.lockedSeconds, paymentActive: paymentActive(st.pos.attempts, Date.now()) }));
    };
    const i = setInterval(tick, 1000); return () => clearInterval(i);
  }, []);
  useEffect(() => setFailed(false), [ss.logoUrl, ss.logoFile]);
  const show = preview || idle;
  const wake = () => { noteActivity(); setIdle(false); if (useApp.getState().saverPreview) useApp.getState().set({ saverPreview: false }); };
  const bg = normaliseHex(ss.bgColor) ?? '#111111'; const fg = contrastOn(bg); const src = failed ? null : logoSource(ss); const side = Math.min(width, height);
  return (
    <Modal visible={show} animationType="fade" supportedOrientations={['portrait', 'landscape']} onRequestClose={wake}>
      <Pressable onPress={wake} accessibilityRole="button" accessibilityLabel="Wake screen" style={{ flex: 1, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar hidden />
        <Drifter enabled={ss.drift}>
          {src ? <Image source={src} resizeMode="contain" onError={() => setFailed(true)} style={{ width: side * 0.55, height: side * 0.4 }} accessibilityIgnoresInvertColors />
            : <Text style={{ color: fg, fontSize: 44, fontWeight: '700', textAlign: 'center', maxWidth: side * 0.8 }}>{shopName || 'Point of sale'}</Text>}
          {ss.showClock ? <Clock color={fg} /> : null}
        </Drifter>
        <Text style={{ position: 'absolute', bottom: 28, color: fg, opacity: 0.4, fontSize: 14 }}>Tap to wake</Text>
      </Pressable>
    </Modal>
  );
}
