// Location: src/ui/AppStatusBar.tsx
// The app's own status bar. The iOS one is hidden (see App.tsx), so this draws the clock, the shop logo and name, the register
// name, the reader and sync chips and the battery instead. It is a normal row at the top of the shell, not an overlay, so it can
// never cover a button. Only a chip that reports a problem takes touches (it opens the page that explains it); everything else
// lets touches fall through. The screensaver draws this same bar at the top of its own window (`interactive={false}`, `tone` set
// to the saver's colours), so the bar is on screen while the saver is.
import React, { useEffect, useState } from 'react';
import { Image, Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePowerState } from 'react-native-device-info';
import { Txt } from './kit';
import { useLayout, useTheme, type Colors } from './theme';
import { useNav } from './nav';
import { useApp } from '../state/store';
import { latchTopInset, type InsetLatch } from '../lib/statusInset';

const clockText = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * The battery as the status bar draws it: the percent left, an icon (a lightning bolt while charging) and a colour.
 * Green while charging, red when it is nearly flat, orange when it wants a charge soon, otherwise the theme's text
 * colour. Null when the device will not say (a simulator often reports -1), so the bar shows nothing rather than a lie.
 */
function batteryView(level: number | undefined, state: string | undefined, c: Colors): { pct: number; icon: string; color: string } | null {
  if (typeof level !== 'number' || level < 0) return null;
  const pct = Math.round(level * 100);
  const charging = state === 'charging' || state === 'full';
  const color = charging ? c.good : pct <= 10 ? c.bad : pct <= 20 ? c.warn : c.text;
  const icon = charging ? 'flash' : pct <= 10 ? 'battery-dead' : pct <= 60 ? 'battery-half' : 'battery-full';
  return { pct, icon, color };
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const Chip = ({ icon, text, color }: { icon: IconName; text: string; color: string }) =>
  <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: color + '22' }}>
    <Ionicons name={icon} size={13} color={color} /><Txt size={12} weight="600" color={color}>{text}</Txt></View>;

// One latch for every bar on screen (the shell's and the screensaver's), so a window that opens while iOS is flashing its own bar
// does not start from the inflated inset.
let topLatch: InsetLatch | null = null;

/** `tone`: colours to draw in instead of the theme's (the screensaver passes its background and its readable text colour). */
export default function AppStatusBar({ interactive = true, tone }: { interactive?: boolean; tone?: { bg: string; fg: string } } = {}) {
  const { c } = useTheme(); const insets = useSafeAreaInsets(); const { width, height } = useWindowDimensions(); const { tablet } = useLayout(); const nav = useNav();
  const registerName = useApp(s => s.settings.registerName); const shopName = useApp(s => s.settings.shopName);
  const sync = useApp(s => s.sync.state); const queued = useApp(s => s.pos.outbox.length); const readerReady = useApp(s => s.zeller.ready);
  const power = usePowerState();
  const bg = tone?.bg ?? c.bg; const fg = tone?.fg ?? c.text; const dim = tone ? fg : c.sub;
  const battery = batteryView(power.batteryLevel, power.batteryState, tone ? { ...c, text: fg } : c);
  const [time, setTime] = useState(clockText());
  useEffect(() => { const t = setInterval(() => setTime(clockText()), 20000); return () => clearInterval(t); }, []);
  topLatch = latchTopInset(topLatch, width > height ? 'landscape' : 'portrait', insets.top);

  // Same wording and colours the Checkout strip used. On a phone the reader chip only shows when something is wrong.
  const reader = readerReady ? { icon: 'card' as IconName, text: 'Reader ready', color: c.good, route: null } : { icon: 'alert-circle' as IconName, text: 'Reader issue', color: c.bad, route: 'diagnostics' };
  const net = sync === 'offline' ? { icon: 'cloud-offline-outline' as IconName, text: queued ? `Offline · ${queued} queued` : 'Offline', color: c.warn, route: 'notifications' }
    : sync === 'error' ? { icon: 'alert-circle' as IconName, text: `Sync issue${queued ? ` · ${queued} queued` : ''}`, color: c.warn, route: 'notifications' }
    : sync === 'syncing' ? { icon: 'sync' as IconName, text: 'Syncing…', color: c.good, route: null }
    : { icon: 'cloud-done' as IconName, text: 'Synced', color: c.good, route: null };
  const chip = (x: { icon: IconName; text: string; color: string; route: string | null }) => {
    const body = <Chip icon={x.icon} text={x.text} color={x.color} />;
    return x.route && interactive
      ? <Pressable key={x.text} onPress={() => nav.go(x.route!)} accessibilityRole="button" accessibilityLabel={x.text} hitSlop={6}>{body}</Pressable>
      : <View key={x.text}>{body}</View>;
  };
  return (
    <View pointerEvents={interactive ? 'box-none' : 'none'} style={{ paddingTop: topLatch.top, backgroundColor: bg }}>
      <View style={{ height: 28, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 }}>
        <Txt size={12} weight="600" color={fg} style={{ minWidth: 54 }}>{time}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          <Image source={require('../../assets/icon.png')} resizeMode="contain" style={{ width: 18, height: 18 }} accessibilityLabel="Aiden’s 3D Printing logo" accessibilityIgnoresInvertColors />
          {shopName ? <Txt size={12} weight="600" color={fg} numberOfLines={1} style={{ flexShrink: 1 }}>{shopName}</Txt> : null}
        </View>
        <Txt size={12} color={dim} numberOfLines={1} style={{ flex: 1, textAlign: 'center', opacity: tone ? 0.7 : 1 }}>{registerName}</Txt>
        {tablet || !readerReady ? chip(reader) : null}
        {chip(net)}
        {battery ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name={battery.icon as IconName} size={13} color={battery.color} />
            <Txt size={12} color={battery.color}>{battery.pct}%</Txt>
          </View>
        ) : null}
      </View>
    </View>
  );
}
