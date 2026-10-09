// Location: src/screens/StaffLogin.tsx
// PIN pad + pass scanning, shared by the lock screen and the "Switch staff" sheet.
import React, { useState } from 'react';
import { View } from 'react-native';
import { Btn, Sheet, Txt } from '../ui/kit';
import { useApp } from '../state/store';
import { CameraScanner, HidScanner } from './Scanner';
import { isBadgeCode } from '../lib/badge';
import { lockRegister, signInWithPass, signInWithPin, type SignInResult } from '../lib/staffAuth';

export const PinPad = ({ onKey }: { onKey: (k: string) => void }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: 280 }}>
    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => k ? <Btn key={i} title={k} kind="secondary" onPress={() => onKey(k)} style={{ width: 88 }} /> : <View key={i} style={{ width: 88 }} />)}
  </View>
);

/** Enter a PIN, or scan a pass with the Bluetooth scanner or the camera. `onDone` runs after a successful sign-in. */
export function StaffLoginPad({ onDone, scannerOn = true }: { onDone: (r: SignInResult) => void; scannerOn?: boolean }) {
  const [pin, setPin] = useState(''); const [err, setErr] = useState(''); const [cam, setCam] = useState(false);
  const finish = (r: SignInResult) => { if (r.ok) { setPin(''); setErr(''); onDone(r); } else { setErr(r.message); setPin(''); } };
  const tryPin = async (p: string, quiet: boolean) => { const r = await signInWithPin(p); if (r.ok) finish(r); else if (!quiet) finish(r); };
  const onScan = async (code: string): Promise<string | null> => {
    if (!isBadgeCode(code)) return null;
    const r = await signInWithPass(code); finish(r); if (r.ok) setCam(false);
    return r.ok ? r.message : null;
  };
  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <Txt size={30} style={{ letterSpacing: 8 }}>{'•'.repeat(pin.length) || ' '}</Txt>
      {err ? <Txt color="#DC2626" style={{ textAlign: 'center' }}>{err}</Txt> : null}
      <PinPad onKey={k => { setErr(''); if (k === '⌫') setPin(p => p.slice(0, -1)); else { const n = (pin + k).slice(0, 6); setPin(n); if (n.length >= 4) void tryPin(n, true); } }} />
      <Btn title="Unlock" onPress={() => void tryPin(pin, false)} disabled={pin.length < 4} style={{ width: 280 }} />
      <Btn title="Scan pass" kind="secondary" icon="qr-code-outline" onPress={() => setCam(true)} style={{ width: 280 }} />
      <Txt size={13} sub style={{ textAlign: 'center' }}>Enter your PIN, or scan your cashier pass with the scanner.</Txt>
      <HidScanner enabled={scannerOn && !cam} onScan={code => { if (isBadgeCode(code)) void onScan(code); else setErr('That is not a cashier pass.'); }} />
      <CameraScanner visible={cam} onClose={() => setCam(false)} title="Scan your cashier pass" onScan={onScan} />
    </View>
  );
}

/** Quick staff change from the Checkout grid or header: sign in as someone else without locking the register first. */
export function SwitchStaffSheet({ visible, onClose, onSwitched }: { visible: boolean; onClose: () => void; onSwitched?: (message: string) => void }) {
  const staff = useApp(s => s.settings.staff); const requirePin = useApp(s => s.settings.requirePin);
  const cur = useApp(s => s.settings.staff.find(x => x.id === s.staffId));
  return (
    <Sheet visible={visible} onClose={onClose} title="Switch staff">
      {staff.length === 0 ? <Txt sub>No staff yet. Add people in More ▸ Staff first.</Txt> : <View style={{ alignItems: 'center', gap: 14 }}>
        <Txt sub>{cur ? `Signed in as ${cur.name} (${cur.role}).` : 'Nobody is signed in.'} The next PIN or pass takes over, and the cart stays as it is.</Txt>
        <StaffLoginPad scannerOn={visible} onDone={r => { onSwitched?.(r.message); onClose(); }} />
        {requirePin ? <Btn title="Lock register" kind="ghost" onPress={() => { lockRegister(); onClose(); }} style={{ width: 280 }} /> : null}
      </View>}
    </Sheet>
  );
}
