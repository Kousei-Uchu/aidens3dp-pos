import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Btn, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { noteActivity } from '../lib/idle';
import { isUserTyping } from '../lib/focusGuard';

/** Camera scanner. `onScan` returns a short confirmation ("Added Dragon plush") or null if the code was unknown. Stays open until Done. */
export function CameraScanner({ visible, onClose, onScan, title = 'Scan barcode' }: { visible: boolean; onClose: () => void; onScan: (code: string) => string | null | Promise<string | null>; title?: string }) {
  const { c } = useTheme(); const [perm, ask] = useCameraPermissions();
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null); const lock = useRef(0); const lastCode = useRef('');
  useEffect(() => { if (visible && perm && !perm.granted && perm.canAskAgain) void ask(); if (!visible) setLast(null); }, [visible, perm]);
  const handle = async (code: string) => {
    noteActivity(); const now = Date.now(); if (now - lock.current < 1200 && code === lastCode.current) return; lock.current = now; lastCode.current = code;
    const r = await onScan(code); setLast(r ? { ok: true, text: r } : { ok: false, text: `Not found: ${code}` });
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {perm?.granted ? <CameraView style={{ flex: 1 }} facing="back" onBarcodeScanned={e => void handle(e.data)}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr', 'itf14'] }} />
          : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 14 }}><Text style={{ color: '#fff', textAlign: 'center' }}>Camera access is needed to scan. Enable it in Settings ▸ Privacy ▸ Camera.</Text><Btn title="Allow camera" onPress={() => void ask()} /></View>}
        <View style={{ position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>{title}</Text></View>
        <View style={{ position: 'absolute', bottom: 40, left: 20, right: 20, gap: 12 }}>
          {last ? <View style={{ backgroundColor: last.ok ? '#15803D' : '#B91C1C', padding: 14, borderRadius: 14 }}><Text style={{ color: '#fff', fontWeight: '600', textAlign: 'center' }}>{last.text}</Text></View> : null}
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
export function HidScanner({ onScan, enabled = true }: { onScan: (code: string) => void; enabled?: boolean }) {
  const ref = useRef<TextInput>(null); const value = useRef(''); const [inputKey, setInputKey] = useState(0);
  // Never grab focus while someone is typing in a real field (that is what made the keyboard vanish): the guard
  // knows about every <Field>, and Keyboard.isVisible() covers any raw TextInput we don't own.
  const canGrab = () => !isUserTyping() && !Keyboard.isVisible();
  useEffect(() => {
    if (!enabled) return;
    if (canGrab()) ref.current?.focus();
    const t = setInterval(() => { if (ref.current && !ref.current.isFocused() && canGrab()) ref.current.focus(); }, 1500);
    return () => clearInterval(t);
  }, [enabled]);
  useEffect(() => {
    if (enabled && canGrab()) ref.current?.focus();
  }, [enabled, inputKey]);
  if (!enabled) return null;
  return <TextInput key={inputKey} ref={ref} onChangeText={t => { noteActivity(); value.current = t; }} showSoftInputOnFocus={false} autoCorrect={false} autoCapitalize="none" blurOnSubmit={false} caretHidden
    onSubmitEditing={({ nativeEvent }) => {
      const code = (nativeEvent.text || value.current).trim();
      value.current = '';
      setInputKey(key => key + 1);
      if (code) onScan(code);
    }} style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01, top: 0, left: 0 }} accessibilityElementsHidden importantForAccessibility="no" />;
}
export const ScannerHint = () => <Txt size={12} sub>Bluetooth scanner ready</Txt>;
