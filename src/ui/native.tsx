// Location: src/ui/native.tsx
// Native SwiftUI controls via @expo/ui (Expo SDK 54, iOS). Falls back to plain React Native when SwiftUI is unavailable
// (Android, Expo Go, or a build made before @expo/ui was linked), so the rest of the app never has to care.
import React from 'react';
import { Platform, Switch as RNSwitch } from 'react-native';
import { useTheme } from './theme';

type UIModule = typeof import('@expo/ui/swift-ui');
type ModModule = typeof import('@expo/ui/swift-ui/modifiers');
let UI: UIModule | null = null; let MOD: ModModule | null = null;
if (Platform.OS === 'ios') { try { UI = require('@expo/ui/swift-ui'); MOD = require('@expo/ui/swift-ui/modifiers'); } catch { UI = null; MOD = null; } }
// Only trust the native controls if every piece we use actually exists in the installed @expo/ui; otherwise fall back to plain React Native.
export const hasSwiftUI = !!(UI && MOD && typeof UI.Host === 'function' && typeof UI.Picker === 'function' && typeof UI.Switch === 'function' && typeof MOD.accessibilityLabel === 'function');

/** iOS-native toggle (SwiftUI Switch). Sized to its content so it sits at the end of a row. */
export function NativeSwitch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { c, dark } = useTheme();
  if (!hasSwiftUI || !UI || !MOD) return <RNSwitch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: c.good }} />;
  return (
    <UI.Host matchContents colorScheme={dark ? 'dark' : 'light'}>
      <UI.Switch value={value} onValueChange={onChange} color={c.good} modifiers={[MOD.accessibilityLabel(label)]} />
    </UI.Host>
  );
}

/** iOS-native segmented control (SwiftUI Picker, segmented variant). Returns null when SwiftUI isn't available so the caller can draw its own.
 *  Written for @expo/ui 0.2.0-beta.9: options are plain strings, selection is an index, and the style is a prop (no pickerStyle/tag modifiers). */
export function NativeSegmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  const { dark } = useTheme();
  if (!hasSwiftUI || !UI || !MOD) return null;
  const idx = options.findIndex(o => o.v === value);
  return (
    <UI.Host matchContents={{ vertical: true }} colorScheme={dark ? 'dark' : 'light'} style={{ alignSelf: 'stretch' }}>
      <UI.Picker
        variant="segmented"
        options={options.map(o => o.label)}
        selectedIndex={idx >= 0 ? idx : null}
        onOptionSelected={({ nativeEvent }) => { const o = options[nativeEvent.index]; if (o) onChange(o.v); }}
      />
    </UI.Host>
  );
}