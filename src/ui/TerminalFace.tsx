// Location: src/ui/TerminalFace.tsx
// The picture on the virtual Zeller Terminal 2's screen. Draws one screen of the terminal at any size and does nothing else:
// the state and the taps come in as props, so the practice device, the playground and the Show demos all draw the same face.
// Everything is sized from the width, so it stays sharp and in proportion from a thumbnail to full size.
import React from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { QR } from './QR';
import { spotRefFor } from './Spot';
import { SPOT } from '../lib/trainingSpots';
import { FACE_ASPECT, faceColors, PIN_MAX, PIN_ROWS, screenText, type VtState } from '../lib/virtualTerminal';

export { FACE_ASPECT };
export type FaceBrand = { bg: string; logo?: { uri: string } | null };
type Props = { s: VtState; w: number; brand?: FaceBrand; onKey?: (k: string) => void; onCancel?: () => void; onDone?: () => void; spots?: boolean };

export default function TerminalFace({ s, w, brand, onKey, onCancel, onDone, spots }: Props) {
  const spotRef = spots ? spotRefFor : undefined; // only the live terminal registers spots, so a thumbnail in a gallery never steals the highlight
  const k = faceColors(s.dark); const u = w / 100; const h = w * FACE_ASPECT; const t = screenText(s); const press = (f?: () => void) => (f ? { onPress: f } : { disabled: true });
  const shell = { width: w, height: h, backgroundColor: s.screen === 'sleep' ? (brand?.bg ?? '#13111C') : k.bg, overflow: 'hidden' as const, alignItems: 'center' as const };
  const disc = (bg: string, icon: React.ComponentProps<typeof Ionicons>['name']) => (
    <View style={{ width: 30 * u, height: 30 * u, borderRadius: 15 * u, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={18 * u} color="#fff" /></View>
  );
  const heading = (title: string, line?: string, hint?: string) => (
    <View style={{ alignItems: 'center', paddingHorizontal: 8 * u, gap: 2 * u }}>
      <Text style={{ fontSize: 11 * u, fontWeight: '700', color: k.text, textAlign: 'center' }} numberOfLines={2}>{title}</Text>
      {line ? <Text style={{ fontSize: 5.6 * u, color: k.sub, textAlign: 'center' }} numberOfLines={3}>{line}</Text> : null}
      {hint ? <Text style={{ fontSize: 4.2 * u, color: k.sub, textAlign: 'center', marginTop: 2 * u }} numberOfLines={3}>{hint}</Text> : null}
    </View>
  );
  const pill = (label: string, onP: (() => void) | undefined, id?: string, strong = false) => (
    <Pressable ref={id && spotRef ? spotRef(id) : undefined} collapsable={false} accessibilityRole="button" accessibilityLabel={label} {...press(onP)}
      style={{ paddingHorizontal: 9 * u, paddingVertical: 3.2 * u, borderRadius: 99, backgroundColor: strong ? k.accent : k.key }}>
      <Text style={{ fontSize: 5 * u, fontWeight: '700', color: strong ? k.onAccent : k.text }}>{label}</Text></Pressable>
  );

  let body: React.ReactNode;
  switch (s.screen) {
    case 'sleep':
      body = <View style={{ flex: 1, justifyContent: 'center' }}>{brand?.logo
        ? <Image source={brand.logo} resizeMode="contain" accessibilityIgnoresInvertColors style={{ width: w * 0.62, height: w * 0.4 }} />
        : <Ionicons name="storefront-outline" size={22 * u} color="#EFD8C9" />}</View>; break;
    case 'amount':
      body = (
        <View style={{ flex: 1, flexDirection: 'row', width: '100%' }}>
          <View style={{ width: '35%', backgroundColor: '#1C7DFF', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 * u }}>
            <Text style={{ fontSize: 10 * u, fontWeight: '700', color: '#F5F8FF', transform: [{ rotate: '-90deg' }], textAlign: 'center' }}>Tap Now</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#0D0D0F', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 16 * u, fontWeight: '700', color: '#F5F6F8' }}>{t.line}</Text>
          </View>
        </View>
      );
      break;
    case 'pin':
      body = (<View style={{ flex: 1, width: '100%', alignItems: 'center', paddingTop: 7 * u, gap: 4 * u }}>
        {heading(t.title, t.line)}
        <View style={{ flexDirection: 'row', gap: 3 * u, marginVertical: 1.5 * u }} accessibilityLabel={`${s.pin} digits entered`}>
          {Array.from({ length: PIN_MAX }, (_, i) => <View key={i} style={{ width: 4.6 * u, height: 4.6 * u, borderRadius: 3 * u, backgroundColor: i < s.pin ? k.accent : 'transparent', borderWidth: i < s.pin ? 0 : 1, borderColor: k.sub, opacity: i < s.pin ? 1 : 0.8 }} />)}
        </View>
        <View ref={spotRef?.(SPOT.terminalPinpad)} collapsable={false} style={{ gap: 2.4 * u, width: '86%' }}>
          {PIN_ROWS.map((row, ri) => <View key={ri} style={{ flexDirection: 'row', gap: 2.4 * u }}>{row.map(key => (
            <Pressable key={key} ref={key === 'ok' && spotRef ? spotRef(SPOT.terminalPinOk) : undefined} collapsable={false} accessibilityRole="button" accessibilityLabel={key === 'del' ? 'Delete' : key === 'ok' ? 'OK' : `Key ${key}`} {...press(onKey ? () => onKey(key) : undefined)}
              style={{ flex: 1, height: 11 * u, borderRadius: 3 * u, alignItems: 'center', justifyContent: 'center', backgroundColor: key === 'ok' ? k.good : k.key }}>
              {key === 'del' ? <Ionicons name="backspace-outline" size={6.4 * u} color={k.text} /> : <Text style={{ fontSize: 7 * u, fontWeight: '700', color: key === 'ok' ? '#fff' : k.text }}>{key === 'ok' ? 'OK' : key}</Text>}
            </Pressable>))}</View>)}
        </View>
        <View style={{ paddingTop: 1 * u }}>{pill('Cancel', onCancel, SPOT.terminalCancel)}</View></View>); break;
    case 'processing':
      body = <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 * u, backgroundColor: '#F7F7F7' }}><ActivityIndicator size="large" color="#1C7DFF" />{heading('Processing', 'Please wait', 'Do not remove the card')}</View>; break;
    case 'approved':
      body = (
        <View style={{ flex: 1, width: '100%', backgroundColor: '#2ECC71', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: 30 * u, height: 30 * u, borderRadius: 15 * u, borderWidth: 2.4 * u, borderColor: '#F6F9FF', alignItems: 'center', justifyContent: 'center', marginBottom: 10 * u }}>
            <Ionicons name="checkmark" size={18 * u} color="#F6F9FF" />
          </View>
          <Text style={{ fontSize: 14 * u, fontWeight: '700', color: '#F4F8FF' }}>{t.title}</Text>
        </View>
      );
      break;
    case 'declined':
      body = (
        <View style={{ flex: 1, width: '100%', backgroundColor: '#0D0D0F', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 * u }}>
          <View style={{ width: 30 * u, height: 30 * u, borderRadius: 15 * u, borderWidth: 2.6 * u, borderColor: '#F44B4B', alignItems: 'center', justifyContent: 'center', marginBottom: 10 * u }}>
            <Ionicons name="close" size={18 * u} color="#F44B4B" />
          </View>
          <Text style={{ fontSize: 14 * u, fontWeight: '700', color: '#F5F6F8', textAlign: 'center' }}>{t.title}</Text>
          <Text style={{ marginTop: 8 * u, fontSize: 8.5 * u, color: '#F5F6F8', textAlign: 'center' }}>{t.line}</Text>
          <Text style={{ marginTop: 6 * u, fontSize: 6.1 * u, color: '#D2D6DD', textAlign: 'center', lineHeight: 11 * u }}>{t.hint}</Text>
        </View>
      );
      break;
    case 'cancelled': body = <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 * u }}>{disc(k.sub, 'close')}{heading(t.title, t.line)}</View>; break;
    case 'removeCard': body = <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 * u }}><Ionicons name="card-outline" size={26 * u} color={k.accent} />{heading(t.title)}</View>; break;
    case 'receipt':
      body = (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%', backgroundColor: '#F5F6F8' }}>
          <QR value="https://example.com/practice-receipt" size={Math.round(46 * u)} />
        </View>
      );
      break;
    case 'unavailable': body = <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 * u }}>{disc(k.bad, 'cloud-offline-outline')}{heading(t.title, t.line, t.hint)}</View>; break;
  }
  return <View style={shell} accessibilityLabel={`Terminal screen: ${t.title || 'idle'} ${t.line}`}>{body}</View>;
}
