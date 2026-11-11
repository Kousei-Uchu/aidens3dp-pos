import React, { useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, Page, Row, Section, Txt, alertMsg, confirm } from '../ui/kit';
import { useNav } from '../ui/nav';
import { useApp, currentStaff } from '../state/store';
import { checkReader, getTerminal, pairReader } from '../zellerBridge';
import { attemptRef, describeEvent, startCharge, startRefund } from '../lib/zeller';
import { processOutbox, pollShared, attemptSync } from '../lib/sync';
import { getLastPoll } from '../lib/pollTiming';
import { csv } from '../lib/csvStore';
import { fmt } from '../lib/money';
import { resolvedElsewhereEvent, unresolvedRows } from '../lib/attemptShared';
import type { SharedAttempt } from '../lib/eventRecords';
import { SPOT } from '../lib/trainingSpots';
import { featureOn } from '../lib/appMode';

/** Support / Diagnostics ▸ Zeller: Setup (pairing) and a $1 test purchase (+ refund). */
export default function Diagnostics() {
  const nav = useNav(); const z = useApp(s => s.zeller); const readerOn = useApp(s => featureOn(s.settings.appMode, s.settings.registerFeatures, 'cardReader')); const sync = useApp(s => s.sync); const outbox = useApp(s => s.pos.outbox); const attempts = useApp(s => s.pos.attempts); const sharedAttempts = useApp(s => s.sharedAttempts); const registerId = useApp(s => s.settings.registerId); const registerName = useApp(s => s.settings.registerName); const waiting = unresolvedRows(sharedAttempts, 8, Date.now(), registerId);
  const [log, setLog] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [lastRef, setLastRef] = useState<string | null>(null); const add = (m: string) => setLog(l => [`${new Date().toLocaleTimeString()}  ${m}`, ...l].slice(0, 30));
  const test = async () => {
    const t = getTerminal(); if (!t) return alertMsg('Reader not started yet'); setBusy(true); const ref = attemptRef(`test-${Date.now()}`, 1); add('Starting $1.00 test…');
    const h = startCharge(t, { amountCents: 100, reference: ref }, { onEvent: e => add(describeEvent(e)) }); const r = await h.promise; setBusy(false);
    if (r.kind === 'APPROVED') { add('Approved ✔ - you can refund the test below.'); setLastRef(ref); } else add(r.kind === 'DECLINED' ? `Declined: ${r.text}` : r.kind === 'NOT_READY' ? r.message : r.kind === 'UNKNOWN' ? `Unknown: ${r.reason}` : 'Cancelled');
  };
  // Item 9: resolve a payment that is waiting on another register. The first resolution wins, so say so if someone got there first.
  const resolveElsewhere = async (a: SharedAttempt, charged: boolean) => {
    const ok = await confirm(charged ? 'Customer WAS charged?' : 'Customer was NOT charged?', charged ? `Marks ${fmt(a.amountCents)} from ${a.registerName || 'another register'} as paid by card. That register is told. Only confirm if you saw it approved on the terminal or Zeller dashboard.` : `Allows ${a.registerName || 'the other register'} to charge again. Only confirm if you have checked the terminal or Zeller dashboard.`, 'Confirm', !charged);
    if (!ok) return;
    const who = currentStaff()?.name ?? registerName;
    setBusy(true); const won = await attemptSync.resolveElsewhere(a, who); setBusy(false);
    if (!won) return alertMsg('Could not resolve the payment', 'It was not sent to iCloud. Check the connection and try again.');
    void csv.event(resolvedElsewhereEvent(a, charged, who));
    if (won.resolvedBy && won.resolvedBy !== who) alertMsg('Payment already resolved', `${won.resolvedBy} resolved this payment first. Check the terminal or Zeller dashboard that the sale matches what happened.`);
    else add(`Resolved ${fmt(a.amountCents)} from ${a.registerName || 'another register'}.`);
  };
  const refund = async () => { const t = getTerminal(); if (!t || !lastRef) return; setBusy(true); const r = await startRefund(t, { purchaseRef: lastRef, amountCents: 100, reference: `${lastRef}-refund` }, { onEvent: e => add(describeEvent(e)) }).promise; setBusy(false); add(r.kind === 'APPROVED' ? 'Refund approved ✔' : `Refund: ${r.kind}`); if (r.kind === 'APPROVED') setLastRef(null); };
  return (
    <Page title="Support & diagnostics" onBack={nav.pop} helpId="fix/reader">
      {/* a companion without the Card reader group does not show the reader tools */}
      {readerOn ? (
      <Section title="Zeller reader"><Row title={z.ready ? 'Reader ready' : 'Reader issue'} sub={z.message} icon={z.ready ? 'checkmark-circle' : 'alert-circle'} />
        <View style={{ padding: 16, gap: 8 }}><Btn title="Setup (pair terminal)" icon="link-outline" kind="secondary" busy={busy} spot={SPOT.diagnosticsSetup} onPress={async () => { const e = await pairReader(); add(e ? `Setup: ${e}` : 'Paired ✔'); }} />
          <Btn title="Check reader" icon="refresh" kind="secondary" spot={SPOT.diagnosticsCheck} onPress={async () => add((await checkReader()) ? 'Reader ready ✔' : useApp.getState().zeller.message ?? 'Not ready')} />
          <Btn title="Test purchase $1.00" icon="card-outline" busy={busy} onPress={() => void test()} disabled={!z.ready} />{lastRef ? <Btn title="Refund the $1.00 test" kind="secondary" onPress={() => void refund()} /> : null}
          <Txt size={12} sub>After reinstalling the app you must re-pair the terminal and re-enter Shopify credentials.</Txt></View></Section>
      ) : null}
      <Section title="Sync"><Row title={`Status: ${sync.state}`} sub={sync.error ?? (sync.at ? `Last ${new Date(sync.at).toLocaleTimeString()}` : undefined)} />{getLastPoll() ? <Row title="Last full sync" sub={getLastPoll()} /> : null}<Row title={`${outbox.length} sale(s) queued`} last right={<Btn small title="Sync now" spot={SPOT.diagnosticsSync} onPress={() => { void processOutbox(); void pollShared(); }} />} /></Section>
      <Section title="Card attempts (this device)">{attempts.slice(-8).reverse().map((a, i, arr) => <Row key={a.ref} last={i === arr.length - 1} title={`${fmt(a.amountCents)} · ${a.status}`} sub={`${a.ref}${a.resolvedBy ? ' · resolved by ' + a.resolvedBy : ''}`} />)}{!attempts.length ? <Row title="None yet" last /> : null}</Section>
      {/* 0200: only once CloudKit has sent the shop's attempts, so a register still on Shopify storage does not show an empty section */}
      {sharedAttempts.length ? <Section title="Card payments waiting (all registers)">{waiting.map((r, i) => <Row key={r.key} last={i === waiting.length - 1} title={r.title} sub={r.sub} right={r.resolvable && r.attempt ? <View style={{ flexDirection: 'row', gap: 6 }}><Btn small title="Charged" kind="secondary" busy={busy} onPress={() => void resolveElsewhere(r.attempt!, true)} /><Btn small title="Not charged" kind="secondary" busy={busy} onPress={() => void resolveElsewhere(r.attempt!, false)} /></View> : undefined} />)}{!waiting.length ? <Row title="None waiting" last /> : null}</Section> : null}
      {log.length ? <View style={{ padding: 16 }}><Card style={{ padding: 12 }}>{log.map((l, i) => <Txt key={i} size={12} sub>{l}</Txt>)}</Card></View> : null}
    </Page>
  );
}
