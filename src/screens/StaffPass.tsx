// Location: src/screens/StaffPass.tsx
// Issue, print, send (Apple Wallet) and cancel a cashier pass.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Btn, Segmented, Sheet, Txt, alertMsg, confirm } from '../ui/kit';
import { QR } from '../ui/QR';
import { Barcode128 } from '../ui/Barcode128';
import { useApp } from '../state/store';
import { getPassSecret } from '../lib/shopify/client';
import { hasBadge, hashBadge, newBadgeCode, newBadgeSalt } from '../lib/badge';
import { forgetBadge, recallBadge, rememberBadge } from '../lib/badgeStore';
import { buildPassHtml, type PassFormat } from '../lib/passCard';
import { requestStaffPass } from '../lib/passUrl';
import { pushSharedSettings } from '../lib/sync';
import type { StaffMember } from '../lib/types';

// expo-print is loaded only when someone prints. If its native module is missing or mismatched, printing fails with a message
// instead of the import crashing the whole app at launch (which shows up as a black screen in Release builds).
const loadPrint = async (): Promise<typeof import('expo-print')> => import('expo-print');

function bytesToBase64(b: Uint8Array): string {
  let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function StaffPassSheet({ memberId, visible, onClose }: { memberId: string | null; visible: boolean; onClose: () => void }) {
  const s = useApp(st => st.settings); const patch = useApp(st => st.patchSettings);
  const m = s.staff.find(x => x.id === memberId);
  const [code, setCode] = useState(''); const [format, setFormat] = useState<PassFormat>('qr'); const [busy, setBusy] = useState(''); const [msg, setMsg] = useState('');
  const shop = s.receipt.name.trim() || s.shopName.trim();

  useEffect(() => {
    setMsg(''); setCode('');
    if (!visible || !m || !hasBadge(m)) return;
    // The copy kept on this iPad only counts if it still matches the hash in the staff list (the pass may have been replaced elsewhere).
    void recallBadge(m.id).then(c => { if (c && hashBadge(m.badgeSalt!, c) === m.badgeHash) setCode(c); });
  }, [visible, memberId, m?.badgeHash]);

  const run = async (what: string, fn: () => Promise<string | void>) => {
    setBusy(what); setMsg('');
    try { const r = await fn(); if (r) setMsg(r); }
    catch (e: any) { const t = String(e?.message ?? e); if (!/cancel|did not complete/i.test(t)) setMsg(t); }
    setBusy('');
  };
  const updateMember = (f: (x: StaffMember) => StaffMember) => { patch({ staff: s.staff.map(x => (x.id === m!.id ? f(x) : x)) }); void pushSharedSettings().catch(() => {}); };

  const issue = async () => {
    if (!m) return;
    if (hasBadge(m) && !(await confirm('Replace this pass?', `The old pass for ${m.name} stops working straight away. Any printed copy or Wallet pass will need replacing.`, 'Replace', true))) return;
    const c = newBadgeCode(); const salt = newBadgeSalt();
    updateMember(x => ({ ...x, badgeSalt: salt, badgeHash: hashBadge(salt, c), badgeAt: new Date().toISOString() }));
    await rememberBadge(m.id, c); setCode(c); setMsg('New pass issued. Print it or send it to Wallet now.');
  };
  const cancel = async () => {
    if (!m || !(await confirm('Cancel this pass?', `${m.name} will only be able to sign in with their PIN.`, 'Cancel pass', true))) return;
    updateMember(x => { const { badgeSalt: _a, badgeHash: _b, badgeAt: _c, ...rest } = x; return rest; });
    await forgetBadge(m.id); setCode(''); setMsg('Pass cancelled.');
  };
  const html = () => buildPassHtml({ shop, name: m!.name, role: m!.role, code, format });
  const wallet = () => run('wallet', async () => {
    const base = s.passServerUrl.trim(); const secret = await getPassSecret();
    if (!base || !secret) throw new Error('Set the pass server link and secret first, in Settings ▸ Gift cards.');
    const bytes = await requestStaffPass(base, secret, { name: m!.name, role: m!.role, code, format, shop });
    const path = `${FS.cacheDirectory}cashier-${m!.id.slice(0, 8)}.pkpass`;
    await FS.writeAsStringAsync(path, bytesToBase64(bytes), { encoding: FS.EncodingType.Base64 });
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
    await Sharing.shareAsync(path, { mimeType: 'application/vnd.apple.pkpass', UTI: 'com.apple.pkpass', dialogTitle: `${m!.name}'s cashier pass` });
    return `Pass created. Send it to ${m!.name}'s iPhone with AirDrop, Messages or Mail, then tap Add.`;
  });
  const print = () => run('print', async () => { const Print = await loadPrint(); await Print.printAsync({ html: html() }); });
  const pdf = () => run('pdf', async () => {
    const Print = await loadPrint(); const { uri } = await Print.printToFileAsync({ html: html(), width: 595, height: 842 });
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `${m!.name} cashier pass` });
  });

  if (!m) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  return (
    <Sheet visible={visible} onClose={onClose} title={`${m.name}'s pass`} full>
      {!hasBadge(m) ? <View style={{ gap: 12 }}>
        <Txt sub>A cashier pass is a barcode that signs {m.name} in when scanned, instead of typing a PIN. It also works for taking over the register from someone else. You can print it or add it to Apple Wallet.</Txt>
        <Btn title="Issue pass" icon="qr-code-outline" onPress={() => void issue()} />
      </View> : !code ? <View style={{ gap: 12 }}>
        <Txt>A pass has been issued for {m.name}, but this iPad does not hold its code. Only the iPad that issued it can print or send it again.</Txt>
        <Txt sub>To print or send a pass from here, replace it. The old pass stops working.</Txt>
        <Btn title="Replace pass" kind="secondary" onPress={() => void issue()} />
        <Btn title="Cancel pass" kind="ghost" onPress={() => void cancel()} />
      </View> : <View style={{ gap: 12 }}>
        <View style={{ backgroundColor: '#111', borderRadius: 16, padding: 18, gap: 4 }}>
          <Txt size={11} color="#BBB" style={{ letterSpacing: 1.5 }}>{(shop || 'REGISTER').toUpperCase()}</Txt>
          <Txt size={24} weight="700" color="#fff">{m.name}</Txt><Txt color="#CCC">{cap(m.role)} pass</Txt>
          <View style={{ marginTop: 12 }}>{format === 'qr' ? <QR value={code} size={170} /> : <Barcode128 value={code} width={290} height={64} />}</View>
        </View>
        <Segmented value={format} onChange={setFormat} options={[{ v: 'qr', label: 'QR code' }, { v: 'code128', label: 'Code 128' }]} />
        <Txt size={12} sub>QR works with the camera and most Bluetooth scanners. Choose Code 128 if your scanner only reads standard shop barcodes.</Txt>
        <Btn title="Send to Apple Wallet" icon="wallet-outline" onPress={() => void wallet()} busy={busy === 'wallet'} disabled={!!busy} />
        <Btn title="Print pass" kind="secondary" icon="print-outline" onPress={() => void print()} busy={busy === 'print'} disabled={!!busy} />
        <Btn title="Save or share as PDF" kind="secondary" icon="document-outline" onPress={() => void pdf()} busy={busy === 'pdf'} disabled={!!busy} />
        <Btn title="Replace pass (cancels the old one)" kind="ghost" onPress={() => void issue()} />
        <Btn title="Cancel pass" kind="ghost" onPress={() => void cancel()} />
      </View>}
      {msg ? <Txt size={13} sub style={{ marginTop: 10 }}>{msg}</Txt> : null}
    </Sheet>
  );
}
void alertMsg;