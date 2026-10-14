// Location: src/ui/AppStatusBar.tsx
// The app's own status bar. The iOS one is hidden (see App.tsx), so this draws the clock, the register
// name and the sync state instead. It is a normal row at the top of the shell, not an overlay, so it can
// never cover a button, and it ignores touches for the same reason.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './kit';
import { useTheme } from './theme';
import { useApp } from '../state/store';

const clockText = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function AppStatusBar() {
  const { c } = useTheme(); const insets = useSafeAreaInsets();
  const registerName = useApp(s => s.settings.registerName);
  const sync = useApp(s => s.sync.state);
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
      </View>
    </View>
  );
}
