// Location: src/ui/StepUpHost.tsx
// The PIN prompt for sensitive actions on a Companion (rules in src/lib/stepUp.ts). Mounted once in App.tsx.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Btn, Field, Sheet, Txt } from '../ui/kit';
import { useApp } from '../state/store';
import { useStepUp } from '../state/stepUp';
import { verifyPin } from '../lib/pin';
import { STEP_UP_INFO, tooManyTries } from '../lib/stepUp';
import { lockIdle } from '../lib/staffAuth';

export default function StepUpHost() {
  const ask = useStepUp(s => s.ask); const close = useStepUp(s => s.close);
  const [pin, setPin] = useState(''); const [wrong, setWrong] = useState(0); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  useEffect(() => { if (ask) { setPin(''); setWrong(0); setMsg(''); } }, [ask]);
  if (!ask) return null;
  const info = STEP_UP_INFO[ask.action];
  const confirm = async () => {
    const st = useApp.getState(); const me = st.settings.staff.find(x => x.id === st.staffId);
    setBusy(true);
    try {
      const pool = me ? [me] : st.settings.staff; // whoever is signed in; if nobody is, any PIN on the team will do
      let ok = false; for (const m of pool) if (await verifyPin(m.salt, pin, m.pinHash)) { ok = true; break; }
      if (ok) { useApp.getState().set({ lastPinAt: Date.now() }); close(true); return; }
      const n = wrong + 1; setWrong(n); setPin('');
      if (tooManyTries(n)) { close(false); lockIdle(); return; }
      setMsg('Wrong PIN');
    } finally { setBusy(false); }
  };
  return (
    <Sheet visible onClose={() => close(false)} title={info.title}>
      <Txt style={{ marginBottom: 12 }}>{info.why}</Txt>
      <Field label="PIN" value={pin} onChangeText={t => { setPin(t.replace(/\D/g, '')); setMsg(''); }} keyboardType="number-pad" secureTextEntry maxLength={6} autoFocus />
      {msg ? <Txt color="#c0392b" style={{ marginBottom: 10 }}>{msg}</Txt> : null}
      <View style={{ gap: 8 }}><Btn title="Confirm" busy={busy} disabled={pin.length < 4} onPress={() => { void confirm(); }} /><Btn kind="ghost" title="Cancel" onPress={() => close(false)} /></View>
    </Sheet>
  );
}
