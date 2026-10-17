// Location: src/ui/AppStatusBar.tsx
// The app's own status bar. The iOS one is hidden (see App.tsx), so this draws the clock, the register
// name, the sync state and the battery instead. It is a normal row at the top of the shell, not an overlay,
// so it can never cover a button, and it ignores touches for the same reason.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePowerState } from 'react-native-device-info';
import { Txt } from './kit';
import { useTheme, type Colors } from './theme';
import { useApp } from '../state/store';

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

export default function AppStatusBar() {
  const { c } = useTheme(); const insets = useSafeAreaInsets();
  const registerName = useApp(s => s.settings.registerName);
  const sync = useApp(s => s.sync.state);
  const power = usePowerState();
  const battery = batteryView(power.batteryLevel, power.batteryState, c);
  const [time, setTime] = useState(clockText());
  useEffect(() => { const t = setInterval(() => setTime(clockText()), 20000); return () => clearInterval(t); }, []);
  const net = sync === 'offline' ? { icon: 'cloud-offline-outline', color: c.warn, label: 'Offline' }
    : sync === 'syncing' ? { icon: 'sync-outline', color: c.sub, label: 'Syncing' }
    : sync === 'error' ? { icon: 'alert-circle-outline', color: c.bad, label: 'Sync error' }
    : { icon: 'cloud-done-outline', color: c.sub, label: 'Online' };
  return (
    <View pointerEvents="none" style={{ paddingTop: insets.top, backgroundColor: c.bg }}>
      <View style={{ height: 26, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 }}>
        <Txt size={12} weight="600" style={{ minWidth: 54 }}>{time}</Txt>
        <Txt size={12} sub numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>{registerName}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name={net.icon as React.ComponentProps<typeof Ionicons>['name']} size={13} color={net.color} />
          <Txt size={12} color={net.color}>{net.label}</Txt>
        </View>
        {battery ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name={battery.icon as React.ComponentProps<typeof Ionicons>['name']} size={13} color={battery.color} />
            <Txt size={12} color={battery.color}>{battery.pct}%</Txt>
          </View>
        ) : null}
      </View>
    </View>
  );
}
