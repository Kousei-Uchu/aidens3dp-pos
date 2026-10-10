// Location: src/screens/SquareHistory.tsx
// Settings ▸ Square history. One-off import of old Square sales/refunds from the PC script (tools/square-history).
// Read-only history: never touches stock, items, customers or Shopify.
import React, { useEffect, useState } from 'react';
import * as DocPicker from 'expo-document-picker';
import { View } from 'react-native';
import { Btn, Field, Row, Section, Txt, alertMsg, confirm } from '../ui/kit';
import { CameraScanner } from './Scanner';
import { isManifestUrl } from '../lib/squareHistory';
import { installFromPicked, installFromUrl, rebuild, removeSquareHistory, squareMeta, type SquareMeta } from '../lib/squareHistoryIO';

const day = (s?: string) => (s ? new Date(s).toLocaleDateString() : '—');

export function SquareHistorySettings() {
  const [meta, setMeta] = useState<SquareMeta | null>(null); const [busy, setBusy] = useState(''); const [scan, setScan] = useState(false); const [url, setUrl] = useState('');
  useEffect(() => { void squareMeta().then(setMeta); }, []);
  const run = async (fn: () => Promise<SquareMeta>) => {
    setBusy('Starting…'); try { const m = await fn(); setMeta(m); alertMsg('Square history ready', `${m.sales} sales and ${m.refunds} refunds (${day(m.from)} – ${day(m.to)}). ${m.linkedLines} of ${m.lines} item lines matched a Shopify variant by SKU; the rest show as custom items.`); }
    catch (e: any) { alertMsg('Import failed', e.message); } setBusy('');
  };
  const fromUrl = (u: string) => run(() => installFromUrl(u.trim(), setBusy));
  const pick = async () => {
    const r = await DocPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: '*/*' }); if (r.canceled) return;
    await run(() => installFromPicked(r.assets.map(a => ({ name: a.name, uri: a.uri })), setBusy));
  };
  return (
    <>
      <Section title="Imported history" footer="Old Square sales and refunds, kept compressed on this device. They add to Reports (as register “square”) and show in Transactions when you turn on Square history there. Nothing here changes stock, items, customers or Shopify.">
        <Row icon="archive-outline" title={meta ? `${meta.sales} sales · ${meta.refunds} refunds` : 'Nothing imported yet'} sub={meta ? `${day(meta.from)} – ${day(meta.to)} · ${meta.linkedLines}/${meta.lines} lines matched to Shopify by SKU` : 'Run the script on your PC first (tools/square-history/README.md)'} last />
      </Section>
      <Section title="Import" footer={busy || 'On the PC: run the script, then scan the QR code it shows (same Wi-Fi). No luck with Wi-Fi? Copy the files from the script’s out folder to this iPad and use Pick files.'}>
        <Row icon="qr-code-outline" title="Scan QR from PC" onPress={() => !busy && setScan(true)} />
        <Row icon="folder-open-outline" title="Pick files (manifest.json + sales-*.json.gz)" onPress={() => !busy && void pick()} last />
      </Section>
      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        <Field kind="url" label="…or type the address the script printed" value={url} onChangeText={setUrl} placeholder="http://192.168.1.20:8787/…/manifest.json" />
        <Btn title="Import from address" kind="secondary" disabled={!!busy || !isManifestUrl(url)} onPress={() => void fromUrl(url)} />
        {busy ? <Txt sub>{busy}</Txt> : null}
      </View>
      {meta ? <Section title="Maintenance" footer="Re-match after you refresh the catalogue from Shopify, so new SKUs link up. This only re-reads the files already on this device.">
        <Row icon="refresh-outline" title="Re-match to Shopify catalogue" onPress={() => !busy && void run(() => rebuild(setBusy))} />
        <Row icon="trash-outline" title="Delete imported Square history" danger last onPress={async () => { if (await confirm('Delete Square history?', 'Removes the imported files from this iPad. You can import again from the PC.', 'Delete', true)) { await removeSquareHistory(); setMeta(null); } }} />
      </Section> : null}
      <CameraScanner visible={scan} title="Scan the QR code on your PC" onClose={() => setScan(false)} onScan={code => { if (!isManifestUrl(code)) return null; setScan(false); void fromUrl(code); return 'Found it'; }} />
    </>
  );
}
