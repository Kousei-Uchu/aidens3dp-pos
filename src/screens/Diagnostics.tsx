import React, { useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, Page, Row, Section, Txt, alertMsg } from '../ui/kit';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { checkReader, getTerminal, pairReader } from '../zellerBridge';
import { attemptRef, describeEvent, startCharge, startRefund } from '../lib/zeller';
import { processOutbox, pollShared } from '../lib/sync';
import { fmt } from '../lib/money';

/** Support / Diagnostics ▸ Zeller: Setup (pairing) and a $1 test purchase (+ refund). */
export default function Diagnostics() {
  const nav = useNav(); const z = useApp(s => s.zeller); const sync = useApp(s => s.sync); const outbox = useApp(s => s.pos.outbox); const attempts = useApp(s => s.pos.attempts);
  const [log, setLog] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [lastRef, setLastRef] = useState<string | null>(null); const add = (m: string) => setLog(l => [`${new Date().toLocaleTimeString()}  ${m}`, ...l].slice(0, 30));
  const test = async () => {
    const t = getTerminal(); if (!t) return alertMsg('Reader not started yet'); setBusy(true); const ref = attemptRef(`test-${Date.now()}`, 1); add('Starting $1.00 test…');
    const h = startCharge(t, { amountCents: 100, reference: ref }, { onEvent: e => add(describeEvent(e)) }); const r = await h.promise; setBusy(false);
    if (r.kind === 'APPROVED') { add('Approved ✔ — you can refund the test below.'); setLastRef(ref); } else add(r.kind === 'DECLINED' ? `Declined: ${r.text}` : r.kind === 'NOT_READY' ? r.message : r.kind === 'UNKNOWN' ? `Unknown: ${r.reason}` : 'Cancelled');
  };
  const refund = async () => { const t = getTerminal(); if (!t || !lastRef) return; setBusy(true); const r = await startRefund(t, { purchaseRef: lastRef, amountCents: 100, reference: `${lastRef}-refund` }, { onEvent: e => add(describeEvent(e)) }).promise; setBusy(false); add(r.kind === 'APPROVED' ? 'Refund approved ✔' : `Refund: ${r.kind}`); if (r.kind === 'APPROVED') setLastRef(null); };
  return (
    <Page title="Support & diagnostics" onBack={nav.pop}>
      <Section title="Zeller reader"><Row title={z.ready ? 'Reader ready' : 'Reader issue'} sub={z.message} icon={z.ready ? 'checkmark-circle' : 'alert-circle'} />
        <View style={{ padding: 16, gap: 8 }}><Btn title="Setup (pair terminal)" icon="link-outline" kind="secondary" busy={busy} onPress={async () => { const e = await pairReader(); add(e ? `Setup: ${e}` : 'Paired ✔'); }} />
          <Btn title="Check reader" icon="refresh" kind="secondary" onPress={async () => add((await checkReader()) ? 'Reader ready ✔' : useApp.getState().zeller.message ?? 'Not ready')} />
          <Btn title="Test purchase $1.00" icon="card-outline" busy={busy} onPress={() => void test()} disabled={!z.ready} />{lastRef ? <Btn title="Refund the $1.00 test" kind="secondary" onPress={() => void refund()} /> : null}
          <Txt size={12} sub>After reinstalling the app you must re-pair the terminal and re-enter Shopify credentials.</Txt></View></Section>
      <Section title="Sync"><Row title={`Status: ${sync.state}`} sub={sync.error ?? (sync.at ? `Last ${new Date(sync.at).toLocaleTimeString()}` : undefined)} /><Row title={`${outbox.length} sale(s) queued`} last right={<Btn small title="Sync now" onPress={() => { void processOutbox(); void pollShared(); }} />} /></Section>
      <Section title="Card attempts (this device)">{attempts.slice(-8).reverse().map((a, i, arr) => <Row key={a.ref} last={i === arr.length - 1} title={`${fmt(a.amountCents)} · ${a.status}`} sub={`${a.ref}${a.resolvedBy ? ' · resolved by ' + a.resolvedBy : ''}`} />)}{!attempts.length ? <Row title="None yet" last /> : null}</Section>
      {log.length ? <View style={{ padding: 16 }}><Card style={{ padding: 12 }}>{log.map((l, i) => <Txt key={i} size={12} sub>{l}</Txt>)}</Card></View> : null}
    </Page>
  );
}
