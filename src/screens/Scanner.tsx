import React, { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Btn, Txt } from '../ui/kit';
import { noteActivity } from '../lib/idle';
import { isUserTyping } from '../lib/focusGuard';
import { onRefocusAsked, refocusRequests } from '../lib/scanFocus';
import { popupOpacity, popupTiming, scanReply, shakeOffset, type ScanReply } from '../lib/scanFeedback';
import { feelCapture, feelScan } from '../ui/scanFeedback';
import { isTraining } from '../lib/trainingGuard';
import { PracticePassSheet } from '../ui/PracticePass';
import { PracticeScanSheet } from '../ui/PracticeScan';

/** Camera scanner. `onScan` returns a short confirmation ("Added Dragon plush") or null if the code was unknown. Stays open until Done. In practice a window of drawn practice barcodes stands in for the camera. */
export function CameraScanner(p: { visible: boolean; onClose: () => void; onScan: (code: string) => string | null | Promise<string | null>; title?: string; /** Scanning a cashier pass. In practice a drawn pass stands in for the camera. */ pass?: boolean }) {
  if (isTraining()) return p.pass ? <PracticePassSheet visible={p.visible} onClose={p.onClose} onScan={p.onScan} title={p.title} /> : <PracticeScanSheet visible={p.visible} onClose={p.onClose} onScan={p.onScan} title={p.title} />;
  return <RealCameraScanner {...p} />;
}
/**
 * The camera's own confirmation, S4 and S5. It is a toast over the viewfinder rather than the checkout pane popup: the
 * camera sheet is the only thing on screen, so there is no grid to fill. It shares the pane's shape (hold, then a rising
 * slope, dismissed at once on a tap) and it carries the miss case, which the pane popup never sees: a code the till does
 * not know wobbles the bar and buzzes harder than a hit.
 */
function CameraFlash({ reply, onDismiss }: { reply: ScanReply; onDismiss: () => void }) {
  const timing = popupTiming(reply.ok); const [elapsed, setElapsed] = useState(0); const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    setElapsed(0);
    const start = Date.now(); const t = setInterval(() => { const e = Date.now() - start; setElapsed(e); if (e >= timing.goneMs) clearInterval(t); }, 50);
    return () => clearInterval(t);
  }, [reply.text, reply.ok]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (reply.ok) return;
    const start = Date.now(); const t = setInterval(() => { const e = Date.now() - start; shake.setValue(shakeOffset(e)); if (e >= 520) { shake.setValue(0); clearInterval(t); } }, 16);
    return () => { clearInterval(t); shake.setValue(0); };
  }, [reply.text, reply.ok, shake]);
  return (
    <Animated.View style={{ opacity: popupOpacity(elapsed, reply.ok), transform: [{ translateX: shake }] }}>
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel={`Scan result: ${reply.text}. Dismiss`} accessibilityLiveRegion="polite"
        style={{ backgroundColor: reply.ok ? '#15803D' : '#B91C1C', paddingHorizontal: 18, paddingVertical: 14, borderRadius: 14 }}>
        <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>{reply.text}</Text>
      </Pressable>
    </Animated.View>
  );
}
function RealCameraScanner({ visible, onClose, onScan, title = 'Scan barcode' }: { visible: boolean; onClose: () => void; onScan: (code: string) => string | null | Promise<string | null>; title?: string }) {
  const [perm, ask] = useCameraPermissions();
  const [last, setLast] = useState<ScanReply | null>(null); const lock = useRef(0); const lastCode = useRef('');
  useEffect(() => { if (visible && perm && !perm.granted && perm.canAskAgain) void ask(); if (!visible) setLast(null); }, [visible, perm]);
  const handle = async (code: string) => {
    noteActivity(); const now = Date.now(); if (now - lock.current < 1200 && code === lastCode.current) return; lock.current = now; lastCode.current = code;
    feelCapture();
    const r = await onScan(code); const reply = scanReply(r, code);
    feelScan({ ok: reply.ok, strength: reply.ok ? 0 : 0.4 }); // a product the till cannot use is a warning, not an error
    setLast(reply);
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {perm?.granted ? <CameraView style={{ flex: 1 }} facing="back" onBarcodeScanned={e => void handle(e.data)}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr', 'itf14'] }} />
          : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 14 }}><Text style={{ color: '#fff', textAlign: 'center' }}>Camera access is needed to scan. Enable it in Settings ▸ Privacy ▸ Camera.</Text><Btn title="Allow camera" onPress={() => void ask()} /></View>}
        <View style={{ position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>{title}</Text></View>
        <View style={{ position: 'absolute', bottom: 40, left: 20, right: 20, gap: 12 }}>
          {last ? <CameraFlash reply={last} onDismiss={() => setLast(null)} /> : null}
          <Btn title="Done" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

/**
 * Bluetooth HID scanners type the code then press Return. A hidden, always-focused TextInput captures that.
 * Mounted only on screens where scanning should add to the cart.
 */
export function HidScanner({ onScan, enabled = true, onText }: { onScan: (code: string) => void; enabled?: boolean; /** Opt in to timing: called on every change of the scan box with the text so far and a millisecond clock. Leave it off and the box is read on Return only. */ onText?: (text: string, now: number) => void }) {
  const ref = useRef<TextInput>(null); const value = useRef(''); const [inputKey, setInputKey] = useState(0);
  // Never grab focus while someone is typing in a real field (that is what made the keyboard vanish): the guard
  // knows about every <Field>, and Keyboard.isVisible() covers any raw TextInput we don't own.
  const canGrab = () => !isUserTyping() && !Keyboard.isVisible();
  // The screensaver waking, and any scan (S3), asks the input to take focus. Remounting it with a new key clears
  // whatever is left in it and steals focus back from a field the screensaver covered.
  const [asked, setAsked] = useState(() => refocusRequests());
  const refocus = useRef(() => setInputKey(k => k + 1));
  refocus.current = () => { if (!isUserTyping() && !Keyboard.isVisible()) setInputKey(k => k + 1); };
  useEffect(() => { if (!enabled) return undefined; return onRefocusAsked(() => setAsked(refocusRequests())); }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    if (canGrab()) ref.current?.focus();
    const t = setInterval(() => { if (ref.current && !ref.current.isFocused() && canGrab()) ref.current.focus(); }, 1500);
    return () => clearInterval(t);
  }, [enabled]);
  useEffect(() => {
    if (enabled && canGrab()) ref.current?.focus();
  }, [enabled, inputKey, asked]);
  if (!enabled) return null;
  // Everyday scanning (Checkout, Pay, sign-in, lookups) reads the code on Return only: no `onText`, no clock, nothing run per character.
  // Only a caller that passes `onText` (the Hardware page, the speed test and calibration) gets the per-character timing.
  const onChange = onText ? (t: string) => { noteActivity(); value.current = t; onText(t, nowMs()); } : (t: string) => { noteActivity(); value.current = t; };
  return <TextInput key={inputKey} ref={ref} onChangeText={onChange} showSoftInputOnFocus={false} autoCorrect={false} autoCapitalize="none" blurOnSubmit={false} caretHidden
    onSubmitEditing={({ nativeEvent }) => {
      const code = (nativeEvent.text || value.current).trim();
      value.current = '';
      setInputKey(key => key + 1);
      if (code) onScan(code);
    }} style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01, top: 0, left: 0 }} accessibilityElementsHidden importantForAccessibility="no" />;
}
/** A millisecond clock that is never set back (performance.now when there is one). */
export const nowMs = (): number => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
export const ScannerHint = () => <Txt size={12} sub>Bluetooth scanner ready</Txt>;
