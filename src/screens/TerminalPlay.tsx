// Location: src/screens/TerminalPlay.tsx
// More > Training > Virtual terminal: the practice Zeller Terminal 2 on its own, to play with and to check against the real one.
// It owns a separate terminal (never the till's), takes a pretend payment through the same code the till uses, and shows every screen side by side.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Btn, Card, Chip, Page, Section, Toggle, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import VirtualTerminal, { useFaceBrand } from '../ui/VirtualTerminal';
import TerminalFace, { FACE_ASPECT } from '../ui/TerminalFace';
import { createVt } from '../lib/virtualTerminalSession';
import { makeTrainingTerminal } from '../lib/trainingTerminal';
import { describeEvent, startCharge } from '../lib/zeller';
import { money, previewState, VT_SCREENS } from '../lib/virtualTerminal';

const AMOUNTS = [1200, 4500, 12000] as const;

export default function TerminalPlay() {
  const { c } = useTheme(); const nav = useNav(); const brand = useFaceBrand();
  const [manual, setManual] = useState(true); const [dark, setDark] = useState(false); const [amount, setAmount] = useState<number>(4500); const [decline, setDecline] = useState(false);
  const [log, setLog] = useState<string[]>([]); const [busy, setBusy] = useState(false); const live = useRef<ReturnType<typeof startCharge> | null>(null); const outcome = useRef<'approve' | 'decline'>('approve'); outcome.current = decline ? 'decline' : 'approve';
  const vt = useMemo(() => createVt({ manual: true }), []); const term = useMemo(() => makeTrainingTerminal({ next: () => outcome.current, vt }), [vt]);
  useEffect(() => { vt.manual = manual; }, [vt, manual]); useEffect(() => { vt.dispatch({ t: 'dark', dark }); }, [vt, dark]); useEffect(() => () => vt.dispose(), [vt]);
  const start = () => {
    if (busy) return; setBusy(true); setLog([`Asked for ${money(amount)}`]); const add = (m: string) => setLog(l => [...l, m]);
    const ch = startCharge(term, { amountCents: amount, reference: `play-${Date.now()}` }, { onEvent: e => add(describeEvent(e)) });
    live.current = ch;
    void ch.promise.then(r => { live.current = null; add(r.kind === 'APPROVED' ? 'Result: approved' : r.kind === 'DECLINED' ? `Result: declined (${r.text})` : r.kind === 'CANCELLED' ? 'Result: cancelled' : `Result: ${r.kind}`); setBusy(false); });
  };
  return (
    <Page title="Virtual terminal" onBack={nav.pop}>
      <View style={{ padding: 16, gap: 14 }}>
        <Txt sub>A practice Zeller Terminal 2. It is not your real reader and charges nothing. Ask it for a payment, then play the customer: tap or insert a card, and key the PIN on its screen when it asks.</Txt>
        <View style={{ alignItems: 'center' }}><VirtualTerminal vt={vt} width={250} brand={brand} /></View>
        <Card style={{ padding: 14, gap: 10 }}>
          <Txt weight="700">Payment</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{AMOUNTS.map(a => <Chip key={a} label={`${money(a)}${a > 10000 ? ' (needs PIN)' : ''}`} active={amount === a} onPress={() => setAmount(a)} />)}</View>
          <Toggle label="Decline the card" sub="The terminal says Declined (insufficient funds)." value={decline} onChange={setDecline} />
          <Toggle label="I am the customer" sub="Off: the terminal taps a card and keys a PIN by itself." value={manual} onChange={setManual} />
          <Toggle label="Dark screen" sub="The Terminal 2 has light and dark screen modes." value={dark} onChange={setDark} />
          <Btn title={busy ? 'Waiting for the customer…' : 'Ask for payment'} onPress={start} disabled={busy} />
          {busy ? <Btn kind="secondary" title="Cancel from the till" onPress={() => live.current?.cancel()} /> : null}
          {log.length ? <View style={{ gap: 2 }}>{log.map((l, i) => <Txt key={i} size={13} sub>{l}</Txt>)}</View> : null}
        </Card>
        <Section title="Every screen" footer="The wording is an approximation until it is checked against photos of the real terminal." >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4 }}>
            {VT_SCREENS.map(sc => (
              <View key={sc} style={{ alignItems: 'center', gap: 4 }}>
                <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: c.line, height: 110 * FACE_ASPECT }}><TerminalFace s={previewState(sc, dark)} w={110} brand={brand} /></View>
                <Txt size={12} sub>{sc}</Txt></View>))}
          </ScrollView>
        </Section>
      </View>
    </Page>);
}
