// Location: src/screens/CloudSync.tsx
// Cloud sync, patch 2 of dev_docs/CLOUDKIT_SYNC_PLAN.md. One till sets the shop up: it opens the shared zone and shows an
// invite link. Every other till pastes that link to join. The records themselves travel in patch 3; this page only opens
// the door and says which side of it this till is on.
import React, { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Btn, Field, Page, Txt, alertMsg, confirm } from '../ui/kit';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { SPOT } from '../lib/trainingSpots';
import { isTraining } from '../lib/trainingGuard';
import { activeBackendKind } from '../lib/syncBackend';
import { backendSwitch, eventSync, migrationControl } from '../lib/sync';
import { backendLine, type BackendFlag } from '../lib/backendChoice';
import { migrationPanel } from '../lib/migrationPanel';
import { exportSummary } from '../lib/cloudkit/exportAll';
import { writeCloudKitExport } from '../lib/cloudkit/exportAllIO';
import type { MigrationView } from '../lib/cloudkit/migrationControl';
import { ICLOUD_NOTE_INTRO, ICLOUD_WARNINGS, IN_ICLOUD, NOT_IN_ICLOUD } from '../lib/icloudNote';
import {
  acceptShare,
  accountLine,
  createZoneAndShare,
  getState,
  onShareJoined,
  takePendingInvite,
  type CloudKitRole,
  type CloudKitState,
} from '../../modules/cloudkit-sync';

export default function CloudSync() {
  const nav = useNav();
  const [state, setState] = useState<CloudKitState | null>(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [mig, setMig] = useState<MigrationView | null>(null);
  const [bk, setBk] = useState<{ kind: 'metaobject' | 'cloudkit' | 'none'; flag: BackendFlag } | null>(null);
  const practice = isTraining();
  const account = state?.account ?? 'couldNotDetermine';
  const role = state?.role ?? 'none';

  const refresh = async () => {
    try { setState(await getState()); }
    catch (e: any) { setMsg(`Could not read iCloud: ${e?.message ?? String(e)}`); }
  };

  useEffect(() => {
    void refresh();
    // A tap on an invite link while the app was closed leaves the link behind; the field starts with it so joining is one
    // tap rather than pasting.
    void takePendingInvite().then(url => { if (url) setLink(url); });
    return onShareJoined(p => { setMsg(p.message); void refresh(); });
  }, []);

  // The move to iCloud (patch 7): read the lease when the page opens and every few seconds while it is open, and redraw as the import
  // reports progress. Reading writes nothing, and nothing here starts the import except the button.
  const readMigration = async () => { try { setMig(await migrationControl.view()); } catch { /* the view never throws; this is for safety */ } };
  useEffect(() => {
    if (role === 'none') return;
    void readMigration();
    const off = migrationControl.subscribe(() => { void readMigration(); });
    const t = setInterval(() => { void readMigration(); }, 5000);
    return () => { off(); clearInterval(t); };
  }, [role]);
  const panel = migrationPanel(mig, role, practice);

  // Patch 8: where this till keeps the shop's shared data, and the way back. Local to this iPad (decisions item 16), so a rollback has to be
  // done on every till. Nothing here moves a till to iCloud by itself: that happens on the poll once the import is done.
  const readBackend = async () => { try { setBk(await backendSwitch.view()); } catch { /* the view does not throw */ } };
  useEffect(() => { if (role !== 'none') void readBackend(); }, [role]);
  const goBack = async () => {
    if (!(await confirm('Go back to Shopify storage?', 'This till will keep the shop\'s shared data in Shopify again. Shopify still has its copy, but anything saved in iCloud since the switch will not be there. Do the same on every till, or the tills will stop seeing each other\'s changes.', 'Go back', true))) return;
    try { await backendSwitch.rollBack(); setMsg('This till is back on Shopify storage.'); } catch (e: any) { alertMsg('Could not switch back', e?.message ?? String(e), 'settings/cloud-sync'); }
    await readBackend();
  };
  const useICloudAgain = async () => {
    try { await backendSwitch.allowSwitch(); const moved = await backendSwitch.check(); setMsg(moved ? 'This till is using iCloud again.' : 'This till will use iCloud as soon as the setup is done.'); } catch (e: any) { alertMsg('Could not switch', e?.message ?? String(e), 'settings/cloud-sync'); }
    await readBackend();
  };

  const setup = async () => {
    setBusy(true); setMsg('');
    try {
      const url = await createZoneAndShare();
      setState(s => (s ? { ...s, role: 'owner', shareURL: url } : s));
      setMsg('This till owns the shop. Send the link to the other tills.');
      await refresh();
    } catch (e: any) { alertMsg('Could not set up Cloud sync', e?.message ?? String(e), 'settings/cloud-sync'); }
    setBusy(false);
  };

  const join = async (raw: string) => {
    setBusy(true); setMsg('');
    try {
      await acceptShare(raw);
      setLink('');
      setMsg('Joined. This till will show the shop records once sync is switched on.');
      await refresh();
    } catch (e: any) { alertMsg('Could not join', e?.message ?? String(e), 'settings/cloud-sync'); }
    setBusy(false);
  };

  const share = async (url: string | null) => {
    if (!url) return;
    try { await Share.share({ message: url, title: 'Cloud sync invite link' }); }
    catch (e: any) { alertMsg('Could not share the link', e?.message ?? String(e), 'settings/cloud-sync'); }
  };

  // The combined events file (decisions item 12, Q3): every register's events, built from CloudKit when asked for. It is only
  // offered once CloudKit is the backend in use, because until then there is nothing in CloudKit to build it from.
  const exportEvents = async () => {
    setBusy(true); setMsg('');
    try {
      const text = await eventSync.exportCsv();
      if (text === null) throw new Error('Cloud sync is not switched on for this till.');
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      const name = `events-all-registers-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.csv`;
      await FS.makeDirectoryAsync(FS.cacheDirectory ?? '', { intermediates: true }).catch(() => {});
      const path = `${FS.cacheDirectory}${name}`;
      await FS.writeAsStringAsync(path, text);
      await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: name, UTI: 'public.comma-separated-values-text' });
      setMsg(`Made ${name} from the events every register has sent to iCloud.`);
    } catch (e: any) { alertMsg('Could not make the events file', e?.message ?? String(e), 'settings/cloud-sync'); }
    setBusy(false);
  };

  // Patch 6e (N3, O5): the owner's backup of everything in iCloud, one zip of JSON. Owner only, because it can hold card details and
  // payment references once encryption is on, so it is as sensitive as the Shopify login.
  const exportEverything = async () => {
    if (!(await confirm('Back up everything in iCloud?', 'Makes one zip of everything the shop keeps in iCloud. It can hold card references, gift card codes and the assistant log, so keep it as private as the Shopify login. Do not email it.', 'Make the backup'))) return;
    setBusy(true); setMsg('');
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      const ck = await import('../../modules/cloudkit-sync');
      const st = useApp.getState().settings;
      const f = await writeCloudKitExport(ck as any, { exportedAt: new Date().toISOString(), registerId: st.registerId, registerName: st.registerName }, w => setMsg(`Reading ${w}…`));
      await Sharing.shareAsync(f.path, { mimeType: 'application/zip', dialogTitle: f.name, UTI: 'public.zip-archive' });
      setMsg(`Made ${f.name}: ${exportSummary(f.counts)}.`);
    } catch (e: any) { alertMsg('Could not make the backup', e?.message ?? String(e), 'settings/cloud-sync'); setMsg(''); }
    setBusy(false);
  };

  return (
    <Page title="Cloud sync" onBack={nav.pop} helpId="settings/cloud-sync">
      <View style={{ padding: 16, gap: 10 }}>
        <Txt size={13} sub>{accountLine(state?.account ?? 'couldNotDetermine')}</Txt>

        {account === 'available' && role === 'none' ? (
          <>
            <Txt weight="600" style={{ marginTop: 6 }}>Set this till up</Txt>
            <Txt size={13} sub>Makes this till the one that holds the shop records, then shows a link for the other tills.</Txt>
            <Btn title="Set up this till" icon="cloud-upload-outline" spot={SPOT.cloudSyncSetup} busy={busy} disabled={practice} onPress={() => void setup()} />
          </>
        ) : null}

        {role === 'owner' ? (
          <>
            <Txt weight="600" style={{ marginTop: 6 }}>This till holds the shop records</Txt>
            <Txt size={13} sub>Send this link to each other till. On that till, open Cloud sync and paste it in.</Txt>
            {state?.shareURL ? <Field kind="url" label="Invite link" value={state.shareURL} editable={false} /> : null}
            <Btn title="Share the invite link" icon="share-outline" spot={SPOT.cloudSyncShare} disabled={!state?.shareURL || practice} onPress={() => void share(state?.shareURL ?? null)} />
          </>
        ) : null}

        {role === 'participant' ? (
          <>
            <Txt weight="600" style={{ marginTop: 6 }}>This till has joined the shop</Txt>
            <Txt size={13} sub>Records from the other tills arrive once sync is switched on. Nothing more to do here.</Txt>
          </>
        ) : null}

        {account === 'available' && role !== 'owner' ? (
          <>
            <Txt weight="600" style={{ marginTop: 6 }}>Join a shop</Txt>
            <Txt size={13} sub>Paste the invite link from the till that set the shop up.</Txt>
            <Field kind="code" label="Invite link" value={link} onChangeText={setLink} placeholder="https://www.icloud.com/share/..." />
            <Btn title="Join" icon="cloud-download-outline" spot={SPOT.cloudSyncJoin} busy={busy} disabled={!link.trim() || practice} onPress={() => void join(link)} />
          </>
        ) : null}

        {panel.show ? (
          <>
            <Txt weight="600" style={{ marginTop: 6 }}>{panel.title}</Txt>
            <Txt size={13}>{panel.status}</Txt>
            {panel.progress ? <Txt size={13} sub>{panel.progress}</Txt> : null}
            {panel.outcome ? <Txt size={13} sub>{panel.outcome}</Txt> : null}
            {panel.explain.map(t => <Txt key={t} size={13} sub>{t}</Txt>)}
            {panel.primary ? <Btn title={panel.primary.label} icon="cloud-upload-outline" onPress={() => void migrationControl.start()} /> : null}
            {panel.showStop ? <Btn title="Stop" kind="secondary" onPress={() => migrationControl.stop()} /> : null}
          </>
        ) : null}

        {role !== 'none' && bk ? (
          <>
            <Txt weight="600" style={{ marginTop: 6 }}>Where this till keeps shared data</Txt>
            <Txt size={13}>{backendLine(bk.kind, bk.flag)}</Txt>
            {bk.kind === 'cloudkit' ? <Btn title="Go back to Shopify storage" kind="secondary" disabled={practice} onPress={() => void goBack()} /> : null}
            {bk.flag === 'force_meta' ? <Btn title="Use iCloud again" kind="secondary" disabled={practice} onPress={() => void useICloudAgain()} /> : null}
          </>
        ) : null}

        {role === 'owner' ? (
          <>
            <Txt weight="600" style={{ marginTop: 6 }}>Back up everything in iCloud</Txt>
            <Txt size={13} sub>Makes one zip of JSON files with everything the shop keeps in iCloud, so you have a copy that does not depend on this Apple ID. Owner only. It is as private as the Shopify login.</Txt>
            <Btn title="Back up everything" icon="archive-outline" busy={busy} disabled={practice} onPress={() => void exportEverything()} />
          </>
        ) : null}

        {role !== 'none' && activeBackendKind() === 'cloudkit' ? (
          <>
            <Txt weight="600" style={{ marginTop: 6 }}>Events from every register</Txt>
            <Txt size={13} sub>Makes one CSV of the declined payments, voids, overrides, paid in and out, shift opens and closes and the rest, from every register, oldest first. Each till's own events.csv stays as it is.</Txt>
            <Btn title="Export all events" icon="document-text-outline" spot={SPOT.cloudSyncEvents} busy={busy} disabled={practice} onPress={() => void exportEvents()} />
          </>
        ) : null}

        <Txt weight="600" style={{ marginTop: 14 }}>What is kept in iCloud</Txt>
        <Txt size={13} sub>{ICLOUD_NOTE_INTRO}</Txt>
        {IN_ICLOUD.map(b => <Txt key={b.title} size={13}><Txt size={13} weight="600">{b.title}. </Txt>{b.text}</Txt>)}
        {ICLOUD_WARNINGS.map(b => <Txt key={b.title} size={13}><Txt size={13} weight="600">{b.title}. </Txt>{b.text}</Txt>)}
        <Txt weight="600" style={{ marginTop: 6 }}>What is never kept in iCloud</Txt>
        {NOT_IN_ICLOUD.map(t => <Txt key={t} size={13} sub>{`\u2022 ${t}`}</Txt>)}

        {practice ? <Txt size={13} sub>Cloud sync cannot be changed while training is on.</Txt> : null}
        {msg ? <Txt size={13} sub>{msg}</Txt> : null}
        <Btn title="Check again" kind="ghost" busy={busy} onPress={() => void refresh()} />
      </View>
    </Page>
  );
}
