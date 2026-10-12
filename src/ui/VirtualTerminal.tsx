// Location: src/ui/VirtualTerminal.tsx
// The virtual Zeller Terminal 2 as a device: the body, the screen (TerminalFace) and, in manual mode, the customer's hands (tap a card, insert a card, take it out).
// `useVt` turns a controller (src/lib/virtualTerminalSession.ts) into React state. Used by the playground page and, from the next patch, by practice.
import React, { useCallback, useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import { spotPressed, spotRefFor } from './Spot';
import { SPOT } from '../lib/trainingSpots';
import { Ionicons } from '@expo/vector-icons';
import TerminalFace, { FACE_ASPECT, type FaceBrand } from './TerminalFace';
import { Txt } from './kit';
import { useTheme } from './theme';
import { useApp } from '../state/store';
import { logoSource, normaliseHex } from '../lib/screensaver';
import type { VtController } from '../lib/virtualTerminalSession';
import type { VtState } from '../lib/virtualTerminal';

export function useVt(vt: VtController): VtState {
  const sub = useCallback((cb: () => void) => vt.subscribe(() => cb()), [vt]);
  return useSyncExternalStore(sub, vt.get, vt.get);
}
/** The business's own idle screen: its screensaver logo on its screensaver colour (Settings ▸ Screensaver & display), so the practice terminal wakes up looking like the real one. */
export function useFaceBrand(): FaceBrand {
  const ss = useApp(s => s.settings.screensaver);
  return { bg: normaliseHex(ss.bgColor) ?? '#13111C', logo: logoSource(ss) };
}
/** Device body around the face. `w` is the width of the whole device. */
export function TerminalBody({ s, w, brand, onKey, onCancel, onDone, spots }: { s: VtState; w: number; brand?: FaceBrand; onKey?: (k: string) => void; onCancel?: () => void; onDone?: () => void; spots?: boolean }) {
  const bezel = w * 0.05; const inner = w - bezel * 2; const lit = s.screen !== 'sleep';
  return (
    <View style={{ width: w, padding: bezel, paddingBottom: bezel * 1.8, borderRadius: w * 0.11, backgroundColor: '#0E0E10', borderWidth: 1.5, borderColor: '#2A2A2E', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
      <View style={{ width: inner, height: inner * FACE_ASPECT, borderRadius: w * 0.07, overflow: 'hidden' }}>
        <TerminalFace s={s} w={inner} brand={brand} onKey={onKey} onCancel={onCancel} onDone={onDone} spots={spots} /></View>
      <View style={{ marginTop: bezel * 0.7, width: inner * 0.34, height: 3, borderRadius: 2, backgroundColor: lit ? '#3A3A40' : '#222226' }} accessibilityLabel="Card slot" />
    </View>);
}

/** The terminal and its customer controls, wired to a controller. */
/** `spots` makes the terminal's buttons things training can point at and listen to. Only the practice terminal sets it. */
export default function VirtualTerminal({ vt, width = 260, controls = true, brand, spots = false }: { vt: VtController; width?: number; controls?: boolean; brand?: FaceBrand; spots?: boolean }) {
  const { c } = useTheme(); const s = useVt(vt); const own = useFaceBrand(); const b = brand ?? own;
  const manual = vt.manual; const canPresent = manual && s.screen === 'amount'; const canRemove = manual && s.screen === 'removeCard';
  const btn = (label: string, icon: React.ComponentProps<typeof Ionicons>['name'], on: boolean, f: () => void, spot?: string) => (
    <Pressable ref={spots && spot ? spotRefFor(spot) : undefined} collapsable={false} accessibilityRole="button" accessibilityLabel={label} disabled={!on} onPress={() => { if (spots) spotPressed(spot); f(); }}
      style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 999, backgroundColor: on ? c.accent : c.fill, opacity: on ? 1 : 0.5 }}>
      <Ionicons name={icon} size={18} color={on ? c.onAccent : c.sub} /><Txt size={14} weight="700" color={on ? c.onAccent : c.sub}>{label}</Txt></Pressable>);
  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <TerminalBody s={s} w={width} brand={b} spots={spots}
        onKey={manual ? k => { if (spots) spotPressed(k === 'ok' ? SPOT.terminalPinOk : SPOT.terminalPinpad); vt.dispatch({ t: 'key', key: k }); } : undefined}
        onCancel={() => { if (spots) spotPressed(SPOT.terminalCancel); vt.dispatch({ t: 'cancel' }); }} onDone={() => { if (spots) spotPressed(SPOT.terminalDone); vt.dispatch({ t: 'next' }); }} />
      {controls ? <View style={{ width: Math.max(width, 260), gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {btn('Tap card', 'wifi', canPresent, () => vt.dispatch({ t: 'present', media: 'TAP' }), SPOT.terminalTap)}
          {btn('Insert card', 'card-outline', canPresent, () => vt.dispatch({ t: 'present', media: 'INSERT' }), SPOT.terminalInsert)}</View>
        {canRemove ? btn('Take card out', 'arrow-down-circle-outline', true, () => vt.dispatch({ t: 'removed' }), SPOT.terminalRemove) : null}
        <Txt size={12} sub style={{ textAlign: 'center' }}>{manual ? 'You are the customer: tap or insert the card when the terminal asks, and key the PIN on its screen.' : 'The terminal plays the customer: it taps a card by itself.'}</Txt>
      </View> : null}
    </View>);
}
