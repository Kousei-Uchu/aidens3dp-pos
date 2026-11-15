// Location: src/screens/SetupTransfer.tsx
// 0246: set up a new register or companion from one that is already set up, by QR over the shop Wi-Fi (no iCloud needed).
// `ShareSetupSection` is the set up device (Settings ▸ Backup & transfer); `SetupFromQrRow` is the new one (the same page, and the
// top of the first-run Set up this device page). The rules are in lib/setupTransfer.ts and the sockets in lib/setupTransferIO.ts.
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Row, Section, Txt, alertMsg, confirm } from '../ui/kit';
import { QR } from '../ui/QR';
import { CameraScanner } from './Scanner';
import { requireStepUp } from '../lib/stepUpGate';
import { isTraining } from '../lib/trainingGuard';
import { applyBackup } from '../lib/backupIO';
import { importFromShopify } from '../lib/sync';
import { hasCreds } from '../lib/shopify/client';
import { useApp } from '../state/store';
import { fetchSetupBackup, startSetupShare, type SetupShareHandle } from '../lib/setupTransferIO';
import { SETUP_END_TEXT, looksLikeSetupQr, parseSetupQr, type SetupEnd } from '../lib/setupTransfer';

/** The set up device: shows the QR and serves the sealed setup once. */
export function ShareSetupSection() {
  const [live, setLive] = useState<SetupShareHandle | null>(null); const [line, setLine] = useState(''); const [busy, setBusy] = useState(false); const [note, setNote] = useState('');
  const handle = useRef<SetupShareHandle | null>(null); const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; handle.current?.stop(); }, []);
  const start = async () => {
    if (isTraining()) { alertMsg('Practice mode', 'Sharing setup is switched off in practice mode.'); return; }
    if (!(await requireStepUp('admin'))) return;
    setBusy(true); setNote('');
    try {
      const h = await startSetupShare(l => { if (mounted.current) setLine(l); }, (why: SetupEnd, msg) => { handle.current = null; if (!mounted.current) return; setLive(null); setNote(why === 'error' && msg ? `${SETUP_END_TEXT.error} ${msg}` : SETUP_END_TEXT[why]); });
      if (!mounted.current) { h.stop(); return; }
      handle.current = h; setLive(h);
    } catch (e: any) { alertMsg('Could not share setup', e?.message ?? String(e)); }
    if (mounted.current) setBusy(false);
  };
  return (
    <>
      <Section title="Set up another device" footer={live ? 'Keep this page open until the new device says it is done. The code works once, and stops after 5 minutes or when you leave this page.' : note || 'Copies this device’s settings, staff, grid layout and Shopify and other logins to a new register or companion on the same Wi-Fi. It does not copy sales, the catalogue (that comes from Shopify) or the new device’s own name and mode.'}>
        {live ? <Row icon="stop-circle-outline" title="Stop sharing" danger onPress={() => handle.current?.stop()} last />
          : <Row icon="qr-code-outline" title="Show setup QR" sub={busy ? 'Sealing the setup…' : 'The new device scans it'} onPress={() => !busy && void start()} last />}
      </Section>
      {live ? (
        <View style={{ paddingHorizontal: 16, gap: 10, alignItems: 'center' }}>
          <QR value={live.qr} size={260} label="QR code that sets up another device" />
          <Txt sub>{line}</Txt>
          <Txt size={12} sub style={{ textAlign: 'center' }}>Anyone who scans this code in the next few minutes can copy your logins. Show it only to the new device.</Txt>
        </View>
      ) : null}
    </>
  );
}

/** The new device: one row that opens the camera, then fetches, opens and applies the setup. */
export function SetupFromQrRow({ last }: { last?: boolean }) {
  const [scan, setScan] = useState(false); const [busy, setBusy] = useState('');
  const go = async (code: string) => {
    const t = parseSetupQr(code); if (!t) { alertMsg('Not a setup code', 'Show the code under Settings ▸ Backup & transfer ▸ Show setup QR on the set up device.'); return; }
    if (!(await confirm('Set up this device from the one at ' + t.ip + '?', 'This replaces the settings, staff, grid layout and Shopify login on this device with that device’s. This device keeps its own name and mode.', 'Set up', true))) return;
    if (!(await requireStepUp('admin'))) return;
    try {
      setBusy('Fetching the setup…'); const b = await fetchSetupBackup(t);
      setBusy('Applying…'); let msg = await applyBackup(b);
      useApp.getState().patchSettings({}); // the logins went to the Keychain, which the setup checklist reads on its next draw
      const s = useApp.getState().settings;
      if (hasCreds() && s.locationId) {
        try { setBusy('Loading the catalogue…'); const r = await importFromShopify(m => setBusy(m)); msg = `Set up. Loaded ${r.variants} items from Shopify.`; }
        catch (e: any) { msg += ` The catalogue could not load yet (${e?.message ?? e}). Tap Import from Shopify under Settings ▸ Shopify.`; }
      }
      alertMsg('Set up from the other device', msg);
    } catch (e: any) { alertMsg('Could not set up', e?.message ?? String(e)); }
    setBusy('');
  };
  return (
    <>
      <Row icon="qr-code-outline" title="Set up from another device" sub={busy || 'Scan the code another register shows'} last={last}
        onPress={() => { if (busy) return; if (isTraining()) { alertMsg('Practice mode', 'Setting up from another device is switched off in practice mode.'); return; } setScan(true); }} />
      <CameraScanner visible={scan} title="Scan the setup code on the other device" onClose={() => setScan(false)}
        onScan={code => { if (!looksLikeSetupQr(code)) return null; setScan(false); void go(code); return 'Found it'; }} />
    </>
  );
}
