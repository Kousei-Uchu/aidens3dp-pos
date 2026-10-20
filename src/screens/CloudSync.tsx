// Location: src/screens/CloudSync.tsx
// Cloud sync, patch 2 of dev_docs/CLOUDKIT_SYNC_PLAN.md. One till sets the shop up: it opens the shared zone and shows an
// invite link. Every other till pastes that link to join. The records themselves travel in patch 3; this page only opens
// the door and says which side of it this till is on.
import React, { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import { Btn, Field, Page, Txt, alertMsg } from '../ui/kit';
import { useNav } from '../ui/nav';
import { SPOT } from '../lib/trainingSpots';
import { isTraining } from '../lib/trainingGuard';
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

        {practice ? <Txt size={13} sub>Cloud sync cannot be changed while training is on.</Txt> : null}
        {msg ? <Txt size={13} sub>{msg}</Txt> : null}
        <Btn title="Check again" kind="ghost" busy={busy} onPress={() => void refresh()} />
      </View>
    </Page>
  );
}
