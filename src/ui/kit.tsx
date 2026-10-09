// Location: src/ui/kit.tsx
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleProp, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, useLayout } from './theme';
import { digitsToCents, fmt } from '../lib/money';
import { NativeSegmented, NativeSwitch, hasSwiftUI } from './native';
import { noteActivity } from '../lib/idle';

export const tap = () => { try { void Haptics.selectionAsync(); } catch {} };
export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Txt({ style, children, size = 15, weight, color, sub, numberOfLines }: { style?: any; children?: React.ReactNode; size?: number; weight?: '400' | '500' | '600' | '700'; color?: string; sub?: boolean; numberOfLines?: number }) {
  const { c } = useTheme();
  return <Text numberOfLines={numberOfLines} style={[{ fontSize: size, color: color ?? (sub ? c.sub : c.text), fontWeight: weight }, style]}>{children}</Text>;
}
export const Money = ({ cents, size = 15, weight, color, style }: { cents: number; size?: number; weight?: '400' | '500' | '600' | '700'; color?: string; style?: any }) =>
  <Txt size={size} weight={weight} color={color} style={[{ fontVariant: ['tabular-nums'] }, style]}>{fmt(cents)}</Txt>;

export function Btn({ title, onPress, kind = 'primary', icon, disabled, busy, style, small }: { title: string; onPress?: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; icon?: IconName; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle>; small?: boolean }) {
  const { c } = useTheme();
  const bg = kind === 'primary' ? c.accent : kind === 'danger' ? c.bad : kind === 'secondary' ? c.fill : 'transparent';
  const fg = kind === 'primary' ? c.onAccent : kind === 'danger' ? '#fff' : c.text;
  return (
    <Pressable disabled={disabled || busy} onPress={() => { tap(); onPress?.(); }} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => [{ backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1, paddingVertical: small ? 8 : 14, paddingHorizontal: small ? 14 : 20, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: small ? 36 : 50 }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 14 : 16 }}>{title}</Text>
    </Pressable>
  );
}
export function IconBtn({ icon, onPress, label, color, size = 22 }: { icon: IconName; onPress: () => void; label: string; color?: string; size?: number }) {
  const { c } = useTheme();
  return <Pressable onPress={() => { tap(); onPress(); }} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={size} color={color ?? c.text} /></Pressable>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme(); return <View style={[{ backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }, style]}>{children}</View>;
}
/** Product thumbnail with a neutral placeholder when there is no image (or it fails to load). */
export function Thumb({ uri, size = 44, radius = 10 }: { uri?: string | null; size?: number; radius?: number }) {
  const { c } = useTheme(); const [bad, setBad] = useState(false);
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: c.fill, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {uri && !bad ? <Image source={{ uri }} onError={() => setBad(true)} resizeMode="cover" style={{ width: size, height: size }} accessibilityIgnoresInvertColors /> : <Ionicons name="image-outline" size={Math.round(size * 0.45)} color={c.sub} />}
    </View>
  );
}
/** image: undefined = no thumbnail column; null = placeholder; string = picture. */
export function Row({ title, sub, right, onPress, icon, danger, last, badge, image }: { title: string; sub?: string; right?: React.ReactNode; onPress?: () => void; icon?: IconName; danger?: boolean; last?: boolean; badge?: string; image?: string | null }) {
  const { c } = useTheme();
  return (
    <Pressable disabled={!onPress} onPress={() => { tap(); onPress?.(); }} accessibilityRole={onPress ? 'button' : undefined} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12, backgroundColor: pressed ? c.fill : 'transparent', borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line })}>
      {image !== undefined ? <Thumb uri={image} /> : null}
      {icon ? <Ionicons name={icon} size={20} color={danger ? c.bad : c.sub} /> : null}
      <View style={{ flex: 1 }}>
        <Txt weight="500" color={danger ? c.bad : undefined} numberOfLines={2}>{title}</Txt>
        {sub ? <Txt size={13} sub numberOfLines={2}>{sub}</Txt> : null}
      </View>
      {badge ? <View style={{ backgroundColor: c.bad, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, height: 20, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{badge}</Text></View> : null}
      {right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={18} color={c.sub} /> : null}
    </Pressable>
  );
}
export function Section({ title, children, footer }: { title?: string; children: React.ReactNode; footer?: string }) {
  return <View style={{ marginTop: 18 }}>{title ? <Txt size={13} sub weight="600" style={{ marginHorizontal: 20, marginBottom: 6, textTransform: 'uppercase' }}>{title}</Txt> : null}<Card style={{ marginHorizontal: 16 }}>{children}</Card>{footer ? <Txt size={12} sub style={{ marginHorizontal: 20, marginTop: 6 }}>{footer}</Txt> : null}</View>;
}
export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  const { c } = useTheme();
  return <Pressable onPress={() => { tap(); onPress?.(); }} accessibilityRole="button" accessibilityState={{ selected: !!active }} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? c.accent : c.fill, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
    {icon ? <Ionicons name={icon} size={14} color={active ? c.onAccent : c.text} /> : null}<Text style={{ color: active ? c.onAccent : c.text, fontWeight: '600', fontSize: 14 }}>{label}</Text></Pressable>;
}
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  const { c } = useTheme();
  if (hasSwiftUI) return <NativeSegmented value={value} options={options} onChange={v => { tap(); onChange(v); }} />;
  return <View style={{ flexDirection: 'row', backgroundColor: c.fill, borderRadius: 12, padding: 3 }}>{options.map(o => (
    <Pressable key={o.v} onPress={() => { tap(); onChange(o.v); }} accessibilityRole="button" accessibilityState={{ selected: o.v === value }} style={{ flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center', backgroundColor: o.v === value ? c.card : 'transparent' }}>
      <Text style={{ color: c.text, fontWeight: o.v === value ? '700' : '500', fontSize: 14 }}>{o.label}</Text></Pressable>))}</View>;
}
export function Field({ label, style, ...p }: TextInputProps & { label?: string }) {
  const { c } = useTheme();
  return <View style={{ marginBottom: 12 }}>{label ? <Txt size={13} sub weight="600" style={{ marginBottom: 4 }}>{label}</Txt> : null}
    <TextInput placeholderTextColor={c.sub} {...p} style={[{ backgroundColor: c.fill, color: c.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }, style]} /></View>;
}
export function Toggle({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return <Row title={label} sub={sub} right={<NativeSwitch value={value} onChange={v => { tap(); onChange(v); }} label={label} />} />;
}
export const Empty = ({ icon = 'file-tray-outline', title, sub }: { icon?: IconName; title: string; sub?: string }) => {
  const { c } = useTheme();
  return <View style={{ alignItems: 'center', padding: 40, gap: 8 }}><Ionicons name={icon} size={40} color={c.sub} /><Txt weight="600">{title}</Txt>{sub ? <Txt sub style={{ textAlign: 'center' }}>{sub}</Txt> : null}</View>;
};

/** Page header used by every pushed screen. */
export function Page({ title, onBack, right, children, scroll = true, pad = true }: { title: string; onBack?: () => void; right?: React.ReactNode; children: React.ReactNode; scroll?: boolean; pad?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 54, paddingBottom: 8, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line }}>
        {onBack ? <IconBtn icon="chevron-back" label="Back" onPress={onBack} /> : <View style={{ width: 12 }} />}
        <Txt size={20} weight="700" style={{ flex: 1 }} numberOfLines={1}>{title}</Txt>{right}
      </View>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40, paddingTop: pad ? 4 : 0 }}>{children}</ScrollView> : <View style={{ flex: 1 }}>{children}</View>}
    </View>
  );
}

/** Bottom sheet on phone, centred card on tablet. */
export function Sheet({ visible, onClose, title, children, full, dismissable = true }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; full?: boolean; dismissable?: boolean }) {
  const { c } = useTheme(); const { tablet, height } = useLayout();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismissable ? onClose : undefined} supportedOrientations={['portrait', 'landscape']}>
      <KeyboardAvoidingView onTouchStart={noteActivity} behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: tablet ? 'center' : 'flex-end', alignItems: 'center', backgroundColor: c.overlay }}>
        <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} onPress={dismissable ? onClose : undefined} accessibilityLabel="Dismiss" />
        <View style={{ width: '100%', maxWidth: tablet ? 560 : undefined, maxHeight: height * (full ? 0.94 : 0.86), backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomLeftRadius: tablet ? 24 : 0, borderBottomRightRadius: tablet ? 24 : 0, paddingBottom: tablet ? 8 : 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 8 }}>
            <Txt size={18} weight="700" style={{ flex: 1 }}>{title ?? ''}</Txt>{dismissable ? <IconBtn icon="close" label="Close" onPress={onClose} /> : null}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingTop: 4 }}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const confirm = (title: string, message: string, ok = 'Confirm', destructive = false): Promise<boolean> =>
  new Promise(res => Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel', onPress: () => res(false) }, { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => res(true) }], { cancelable: true, onDismiss: () => res(false) }));
export const alertMsg = (title: string, message?: string) => Alert.alert(title, message);

/** Calculator-style keypad: digits shift in from the right as cents (Square behaviour). */
export function Keypad({ value, onChange, onSubmit, submitLabel, decimal = true, big }: { value: string; onChange: (digits: string) => void; onSubmit?: () => void; submitLabel?: string; decimal?: boolean; big?: boolean }) {
  const { c } = useTheme();
  const key = (k: string) => { tap(); if (k === '⌫') onChange(value.slice(0, -1)); else if (k === 'C') onChange(''); else onChange((value + k).replace(/^0+(?=\d)/, '').slice(0, 9)); };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{keys.map(k => (
        <Pressable key={k} onPress={() => key(k)} accessibilityRole="button" accessibilityLabel={k === '⌫' ? 'Delete' : k === 'C' ? 'Clear' : k} style={({ pressed }) => ({ width: '31.5%', height: big ? 72 : 60, borderRadius: 14, backgroundColor: pressed ? c.line : c.fill, alignItems: 'center', justifyContent: 'center' })}>
          <Text style={{ fontSize: 24, fontWeight: '500', color: c.text }}>{k}</Text></Pressable>))}</View>
      {onSubmit ? <Btn title={submitLabel ?? 'Add'} onPress={onSubmit} disabled={!value || (decimal && digitsToCents(value) <= 0)} /> : null}
    </View>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null); const t = useRef<any>(null);
  const show = (m: string) => { setMsg(m); clearTimeout(t.current); t.current = setTimeout(() => setMsg(null), 2500); };
  useEffect(() => () => clearTimeout(t.current), []);
  const node = msg ? <View pointerEvents="none" style={{ position: 'absolute', bottom: 110, left: 0, right: 0, alignItems: 'center' }}><View style={{ backgroundColor: '#111', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 }}><Text style={{ color: '#fff', fontWeight: '600' }}>{msg}</Text></View></View> : null;
  return { show, node };
}
