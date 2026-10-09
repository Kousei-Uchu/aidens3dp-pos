// Location: src/screens/Settings.tsx
import React, { useEffect, useState } from 'react';
import { Image, Linking, Pressable, Share, View } from 'react-native';
import * as DocPicker from 'expo-document-picker';
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Btn, Card, Chip, Field, Page, Row, Section, Segmented, Sheet, Toggle, Txt, alertMsg, confirm } from '../ui/kit';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { getReceiptSecret, setReceiptSecret, getPassSecret, setPassSecret, clearCreds, getToken, hasCreds, loadCreds, saveCreds, shopDomain, tokenScopes, normaliseDomain } from '../lib/shopify/client';
import { fetchShop } from '../lib/shopify/catalogue';
import { ensureDefinitions } from '../lib/shopify/metaobjects';
import { importFromShopify, pushLayout, pushSharedSettings, pollShared } from '../lib/sync';
import { uploadSampleReceipt } from '../lib/receiptSync';
import { csv } from '../lib/csvStore';
import { backupFileName, decryptBackup, detectBackup, encryptBackup, MIN_PASSPHRASE, validateBackup } from '../lib/backupFile';
import { applyBackup, collectBackup } from '../lib/backupIO';
import { IDLE_CHOICES, LOCKED_CHOICES, SWATCHES, contrastOn, logoSource, normaliseHex, type ScreensaverSettings } from '../lib/screensaver';
import { parseGrid, serialiseGrid } from '../lib/grid';
import { parseBundleConfig, validateBundleConfig } from '../lib/bundles';
import { HidScanner } from './Scanner';
import { GIFT_CARD_PASSES } from '../lib/features';
import { TILE_COLORS, useTheme } from '../ui/theme';

type Sub = 'menu' | 'shopify' | 'payments' | 'discounts' | 'hardware' | 'data' | 'grid' | 'gift' | 'receipts' | 'backup' | 'display' | 'theme' | 'about';
const SAMPLE_BUNDLES = JSON.stringify({ version: 1, items: { set_a: ['gid://shopify/Product/1'], set_b: ['gid://shopify/Product/2'] }, discounts: [{ id: 'combo', label: 'Combo deal', sets: ['set_a', 'set_b'], price_delta_cents: -500, apply_to: 'set_b', max_per_cart: 5 }] }, null, 2);

export default function Settings() {
  const nav = useNav(); const [sub, setSub] = useState<Sub>('menu'); const back = () => (sub === 'menu' ? nav.pop() : setSub('menu'));
  const s = useApp(st => st.settings); const patch = useApp(st => st.patchSettings);
  const titles: Record<Sub, string> = { menu: 'Settings', shopify: 'Shopify', payments: 'Payments', discounts: 'Discounts & bundles', hardware: 'Hardware', data: 'Data', grid: 'Grid import / export', gift: 'Gift cards', receipts: 'Receipts', backup: 'Backup & transfer', display: 'Screensaver & display', theme: 'Theme', about: 'About' };
  return (
    <Page title={titles[sub]} onBack={back}>
      {sub === 'menu' ? <>
        <Section>
          <Row icon="storefront-outline" title="Shopify" sub={hasCreds() ? shopDomain() : 'Not connected'} onPress={() => setSub('shopify')} />
          <Row icon="card-outline" title="Payments" sub={`Cash rounding ${s.cashRounding ? 'on' : 'off'} · fees ${(s.fees.cardPresentRate * 100).toFixed(1)}%`} onPress={() => setSub('payments')} />
          <Row icon="pricetags-outline" title="Discounts & bundles" onPress={() => setSub('discounts')} />
          <Row icon="barcode-outline" title="Hardware" sub="Scanner test" onPress={() => setSub('hardware')} />
          <Row icon="document-text-outline" title="Data" sub="Export CSV · delete local history" onPress={() => setSub('data')} />
          <Row icon="grid-outline" title="Grid import / export" onPress={() => setSub('grid')} />
          <Row icon="gift-outline" title="Gift cards" onPress={() => setSub('gift')} />
          <Row icon="receipt-outline" title="Receipts" sub={s.receipt.serverUrl ? (s.receipt.gstRegistered ? 'Tax invoices · QR link' : 'Receipts · QR link') : 'Not set up'} onPress={() => setSub('receipts')} />
          <Row icon="swap-horizontal-outline" title="Backup & transfer" sub="Move settings and logins to another device" onPress={() => setSub('backup')} />
          <Row icon="tv-outline" title="Screensaver & display" sub={s.screensaver.enabled ? `Screensaver after ${s.screensaver.idleMinutes} min${s.screensaver.keepAwake ? ' · stays awake' : ''}` : s.screensaver.keepAwake ? 'Stays awake' : 'Off'} onPress={() => setSub('display')} />
          <Row icon="color-palette-outline" title="Theme" onPress={() => setSub('theme')} />
          <Row icon="information-circle-outline" title="About" last onPress={() => setSub('about')} /></Section>
        <Section title="Checkout"><Toggle label="Consolidate identical items" sub="Tapping the same item again adds to its quantity" value={s.consolidate} onChange={v => patch({ consolidate: v })} />
          <Row title="Tax" sub="Off — prices are tax-inclusive and no tax is added" last /></Section></> : null}
      {sub === 'shopify' ? <ShopifySettings /> : null}
      {sub === 'receipts' ? <ReceiptSettings /> : null}
      {sub === 'backup' ? <BackupSettings /> : null}
      {sub === 'display' ? <DisplaySettings /> : null}
      {sub === 'payments' ? <Section footer="Fees are estimated from these rates – the Zeller SDK doesn’t report fees. Card refunds don’t return the original fee.">
        <Toggle label="Cash rounding (5c)" sub="Applies to the cash amount due only" value={s.cashRounding} onChange={v => { patch({ cashRounding: v }); void pushSharedSettings().catch(() => {}); }} />
        <View style={{ padding: 16 }}><Field kind="decimal" label="Card-present fee %" defaultValue={String(s.fees.cardPresentRate * 100)} onEndEditing={e => { const n = parseFloat(e.nativeEvent.text); if (!isNaN(n)) { patch({ fees: { ...s.fees, cardPresentRate: n / 100 } }); void pushSharedSettings().catch(() => {}); } }} />
          <Field kind="decimal" label="Keyed / card-not-present fee %" defaultValue={String(s.fees.keyedRate * 100)} onEndEditing={e => { const n = parseFloat(e.nativeEvent.text); if (!isNaN(n)) { patch({ fees: { ...s.fees, keyedRate: n / 100 } }); void pushSharedSettings().catch(() => {}); } }} /></View>
        <Row title="Reader & pairing" sub="More ▸ Support ▸ Zeller" last onPress={() => nav.push('diagnostics')} /></Section> : null}
      {sub === 'discounts' ? <BundlesEditor /> : null}
      {sub === 'hardware' ? <HardwareTest /> : null}
      {sub === 'data' ? <DataSettings /> : null}
      {sub === 'grid' ? <GridSettings /> : null}
      {sub === 'gift' ? <View style={{ padding: 16 }}><Field kind="url" label={GIFT_CARD_PASSES ? 'Wallet pass server URL (optional)' : 'Pass server URL (cashier passes)'} value={s.passServerUrl} onChangeText={t => patch({ passServerUrl: t.trim() })} placeholder="https://pass.example.workers.dev" /><PassSecret /><Txt size={13} sub>{GIFT_CARD_PASSES ? 'A tiny serverless function that signs Apple Wallet passes and keeps balances live. See pass-server/README. Leave empty to skip passes.' : 'A tiny serverless function that signs cashier passes for Apple Wallet. See pass-server/README. Leave empty to skip Wallet passes (printing still works).'}</Txt></View> : null}
      {sub === 'theme' ? <View style={{ padding: 16, gap: 14 }}><Segmented value={s.theme} onChange={v => patch({ theme: v })} options={[{ v: 'light', label: 'Light' }, { v: 'dark', label: 'Dark' }, { v: 'system', label: 'System' }]} />
        <Txt weight="600">Tile size</Txt><Segmented value={s.tileSize} onChange={v => patch({ tileSize: v })} options={[{ v: 'S', label: 'Small' }, { v: 'M', label: 'Medium' }, { v: 'L', label: 'Large' }]} />
        <Txt weight="600">Accent</Txt><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{['#111111', '#2563EB', '#16A34A', '#DC2626', '#9333EA', '#EA580C'].map(a => <Chip key={a} label={a === '#111111' ? 'Default' : ' '} active={s.accent === a} onPress={() => patch({ accent: a })} />)}</View></View> : null}
      {sub === 'about' ? <Section><Row title="Register" sub={`${s.registerName} · ${s.registerId}`} /><Row title="Shopify API" sub="2026-07" /><Row title="Currency" sub="AUD" last /></Section> : null}
      {sub === 'about' ? <View style={{ padding: 16 }}><Field kind="name" label="Register name" defaultValue={s.registerName} onEndEditing={e => patch({ registerName: e.nativeEvent.text.trim() || s.registerName })} /></View> : null}
    </Page>
  );
}
void TILE_COLORS;

function ShopifySettings() {
  const s = useApp(st => st.settings); const patch = useApp(st => st.patchSettings); const data = useApp(st => st.data);
  const [f, setF] = useState({ domain: '', id: '', secret: '' }); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [locs, setLocs] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { void loadCreds().then(c => c && setF({ domain: c.domain, id: c.clientId, secret: c.clientSecret })); }, []);
  const connect = async () => {
    setBusy(true); setMsg('');
    try { const domain = normaliseDomain(f.domain); await saveCreds({ domain, clientId: f.id.trim(), clientSecret: f.secret.trim() }); await getToken(true); const shop = await fetchShop(); setLocs(shop.locations); patch({ shopName: shop.name, locationId: s.locationId ?? shop.locations[0]?.id, locationName: s.locationName ?? shop.locations[0]?.name });
      setMsg(`Connected to ${shop.name}. Scopes: ${tokenScopes().join(', ') || '(none reported)'}`); }
    catch (e: any) { setMsg(`Could not connect: ${e.message}`); }
    setBusy(false);
  };
  const imp = async () => { setBusy(true); try { const r = await importFromShopify(m => setMsg(m)); setMsg(`Imported ${r.variants} variants, ${r.collections} collections, ${r.customers} customers, ${r.discounts} discounts.`); void pollShared(); } catch (e: any) { setMsg(`Import failed: ${e.message}`); } setBusy(false); };
  return (
    <View style={{ padding: 16, gap: 4 }}>
      <Field kind="code" label="Store domain" value={f.domain} onChangeText={t => setF({ ...f, domain: t })} placeholder="yourshop.myshopify.com" />
      <Field kind="code" label="Client ID (Dev Dashboard app)" value={f.id} onChangeText={t => setF({ ...f, id: t })} />
      <Field kind="secret" label="Client secret" value={f.secret} onChangeText={t => setF({ ...f, secret: t })} />
      <Txt size={12} sub>Stored in the iOS Keychain on this device only.</Txt>
      <Btn title="Save & test connection" onPress={() => void connect()} busy={busy} style={{ marginTop: 10 }} />
      {locs.length > 1 || s.locationName ? <View style={{ marginTop: 14 }}><Txt weight="600" style={{ marginBottom: 6 }}>Location (stock & orders)</Txt><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(locs.length ? locs : [{ id: s.locationId!, name: s.locationName! }]).map(l => <Chip key={l.id} label={l.name} active={s.locationId === l.id} onPress={() => patch({ locationId: l.id, locationName: l.name })} />)}</View></View> : null}
      <Btn title="Import from Shopify" icon="cloud-download-outline" kind="secondary" onPress={() => void imp()} busy={busy} style={{ marginTop: 10 }} disabled={!hasCreds()} />
      <Btn title="Set up shared storage (metaobjects)" icon="construct-outline" kind="secondary" disabled={!hasCreds()} onPress={async () => { try { await ensureDefinitions(); setMsg('Shared storage is ready.'); } catch (e: any) { setMsg(`Setup failed: ${e.message}`); } }} />
      <Btn title="Disconnect" kind="ghost" onPress={async () => { if (await confirm('Disconnect Shopify?', 'Credentials are removed from this device. Catalogue stays until re-import.', 'Disconnect', true)) { await clearCreds(); setF({ domain: '', id: '', secret: '' }); } }} />
      {msg ? <Txt size={13} sub style={{ marginTop: 8 }}>{msg}</Txt> : null}
      <Txt size={12} sub style={{ marginTop: 10 }}>{Object.keys(data.variants).length} variants · {data.collections.length} collections · {data.customers.length} customers{data.catalogueAt ? ` · imported ${new Date(data.catalogueAt).toLocaleString()}` : ''}</Txt>
    </View>
  );
}

function BundlesEditor() {
  const s = useApp(st => st.settings); const patch = useApp(st => st.patchSettings); const variants = useApp(st => st.data.variants);
  const [text, setText] = useState(s.bundlesJson || ''); const [msg, setMsg] = useState<string[]>([]);
  const save = () => {
    if (!text.trim()) { patch({ bundlesJson: '' }); setMsg(['Bundles cleared.']); void pushSharedSettings().catch(() => {}); return; }
    const r = parseBundleConfig(text); if (!r.cfg) return setMsg([`Not saved: ${r.error}`]);
    const known = new Set(Object.values(variants).flatMap(v => [v.id, v.productId])); const warn = validateBundleConfig(r.cfg, known);
    patch({ bundlesJson: text }); void pushSharedSettings().catch(() => {}); setMsg([`Saved ${r.cfg.discounts.length} deal(s).`, ...warn]);
  };
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Txt size={13} sub>Automatic discounts from Shopify apply by themselves. Bundle deals (one unit from each set → price change) are configured here as JSON and applied before Shopify discounts. Items tagged no-discount are excluded.</Txt>
      <Field kind="json" value={text} onChangeText={setText} style={{ minHeight: 260, fontFamily: 'Menlo', fontSize: 12 }} placeholder="Paste bundle config JSON" />
      <View style={{ flexDirection: 'row', gap: 8 }}><Btn title="Save" onPress={save} style={{ flex: 1 }} /><Btn title="Insert example" kind="secondary" onPress={() => setText(SAMPLE_BUNDLES)} style={{ flex: 1 }} /></View>
      {msg.map((m, i) => <Txt key={i} size={13} sub>{m}</Txt>)}
    </View>
  );
}

function HardwareTest() {
  const [last, setLast] = useState<string[]>([]);
  return (
    <View style={{ padding: 16, gap: 10 }}>
      <Txt>Pair your Bluetooth scanner in iOS Settings (HID keyboard mode), then scan any barcode:</Txt>
      <HidScanner onScan={c => setLast(l => [c, ...l].slice(0, 8))} />
      <Card>{last.length ? last.map((c, i) => <Row key={i} title={c} last={i === last.length - 1} />) : <Row title="Waiting for a scan…" last />}</Card>
      <Txt size={12} sub>Scans here only test the scanner – nothing is added to the cart.</Txt>
    </View>
  );
}

function DataSettings() {
  const [files, setFiles] = useState<string[]>([]); useEffect(() => { void csv.paths().then(setFiles); }, []);
  return (
    <Section footer="Every sale, refund and declined card attempt is appended to CSV files on this device and never auto-cleared. They are also visible in the Files app under this app.">
      <Row title="Export CSV" sub={files.length ? files.map(f => f.split('/').pop()).join(', ') : 'No history yet'} icon="share-outline" onPress={async () => { try { for (const f of files) { if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f, { mimeType: 'text/csv', dialogTitle: f.split('/').pop() }); } } catch (e: any) { alertMsg('Export failed', e.message); } }} />
      <Row title="Delete local history" danger icon="trash-outline" last onPress={async () => { if (await confirm('Delete local history?', 'The CSV files on this device are erased. Shopify keeps the orders. Export first if you need them.', 'Delete', true) && await confirm('Really delete?', 'This cannot be undone.', 'Delete forever', true)) { await csv.deleteAll(); setFiles([]); } }} />
    </Section>
  );
}

function GridSettings() {
  const grid = useApp(st => st.grid); const setGrid = useApp(st => st.setGrid); const [text, setText] = useState(''); const [msg, setMsg] = useState('');
  const doImport = (t: string) => { try { const r = parseGrid(t); setGrid(r.grid); void pushLayout().catch(() => {}); setMsg(`Imported ${r.grid.pages.length} page(s)${r.dropped ? `, ${r.dropped} unsupported tile(s) skipped` : ''}.`); } catch (e: any) { setMsg(e.message); } };
  return (
    <View style={{ padding: 16, gap: 10 }}>
      <Txt size={13} sub>Paste a grid.json or pick a file. Categories and items are matched to your imported Shopify catalogue by id.</Txt>
      <Field kind="json" value={text} onChangeText={setText} style={{ minHeight: 160, fontFamily: 'Menlo', fontSize: 12 }} placeholder='{"version":1,"pages":[…]}' />
      <Btn title="Import pasted JSON" onPress={() => doImport(text)} disabled={!text.trim()} />
      <Btn title="Import from file…" kind="secondary" onPress={async () => { const r = await DocPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true }); if (r.canceled || !r.assets?.[0]) return; doImport(await FS.readAsStringAsync(r.assets[0].uri)); }} />
      <Btn title="Export grid.json" kind="secondary" onPress={() => void Share.share({ message: serialiseGrid(grid), title: 'grid.json' })} />
      <Btn title="Push layout to other registers now" kind="ghost" onPress={async () => { try { await pushLayout(); setMsg('Layout pushed.'); } catch (e: any) { setMsg(e.message); } }} />
      {msg ? <Txt size={13} sub>{msg}</Txt> : null}
    </View>
  );
}
void Linking; void Sheet;

function PassSecret() {
  const [v, setV] = useState(''); useEffect(() => { void getPassSecret().then(setV); }, []);
  return <Field kind="secret" label="Pass server secret (POS_SECRET)" value={v} onChangeText={t => { setV(t); void setPassSecret(t); }} placeholder="Same value as the Worker's POS_SECRET" />;
}

/** Settings ▸ Backup & transfer: export settings + logins to a file (encrypted or plain JSON) and restore one on another device. */
function BackupSettings() {
  const [pass, setPass] = useState(''); const [pass2, setPass2] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const [pending, setPending] = useState<string | null>(null); const [importPass, setImportPass] = useState('');
  const run = async (fn: () => Promise<string | void>) => { setBusy(true); setMsg(''); try { const m = await fn(); if (m) setMsg(m); } catch (e: any) { setMsg(e?.message ?? String(e)); } setBusy(false); };
  const shareFile = async (name: string, text: string, uti: string) => {
    const path = `${FS.cacheDirectory}${name}`;
    await FS.writeAsStringAsync(path, text);
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
    await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: name, UTI: uti });
  };
  const exportEncrypted = () => run(async () => {
    if (pass.length < MIN_PASSPHRASE) throw new Error(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`);
    if (pass !== pass2) throw new Error('The two passphrases do not match.');
    setMsg('Encrypting… this takes a few seconds.');
    const text = await encryptBackup(JSON.stringify(await collectBackup()), pass);
    await shareFile(backupFileName(true), text, 'public.data');
    return 'Backup created. Keep the passphrase safe: without it the file cannot be opened.';
  });
  const exportPlain = () => run(async () => {
    if (!(await confirm('Export without encryption?', 'The file will contain your Shopify client secret and other logins in plain text. Anyone who gets it can use them. Delete it once you have imported it.', 'Export plain', true))) return;
    await shareFile(backupFileName(false), JSON.stringify(await collectBackup(), null, 2), 'public.json');
    return 'Plain backup created. Delete it after importing.';
  });
  const restorePlain = async (text: string) => {
    const b = validateBackup(JSON.parse(text));
    if (!(await confirm('Restore this backup?', 'This replaces the settings, grid layout and Shopify login on this device. This register keeps its own name and ID.', 'Restore', true))) return;
    return applyBackup(b);
  };
  const pick = () => run(async () => {
    const r = await DocPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const text = await FS.readAsStringAsync(r.assets[0].uri);
    if (detectBackup(text) === 'encrypted') { setPending(text); setImportPass(''); return 'Encrypted backup loaded. Enter its passphrase below.'; }
    setPending(null); return restorePlain(text);
  });
  const unlock = () => run(async () => {
    if (!pending) return;
    setMsg('Decrypting… this takes a few seconds.');
    const text = await decryptBackup(pending, importPass);
    const m = await restorePlain(text);
    if (m) { setPending(null); setImportPass(''); }
    return m;
  });
  return (
    <View>
      <Section title="Export" footer="Includes your settings, staff, grid layout and logins (Shopify, receipt server, pass server). It does not include sales history or the catalogue, which come back from Shopify. The Zeller reader pairing is stored on the device and has to be set up again.">
        <View style={{ padding: 16 }}>
          <Field kind="secret" label="Passphrase" value={pass} onChangeText={setPass} placeholder={`At least ${MIN_PASSPHRASE} characters`} />
          <Field kind="secret" label="Repeat passphrase" value={pass2} onChangeText={setPass2} />
          <Btn title="Export encrypted backup" icon="lock-closed-outline" onPress={() => void exportEncrypted()} busy={busy} disabled={!pass || !pass2} />
          <Btn title="Export plain JSON (not encrypted)" kind="ghost" onPress={() => void exportPlain()} disabled={busy} />
        </View></Section>
      <Section title="Import" footer="Restoring replaces this device's settings and logins with the ones in the file. This register keeps its own name and ID.">
        <View style={{ padding: 16 }}>
          <Btn title="Choose backup file…" kind="secondary" icon="folder-open-outline" onPress={() => void pick()} busy={busy && !pending} />
          {pending ? <View style={{ marginTop: 10 }}>
            <Field kind="secret" label="Passphrase for this backup" value={importPass} onChangeText={setImportPass} />
            <Btn title="Decrypt & restore" onPress={() => void unlock()} busy={busy} disabled={!importPass} /></View> : null}
        </View></Section>
      {msg ? <View style={{ paddingHorizontal: 16 }}><Txt size={13} sub>{msg}</Txt></View> : null}
    </View>
  );
}

/** Settings ▸ Screensaver & display: keep the iPad awake, and show the logo on a colour when nobody is using the till. */
function DisplaySettings() {
  const s = useApp(st => st.settings.screensaver); const patch = useApp(st => st.patchSettings);
  const { c } = useTheme();
  const set = (p: Partial<ScreensaverSettings>) => patch({ screensaver: { ...s, ...p } });
  const [hex, setHex] = useState(s.bgColor); const [url, setUrl] = useState(s.logoUrl); const [msg, setMsg] = useState('');
  const src = logoSource(s); const bg = normaliseHex(s.bgColor) ?? '#111111';
  const upload = async () => {
    try {
      const r = await DocPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0]; const ext = (a.name?.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'png';
      if (ext === 'svg') { setMsg('SVG files are not supported. Export the logo as a PNG or JPG.'); return; }
      const dir = `${FS.documentDirectory}branding/`; await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
      const to = `${dir}logo-${Date.now()}.${ext}`; await FS.copyAsync({ from: a.uri, to });
      if (s.logoFile) await FS.deleteAsync(s.logoFile, { idempotent: true }).catch(() => {});
      set({ logoFile: to }); setMsg('Logo saved on this device.');
    } catch (e: any) { setMsg(`Could not load that image: ${e.message}`); }
  };
  const removeUpload = async () => { if (s.logoFile) await FS.deleteAsync(s.logoFile, { idempotent: true }).catch(() => {}); set({ logoFile: '' }); setMsg('Uploaded logo removed.'); };
  const onHex = (t: string) => { setHex(t); const n = normaliseHex(t); if (n) set({ bgColor: n }); };
  const onUrl = (t: string) => { setUrl(t); const v = t.trim(); if (!v) { set({ logoUrl: '' }); setMsg(''); } else if (/^https:\/\//i.test(v)) { set({ logoUrl: v }); setMsg(''); } else setMsg('Use a link that starts with https://'); };
  return (
    <View>
      <Section footer="Stops iOS from auto-locking or dimming the iPad while this app is open. Leave this on for a till. The iPad should be plugged in.">
        <Toggle label="Keep iPad awake" sub="Overrides the iPad's Auto-Lock while the app is open" value={s.keepAwake} onChange={v => set({ keepAwake: v })} /></Section>
      <Section footer="Shows after nobody has touched, typed on or scanned into the iPad for the time below. It never shows while a card payment is waiting on the reader. The first tap only wakes it.">
        <Toggle label="Screensaver" value={s.enabled} onChange={v => set({ enabled: v })} />
        <View style={{ padding: 16, gap: 10 }}>
          <Txt weight="600">Show after</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{IDLE_CHOICES.map(m => <Chip key={m} label={`${m} min`} active={s.idleMinutes === m} onPress={() => set({ idleMinutes: m })} />)}</View>
        </View>
        <Toggle label="Show when logged out" sub="After a short wait on the PIN screen" value={s.showWhenLoggedOut} onChange={v => set({ showWhenLoggedOut: v })} />
        {s.showWhenLoggedOut ? <View style={{ padding: 16, gap: 10 }}>
          <Txt weight="600">Logged-out wait</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{LOCKED_CHOICES.map(n => <Chip key={n} label={`${n} sec`} active={s.lockedSeconds === n} onPress={() => set({ lockedSeconds: n })} />)}</View>
        </View> : null}
        <Toggle label="Slowly move the logo" sub="Stops the same pixels staying lit for hours" value={s.drift} onChange={v => set({ drift: v })} />
        <Toggle label="Show the time" value={s.showClock} onChange={v => set({ showClock: v })} /></Section>
      <Section title="Logo" footer="PNG or JPG. A transparent PNG looks best. An uploaded image is saved on this device and is included in backups; a link is not downloaded until it is shown.">
        <View style={{ padding: 16 }}>
          <Field kind="url" label="Logo link (https)" value={url} onChangeText={onUrl} placeholder="https://example.com/logo.png" />
          <Btn title="Upload an image from Files…" kind="secondary" icon="image-outline" onPress={() => void upload()} />
          {s.logoFile ? <Btn title="Remove uploaded image" kind="ghost" onPress={() => void removeUpload()} /> : null}
        </View></Section>
      <Section title="Background colour">
        <View style={{ padding: 16 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            {SWATCHES.map(sw => <Pressable key={sw} accessibilityRole="button" accessibilityLabel={`Colour ${sw}`} onPress={() => { setHex(sw); set({ bgColor: sw.toLowerCase() }); }}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: sw, borderWidth: s.bgColor.toLowerCase() === sw.toLowerCase() ? 3 : 1, borderColor: s.bgColor.toLowerCase() === sw.toLowerCase() ? c.accent : c.line }} />)}
          </View>
          <Field kind="code" label="Or type a hex code" value={hex} onChangeText={onHex} placeholder="#1E3A5F" maxLength={7} />
          {!normaliseHex(hex) ? <Txt size={13} color="#DC2626">Enter 3 or 6 hex digits, like #1E3A5F.</Txt> : null}
        </View></Section>
      <Section title="Preview">
        <View style={{ padding: 16 }}>
          <View style={{ height: 150, borderRadius: 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {src ? <Image source={src} resizeMode="contain" style={{ width: '60%', height: '70%' }} /> : <Txt size={20} weight="700" color={contrastOn(bg)}>No logo set</Txt>}
          </View>
          <Btn title="Preview full screen" kind="secondary" icon="expand-outline" style={{ marginTop: 12 }} onPress={() => { useApp.getState().set({ saverPreview: true }); }} />
        </View></Section>
      {msg ? <View style={{ paddingHorizontal: 16 }}><Txt size={13} sub>{msg}</Txt></View> : null}
    </View>
  );
}

function ReceiptSecret() {
  const [v, setV] = useState(''); useEffect(() => { void getReceiptSecret().then(setV); }, []);
  return <Field kind="secret" label="Receipt server secret (RECEIPT_SECRET)" value={v} onChangeText={t => { setV(t); void setReceiptSecret(t); }} placeholder="stored in this iPad's Keychain" />;
}
/** Settings ▸ Receipts: where receipts are hosted + the business details printed on them (needed for tax records). */
function ReceiptSettings() {
  const r = useApp(st => st.settings.receipt); const patch = useApp(st => st.patchSettings); const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof r>) => patch({ receipt: { ...r, ...p } });
  const test = async () => { setBusy(true); try { const u = await uploadSampleReceipt(); await Linking.openURL(u); } catch (e: any) { alertMsg('Test failed', e.message); } setBusy(false); };
  return (
    <View>
      <Section footer="Customers scan a QR code (or get a link) to a page that merges the Shopify order lines with the Zeller card details, with PDF and image download. Deploy receipt-server/ first (see its README).">
        <View style={{ padding: 16 }}>
          <Field kind="url" label="Receipt server URL" value={r.serverUrl} onChangeText={t => set({ serverUrl: t.trim() })} placeholder="https://pos-receipts.yourname.workers.dev" />
          <ReceiptSecret />
          <Btn title="Send test receipt" kind="secondary" busy={busy} disabled={!r.serverUrl.trim()} onPress={() => void test()} />
        </View></Section>
      <Section title="Business details on receipts" footer="Receipts for tax purposes need the seller's name and ABN. These are copied into each receipt when it is made.">
        <View style={{ padding: 16 }}>
          <Field kind="name" label="Business / trading name" value={r.name} onChangeText={t => set({ name: t })} placeholder="Defaults to your shop name" />
          <Field kind="integer" label="ABN" value={r.abn} onChangeText={t => set({ abn: t })} placeholder="12 345 678 901" />
          <Field kind="text" label="Address" value={r.address} onChangeText={t => set({ address: t })} />
          <Field kind="phone" label="Phone" value={r.phone} onChangeText={t => set({ phone: t })} />
          <Field kind="email" label="Email" value={r.email} onChangeText={t => set({ email: t })} />
          <Field kind="url" label="Website" value={r.website} onChangeText={t => set({ website: t })} />
          <Field kind="text" label="Return policy (optional)" value={r.returnPolicy} onChangeText={t => set({ returnPolicy: t })} multiline /></View></Section>
      <Section footer="Turn on only if you are registered for GST. Receipts are then titled “Tax invoice” and show the GST included (1/11 of the total, gift cards excluded). Check with your accountant before relying on this.">
        <Toggle label="Registered for GST" sub="Prices are treated as GST-inclusive" value={r.gstRegistered} onChange={v => set({ gstRegistered: v })} /></Section>
    </View>
  );
}
