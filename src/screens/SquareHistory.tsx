// Location: src/screens/SquareHistory.tsx
// Settings ▸ Square history. One-off import of old Square sales/refunds from the PC script (tools/square-history), or from another
// register that already has them (it shows a QR code holding a Wi-Fi address, see squareShareIO.ts).
// Read-only history: never touches stock, items, customers or Shopify.
import React, { useEffect, useState } from 'react';
import * as DocPicker from 'expo-document-picker';
import { View } from 'react-native';
import { Btn, Field, Row, Section, Txt, alertMsg, confirm } from '../ui/kit';
import { CameraScanner } from './Scanner';
import { QR } from '../ui/QR';
import { isManifestUrl } from '../lib/squareHistory';
import { installFromPicked, installFromUrl, rebuild, removeSquareHistory, squareMeta, type SquareMeta } from '../lib/squareHistoryIO';
import { startShare, type ShareEnd, type ShareHandle } from '../lib/squareShareIO';
import { isTraining } from '../lib/trainingGuard';

const day = (s?: string) => (s ? new Date(s).toLocaleDateString() : '-');

const ENDED: Record<ShareEnd, string> = {
  manual: '', ttl: 'Sharing stopped after 10 minutes. Start it again if the other register still needs the history.',
  background: 'Sharing stopped because the app left the screen. Start it again and keep this page open until the other register is done.',
  error: 'Sharing stopped because of a network problem.',
};

/** Shows a QR code so another register can copy this register's imported history, the way it would from the PC script. */
function ShareSection() {
  const [live, setLive] = useState<ShareHandle | null>(null); const [line, setLine] = useState(''); const [busy, setBusy] = useState(false); const [note, setNote] = useState('');
  const handle = React.useRef<ShareHandle | null>(null); const mounted = React.useRef(true);
  useEffect(() => () => { mounted.current = false; handle.current?.stop(); }, []);
  const start = async () => {
    if (isTraining()) { alertMsg('Practice mode', 'Sharing is switched off in practice mode.'); return; }
    setBusy(true); setNote('');
    try {
      const h = await startShare((l) => setLine(l), (why, msg) => { handle.current = null; setLive(null); setNote(why === 'error' && msg ? `${ENDED.error} ${msg}` : ENDED[why]); });
      if (!mounted.current) { h.stop(); return; }
      handle.current = h; setLine('Waiting for another register to scan this code…'); setLive(h);
    } catch (e: any) { alertMsg('Could not share', e.message, 'orders/square-history'); }
    if (mounted.current) setBusy(false);
  };
  return (
    <>
      <Section title="Share with another register" footer={live ? 'Keep this page open until the other register says it is done. Sharing stops by itself after 10 minutes, or when you leave this page.' : note || 'Copies this register’s imported history to another register on the same Wi-Fi, so only one register needs the PC script. The other register scans the code in Scan QR from PC.'}>
        {live ? null : <Row icon="share-outline" title="Show QR for another register" sub={busy ? 'Starting…' : 'Same Wi-Fi, other register scans it'} onPress={() => !busy && void start()} last />}
        {live ? <Row icon="stop-circle-outline" title="Stop sharing" danger onPress={() => handle.current?.stop()} last /> : null}
      </Section>
      {live ? (
        <View style={{ paddingHorizontal: 16, gap: 10, alignItems: 'center' }}>
          <QR value={live.url} size={260} label="QR code for another register to copy Square history" />
          <Txt sub>{line}</Txt>
          <Txt size={12} sub>Or type this on the other register: {live.url}</Txt>
        </View>
      ) : null}
    </>
  );
}

export function SquareHistorySettings() {
  const [meta, setMeta] = useState<SquareMeta | null>(null); const [busy, setBusy] = useState(''); const [scan, setScan] = useState(false); const [url, setUrl] = useState('');
  useEffect(() => { void squareMeta().then(setMeta); }, []);
  const run = async (fn: () => Promise<SquareMeta>) => {
    setBusy('Starting…'); try { const m = await fn(); setMeta(m); alertMsg('Square history ready', `${m.sales} sales and ${m.refunds} refunds (${day(m.from)} - ${day(m.to)}). ${m.linkedLines} of ${m.lines} item lines matched a Shopify variant by SKU; the rest show as custom items.`); }
    catch (e: any) { alertMsg('Import failed', e.message, 'orders/square-history'); } setBusy('');
  };
  const fromUrl = (u: string) => run(() => installFromUrl(u.trim(), setBusy));
  const pick = async () => {
    const r = await DocPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: '*/*' }); if (r.canceled) return;
    await run(() => installFromPicked(r.assets.map(a => ({ name: a.name, uri: a.uri })), setBusy));
  };
  return (
    <>
      <Section title="Imported history" footer="Old Square sales and refunds, kept compressed on this device. They add to Reports (as register “square”) and show in Transactions when you turn on Square history there. Nothing here changes stock, items, customers or Shopify.">
        <Row icon="archive-outline" title={meta ? `${meta.sales} sales · ${meta.refunds} refunds` : 'Nothing imported yet'} sub={meta ? `${day(meta.from)} - ${day(meta.to)} · ${meta.linkedLines}/${meta.lines} lines matched to Shopify by SKU` : 'Run the script on your PC first (tools/square-history/README.md)'} last />
      </Section>
      <Section title="Import" footer={busy || 'On the PC: run the script, then scan the QR code it shows (same Wi-Fi). Or scan the code another register shows under Share with another register. No luck with Wi-Fi? Copy the files from the script’s out folder to this iPad and use Pick files.'}>
        <Row icon="qr-code-outline" title="Scan QR from PC" onPress={() => !busy && setScan(true)} />
        <Row icon="folder-open-outline" title="Pick files (manifest.json + sales-*.json.gz)" onPress={() => !busy && void pick()} last />
      </Section>
      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        <Field kind="url" label="…or type the address the script printed" value={url} onChangeText={setUrl} placeholder="http://192.168.1.20:8787/…/manifest.json" />
        <Btn title="Import from address" kind="secondary" disabled={!!busy || !isManifestUrl(url)} onPress={() => void fromUrl(url)} />
        {busy ? <Txt sub>{busy}</Txt> : null}
      </View>
      {meta ? <ShareSection /> : null}
      {meta ? <Section title="Maintenance" footer="Re-match after you refresh the catalogue from Shopify, so new SKUs link up. This only re-reads the files already on this device.">
        <Row icon="refresh-outline" title="Re-match to Shopify catalogue" onPress={() => !busy && void run(() => rebuild(setBusy))} />
        <Row icon="trash-outline" title="Delete imported Square history" danger last onPress={async () => { if (await confirm('Delete Square history?', 'Removes the imported files from this iPad. You can import again from the PC.', 'Delete', true)) { await removeSquareHistory(); setMeta(null); } }} />
      </Section> : null}
      <CameraScanner visible={scan} title="Scan the QR code on your PC or another register" onClose={() => setScan(false)} onScan={code => { if (!isManifestUrl(code)) return null; setScan(false); void fromUrl(code); return 'Found it'; }} />
    </>
  );
}
