// Location: src/ui/TerminalFace.tsx
// The picture on the virtual Zeller Terminal 2's screen. Draws one screen of the terminal at any size and does nothing else:
// the state and the taps come in as props, so the practice device, the playground and the Show demos all draw the same face.
// Everything is sized from the width, so it stays sharp and in proportion from a thumbnail to full size.
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
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
  const disc = (color: string, icon: React.ComponentProps<typeof Ionicons>['name']) => ( // an outlined ring like the Approved and Declined screens
    <View style={{ width: 30 * u, height: 30 * u, borderRadius: 15 * u, borderWidth: 2.2 * u, borderColor: color, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={18 * u} color={color} /></View>
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
      // The idle screen is the business's screensaver: its logo centred on its screensaver colour, with the small Zeller wordmark at the foot like the real terminal.
      body = (<View style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
        {brand?.logo
          ? <Image source={brand.logo} resizeMode="contain" accessibilityIgnoresInvertColors style={{ width: w * 0.72, height: w * 0.5 }} />
          : <Ionicons name="storefront-outline" size={22 * u} color="#EFD8C9" />}
        <Text style={{ position: 'absolute', bottom: 9 * u, fontSize: 9 * u, fontWeight: '600', letterSpacing: 0.4 * u, color: '#FFFFFF', opacity: 0.7 }}>zeller</Text>
      </View>); break;
    case 'amount':
      // Tap Now: a blue panel with the contactless symbol on top, the amount on a dark sheet that overlaps it, and a small Cancel link.
      body = (
        <View style={{ flex: 1, width: '100%', backgroundColor: '#1C7DFF' }}>
          <View style={{ height: '38%', justifyContent: 'center', alignItems: 'center', gap: 4 * u }}>
            <Ionicons name="wifi" size={13 * u} color="#F5F8FF" style={{ transform: [{ rotate: '90deg' }] }} />
            <Text style={{ fontSize: 11 * u, fontWeight: '700', color: '#F5F8FF' }}>Tap Now</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: k.bg, borderTopLeftRadius: 9 * u, borderTopRightRadius: 9 * u, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 17 * u, fontWeight: '700', color: k.text }}>{t.line}</Text>
            <View style={{ position: 'absolute', bottom: 8 * u }}>
              <Pressable ref={spotRef?.(SPOT.terminalCancel)} collapsable={false} accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={8 * u} {...press(onCancel)}>
                <Text style={{ fontSize: 5 * u, color: '#3D8BFF' }}>Cancel</Text></Pressable>
            </View>
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
      // Processing: the Zeller smile in blue on the dark screen, with the word under it. No hint line: the reference only says Processing.
      body = (
        <View style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center', gap: 9 * u }} accessibilityRole="progressbar">
          <View style={{ width: 26 * u, height: 22 * u, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', gap: 10 * u, marginBottom: 3 * u }}>
              <View style={{ width: 4 * u, height: 1.6 * u, borderRadius: u, backgroundColor: '#1C7DFF' }} />
              <View style={{ width: 4 * u, height: 1.6 * u, borderRadius: u, backgroundColor: '#1C7DFF' }} /></View>
            <View style={{ width: 20 * u, height: 10 * u, borderBottomLeftRadius: 10 * u, borderBottomRightRadius: 10 * u, borderBottomWidth: 1.8 * u, borderLeftWidth: 1.8 * u, borderRightWidth: 1.8 * u, borderColor: '#1C7DFF' }} />
          </View>
          <Text style={{ fontSize: 6.5 * u, fontWeight: '600', color: k.text }}>Processing</Text>
        </View>); break;
    case 'approved':
      // Approved in dark mode: a green ring and tick with "$X Approved" under it. The reference's Note / Contact / Receipt buttons and New Sale are not on our terminal.
      body = (
        <View style={{ flex: 1, width: '100%', backgroundColor: k.bg, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: 30 * u, height: 30 * u, borderRadius: 15 * u, borderWidth: 2.4 * u, borderColor: '#34D26A', alignItems: 'center', justifyContent: 'center', marginBottom: 9 * u }}>
            <Ionicons name="checkmark" size={18 * u} color="#34D26A" />
          </View>
          <Text style={{ fontSize: 10 * u, fontWeight: '700', color: k.text, textAlign: 'center' }}>{t.title}</Text>
        </View>
      );
      break;
    case 'declined':
      // Declined: red ring with a cross, "$X Declined", the bold response line, then the plain explanation. The eReceipt button in the reference is left out.
      body = (
        <View style={{ flex: 1, width: '100%', backgroundColor: '#1B2221', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 9 * u }}>
          <View style={{ width: 30 * u, height: 30 * u, borderRadius: 15 * u, borderWidth: 2.2 * u, borderColor: '#F4584C', alignItems: 'center', justifyContent: 'center', marginBottom: 8 * u }}>
            <Ionicons name="close" size={18 * u} color="#F4584C" />
          </View>
          <Text style={{ fontSize: 10 * u, fontWeight: '700', color: k.text, textAlign: 'center' }}>{t.title}</Text>
          <Text style={{ marginTop: 5 * u, fontSize: 5.2 * u, fontWeight: '700', color: k.text, textAlign: 'center' }}>{t.line}</Text>
          <Text style={{ marginTop: 2.5 * u, fontSize: 4.8 * u, color: k.text, textAlign: 'center', lineHeight: 7.4 * u }}>{t.hint}</Text>
        </View>
      );
      break;
    case 'cancelled': body = <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 * u }}>{disc(k.sub, 'close')}{heading(t.title, t.line)}</View>; break;
    case 'removeCard': body = <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 * u }}><Ionicons name="card-outline" size={26 * u} color={k.accent} />{heading(t.title)}</View>; break;
    case 'receipt':
      // Dark screen with the QR on a white card, so it still scans.
      body = (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%', backgroundColor: k.bg, gap: 7 * u }}>
          <View style={{ backgroundColor: '#FFFFFF', padding: 4 * u, borderRadius: 4 * u }}><QR value="https://example.com/practice-receipt" size={Math.round(46 * u)} /></View>
          <Text style={{ fontSize: 5 * u, color: k.sub }}>Scan for your receipt</Text>
        </View>
      );
      break;
    case 'unavailable': body = <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 * u }}>{disc(k.bad, 'cloud-offline-outline')}{heading(t.title, t.line, t.hint)}</View>; break;
  }
  return <View style={shell} accessibilityLabel={`Terminal screen: ${t.title || 'idle'} ${t.line}`}>{body}</View>;
}
