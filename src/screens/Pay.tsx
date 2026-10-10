import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Btn, Card, Chip, Keypad, Money, Page, Row, Sheet, Txt, alertMsg, confirm } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp, currentStaff, type Attempt } from '../state/store';
import { usePriced, useCatalogue } from '../state/selectors';
import { buildSale, cardTender, cashTender, paidTotal } from '../lib/saleBuilder';
import { attemptRef, describeEvent, reconcile, startCharge, startRefund, type PaymentResult } from '../lib/zeller';
import { getTerminal, checkReader } from '../zellerBridge';
import { csv } from '../lib/csvStore';
import { applyLocalStock, recordSale, updateSaved } from '../lib/sync';
import { digitsToCents, fmt, allocate } from '../lib/money';
import { uid } from '../lib/ids';
import { emptyCart } from '../lib/cartOps';
import { lookupGiftCard, debitGiftCard, type GiftCardInfo } from '../lib/shopify/giftcards';
import { normaliseCode } from '../lib/giftCode';
import { GiftCheckSheet } from './sheets';
import { CashSheet, type CashResult } from './CashSheet';
import { cashDue, postCashSale, reverseCashTender } from '../lib/cashSale';
import { lockPayButtons, showsOwnSheet, showsWaitingStrip } from '../lib/payUi';
import { ReceiptPrompt } from './Receipt';
import { useUi } from '../ui/uiProfile';
import { payHint, payQuestion, payTitle } from '../lib/simpleLabels';
import type { SaleRecord, Tender } from '../lib/types';

type Card = { phase: 'idle' } | { phase: 'waiting'; text: string; amount: number } | { phase: 'declined'; text: string; amount: number; code?: string }
  | { phase: 'unknown'; ref: string; amount: number; text: string; checking: boolean } | { phase: 'notready'; text: string };

export default function Pay({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const ui = useUi(); const cart = useApp(s => s.pos.cart); const settings = useApp(s => s.settings); const zeller = useApp(s => s.zeller);
  const setCart = useApp(s => s.setCart); const priced = usePriced(); const cat = useCatalogue();
  const tenders = cart.tenders ?? []; const total = priced.netCents; const paid = paidTotal(tenders); const remaining = Math.max(0, total - paid);
  const [equalLeft, setEqualLeft] = useState(0); const [chunk, setChunk] = useState<number | null>(null);
  const [splitOpen, setSplitOpen] = useState(false); const [splitDigits, setSplitDigits] = useState(''); const [cashOpen, setCashOpen] = useState(false);
  const [gift, setGift] = useState(false); const [card, setCard] = useState<Card>({ phase: 'idle' });
  const [done, setDone] = useState<SaleRecord | null>(null); const [change, setChange] = useState<number | null>(null); const cancelRef = useRef<(() => void) | null>(null);
  const unknownRef = useRef<string | null>(null);

  const target = Math.min(remaining, chunk ?? (equalLeft > 1 ? allocate(remaining, Array(equalLeft).fill(1))[0] : remaining));
  const staffName = currentStaff()?.name;
  const saleUuid = () => { if (cart.saleUuid) return cart.saleUuid; const id = uid(); setCart(cc => ({ ...cc, saleUuid: id })); return id; };

  const addTender = (t: Tender, uuid: string) => {
    setCart(cc => ({ ...cc, saleUuid: uuid, tenders: [...(cc.tenders ?? []), t] })); setChunk(null); setEqualLeft(l => Math.max(0, l - 1));
  };

  // finalise as soon as nothing remains
  const finalising = useRef(false);
  useEffect(() => {
    if (finalising.current || tenders.length === 0 || remaining > 0 || total <= 0 && tenders.length === 0) return;
    if (card.phase === 'waiting') return;
    finalising.current = true;
    const sale = buildSale({ uuid: cart.saleUuid ?? uid(), cart, priced, variants: cat.variants, titles: cat.titles, tenders, registerId: settings.registerId, registerName: settings.registerName, staff: staffName });
    applyLocalStock(sale); void recordSale(sale); if (cart.savedFrom) updateSaved(cart.savedFrom, { status: 'void' });
    const chg = tenders.reduce((s, t) => s + (t.changeCents ?? 0), 0);
    setChange(chg); setDone(sale);
  }, [remaining, tenders.length]);

  const finishAll = () => { setCart(emptyCart()); setDone(null); finalising.current = false; onBack(); };

  // ── card ──
  const attempts = () => useApp.getState().pos.attempts;
  const setAttempt = (ref: string, p: Partial<Attempt>) => useApp.getState().patchPos({ attempts: attempts().map(a => (a.ref === ref ? { ...a, ...p } : a)) });
  const blockedByUnknown = () => attempts().find(a => a.saleUuid === cart.saleUuid && a.status === 'unknown');

  const runCard = async () => {
    if (lockPayButtons(card.phase)) return; // a charge is already running
    const u = blockedByUnknown(); if (u) { setCard({ phase: 'unknown', ref: u.ref, amount: u.amountCents, text: 'A previous card payment has no result yet. Resolve it before charging again.', checking: false }); return; }
    const term = getTerminal(); if (!term || !zeller.ready) { const ok = await checkReader(); if (!ok || !getTerminal()) { setCard({ phase: 'notready', text: useApp.getState().zeller.message ?? 'Reader issue' }); return; } }
    const t = getTerminal()!; const uuid = saleUuid(); const amount = target; if (amount <= 0) return;
    const ref = attemptRef(uuid, attempts().filter(a => a.saleUuid === uuid).length + 1);
    setCard({ phase: 'waiting', text: 'Starting…', amount });
    const h = startCharge(t, { amountCents: amount, reference: ref }, {
      onStarted: () => useApp.getState().patchPos({ attempts: [...attempts(), { ref, saleUuid: uuid, amountCents: amount, ts: new Date().toISOString(), status: 'started' }] }),
      onEvent: e => setCard(s => (s.phase === 'waiting' ? { ...s, text: describeEvent(e) } : s)),
    });
    cancelRef.current = h.cancel;
    const res: PaymentResult = await h.promise; cancelRef.current = null;
    switch (res.kind) {
      case 'APPROVED': setAttempt(ref, { status: 'approved' }); setCard({ phase: 'idle' }); addTender(cardTender({ ...res.txn, externalReference: res.txn.externalReference ?? ref }, amount, settings.fees), uuid); break;
      case 'DECLINED': setAttempt(ref, { status: 'declined' }); void csv.event({ kind: 'declined', saleUuid: uuid, reference: ref, amountCents: amount, code: res.code, message: res.text, staff: staffName }); setCard({ phase: 'declined', text: res.text, amount, code: res.code }); break;
      case 'CANCELLED': setAttempt(ref, { status: 'cancelled' }); void csv.event({ kind: 'cancelled', saleUuid: uuid, reference: ref, amountCents: amount, staff: staffName }); setCard({ phase: 'idle' }); break;
      case 'NOT_READY': setAttempt(ref, { status: 'cancelled' }); setCard({ phase: 'notready', text: res.message }); useApp.getState().notify({ kind: 'reader', title: 'Reader issue', body: res.message, route: 'diagnostics' }); break;
      case 'UNKNOWN': setAttempt(ref, { status: 'unknown', note: res.reason }); void csv.event({ kind: 'unknown_payment', saleUuid: uuid, reference: ref, amountCents: amount, message: res.reason, staff: staffName }); unknownRef.current = ref; setCard({ phase: 'unknown', ref, amount, text: 'Checking…', checking: true }); void recheck(ref, amount, uuid); break;
    }
  };

  /** Never re-charge before an unknown result resolves: poll getTransactions({reference}); manual resolve is logged. */
  const recheck = async (ref: string, amount: number, uuid: string) => {
    const t = getTerminal(); if (!t) return setCard({ phase: 'unknown', ref, amount, text: 'Can’t check right now — reader unavailable.', checking: false });
    for (let i = 0; i < 6; i++) {
      setCard({ phase: 'unknown', ref, amount, text: 'Checking…', checking: true });
      const r = await reconcile(t, ref);
      if (r.kind === 'APPROVED') { setAttempt(ref, { status: 'resolved' }); setCard({ phase: 'idle' }); addTender(cardTender({ ...r.txn, externalReference: r.txn.externalReference ?? ref }, amount, settings.fees), uuid); return; }
      if (r.kind === 'DECLINED' || r.kind === 'CANCELLED') { setAttempt(ref, { status: 'resolved' }); setCard({ phase: 'declined', text: 'The payment did not go through. You can try again.', amount }); return; }
      await new Promise(res => setTimeout(res, 4000));
    }
    setCard({ phase: 'unknown', ref, amount, text: 'Still no answer from Zeller. Check the terminal or Zeller dashboard.', checking: false });
  };
  const manualResolve = async (charged: boolean, ref: string, amount: number) => {
    const ok = await confirm(charged ? 'Customer WAS charged?' : 'Customer was NOT charged?', charged ? `Records ${fmt(amount)} as paid by card. Only confirm if you saw it approved on the terminal or Zeller dashboard.` : 'Allows you to charge again. Only confirm if you have checked the terminal or Zeller dashboard.', 'Confirm', !charged);
    if (!ok) return;
    const who = staffName ?? settings.registerName; setAttempt(ref, { status: 'resolved', resolvedBy: who });
    void csv.event({ kind: 'unknown_resolved', saleUuid: cart.saleUuid, reference: ref, amountCents: amount, message: charged ? 'resolved: charged' : 'resolved: not charged', staff: who });
    setCard({ phase: 'idle' });
    if (charged) addTender({ id: ref, kind: 'card', amountCents: amount, card: { externalReference: ref }, feeCents: Math.round(amount * settings.fees.cardPresentRate), at: new Date().toISOString() }, cart.saleUuid ?? saleUuid());
  };

  // ── cash ──
  /** Cash taken on the Cash sheet. `received` / `given` (the notes and coins) are null when the cashier chose not to track them. */
  const takeCash = (r: CashResult) => {
    const isFinal = target === remaining && r.applyCents === undefined; const { tender, settles } = cashTender(r.applyCents ?? target, r.tendered, settings.cashRounding && isFinal);
    if (!settles && r.tendered <= 0) return;
    const uuid = saleUuid(); const t: Tender = { ...tender, ...(r.received ? { cashIn: r.received } : {}), ...(r.given ? { cashOut: r.given } : {}) };
    if (r.received || r.given) useApp.getState().patchPos({ ledger: postCashSale(useApp.getState().pos.ledger, { saleUuid: uuid, received: r.received, given: r.given, staff: staffName }) });
    addTender(t, uuid); setCashOpen(false);
  };

  // ── gift card ──
  const useGift = async (info: GiftCardInfo, code: string) => {
    const amt = Math.min(info.balanceCents, target); const uuid = saleUuid();
    try { await debitGiftCard(info.id, amt, `POS sale ${uuid.slice(0, 8)}`); } catch (e: any) { return alertMsg('Gift card could not be charged', e.message); }
    addTender({ id: uid(), kind: 'gift_card', amountCents: amt, giftCardId: info.id, giftCardCode: normaliseCode(code), at: new Date().toISOString() }, uuid); setGift(false);
  };

  const abandon = async () => {
    const cards = tenders.filter(t => t.kind === 'card'); if (!tenders.length) { onBack(); return; }
    if (!(await confirm('Cancel this sale?', `Card payments (${cards.length}) will be refunded to the customer's card. Cash and gift card payments must be returned by hand${tenders.some(t => t.cashIn || t.cashOut) ? ' (the drawer ledger will be put back too)' : ''}.`, 'Refund & cancel', true))) return;
    const t = getTerminal(); if (cards.length && !t) return alertMsg('Reader not ready', 'Cannot refund cards right now.');
    for (const tn of cards) {
      const ref = tn.card?.externalReference ?? tn.id; const r = await startRefund(t!, { purchaseRef: ref, amountCents: tn.amountCents, reference: `${ref}-void` }).promise;
      if (r.kind !== 'APPROVED') { void csv.event({ kind: 'refund_failed', saleUuid: cart.saleUuid, reference: ref, amountCents: tn.amountCents, message: JSON.stringify(r), staff: staffName }); return alertMsg('Refund did not complete', 'kind' in r && r.kind === 'FAILED' ? r.text : 'Check the terminal, then try again.'); }
    }
    let ledger = useApp.getState().pos.ledger; for (const tn of tenders) ledger = reverseCashTender(ledger, tn, { saleUuid: cart.saleUuid, staff: staffName }); if (ledger !== useApp.getState().pos.ledger) useApp.getState().patchPos({ ledger });
    void csv.event({ kind: 'void', saleUuid: cart.saleUuid, amountCents: paid, staff: staffName, message: 'Partial sale cancelled' });
    setCart(c0 => ({ ...c0, tenders: undefined, saleUuid: undefined })); onBack();
  };

  const busy = card.phase === 'waiting';
  return (
    <Page title="Payment" onBack={busy ? undefined : () => (tenders.length ? void abandon() : onBack())} right={zeller.ready ? undefined : <Txt size={13} color={c.bad} style={{ marginRight: 12 }}>Reader issue</Txt>}>
      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
        <Txt sub>{tenders.length ? 'Remaining' : 'Total due'}</Txt><Money cents={remaining} size={46} weight="700" />
        {tenders.length ? <Txt sub size={13}>of {fmt(total)}</Txt> : null}
        {chunk !== null || equalLeft > 1 ? <Txt size={14} weight="600" style={{ marginTop: 6 }}>Next payment: {fmt(target)}</Txt> : null}
      </View>
      {showsWaitingStrip(card.phase) && card.phase === 'waiting' ? (
        <View style={{ marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 14, backgroundColor: c.fill, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ActivityIndicator />
          <View style={{ flex: 1 }}><Txt weight="600">Waiting on terminal · {fmt(card.amount)}</Txt><Txt sub size={13}>{card.text}</Txt></View>
          <Btn title="Cancel" kind="secondary" small onPress={() => cancelRef.current?.()} />
        </View>
      ) : null}
      {tenders.length ? <View style={{ marginHorizontal: 16, marginBottom: 12 }}><Card>{tenders.map((t, i) => <Row key={t.id} last={i === tenders.length - 1} icon={t.kind === 'card' ? 'card-outline' : t.kind === 'cash' ? 'cash-outline' : 'gift-outline'} title={t.kind === 'card' ? `Card ${t.card?.panMasked ? '•••• ' + t.card.panMasked : ''}` : t.kind === 'cash' ? 'Cash' : 'Gift card'} right={<Money cents={t.amountCents} />} />)}</Card></View> : null}
      {remaining > 0 ? (
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {payQuestion(ui.explain, true) ? <Txt size={17} weight="700" style={{ textAlign: 'center', marginBottom: 2 }}>{payQuestion(ui.explain, true)}</Txt> : null}
          <PayOption hint={payHint('card', ui.explain)}><Btn title={payTitle('card', ui.explain, target)} icon="card-outline" disabled={lockPayButtons(card.phase)} onPress={() => void runCard()} /></PayOption>
          <PayOption hint={payHint('cash', ui.explain)}><Btn title={payTitle('cash', ui.explain, target)} icon="cash-outline" kind="secondary" disabled={lockPayButtons(card.phase)} onPress={() => setCashOpen(true)} /></PayOption>
          <PayOption hint={payHint('gift', ui.explain)}><Btn title={payTitle('gift', ui.explain, target)} icon="gift-outline" kind="secondary" disabled={lockPayButtons(card.phase)} onPress={() => setGift(true)} /></PayOption>
          <PayOption hint={payHint('split', ui.explain)}><Btn title={payTitle('split', ui.explain, target)} icon="git-branch-outline" kind="secondary" disabled={lockPayButtons(card.phase)} onPress={() => { setSplitDigits(''); setSplitOpen(true); }} /></PayOption>
          {chunk !== null || equalLeft > 1 ? <Btn title="Cancel split" kind="ghost" onPress={() => { setChunk(null); setEqualLeft(0); }} /> : null}
        </View>
      ) : total === 0 && tenders.length === 0 ? <View style={{ padding: 16 }}><Btn title="Complete $0.00 sale" onPress={() => takeCash({ tendered: 0, received: null, given: null })} /></View> : null}

      {/* card status */}
      <Sheet visible={showsOwnSheet(card.phase)} dismissable={false} title={card.phase === 'unknown' ? 'Payment status unknown' : card.phase === 'declined' ? 'Not approved' : 'Reader'} onClose={() => {}}>
        {card.phase === 'declined' ? <View style={{ gap: 12 }}><Txt size={17}>{card.text}</Txt>{card.code ? <Txt sub size={13}>Code {card.code}. The cart is kept.</Txt> : <Txt sub size={13}>The cart is kept.</Txt>}
          <Btn title="Try card again" onPress={() => { setCard({ phase: 'idle' }); void runCard(); }} /><Btn title="Use another method" kind="secondary" onPress={() => setCard({ phase: 'idle' })} /></View> : null}
        {card.phase === 'unknown' ? <View style={{ gap: 12 }}><View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>{card.checking ? <ActivityIndicator /> : null}<Txt size={16} style={{ flex: 1 }}>{card.text}</Txt></View>
          <Txt sub size={13}>The customer may have been charged {fmt(card.amount)}. Do not charge again until this is resolved.</Txt>
          <Btn title="Check again" kind="secondary" disabled={card.checking} onPress={() => void recheck(card.ref, card.amount, cart.saleUuid ?? saleUuid())} />
          <Btn title="Customer WAS charged" kind="secondary" onPress={() => void manualResolve(true, card.ref, card.amount)} /><Btn title="Customer was NOT charged" kind="ghost" onPress={() => void manualResolve(false, card.ref, card.amount)} />
          <Btn title="Close" kind="ghost" onPress={() => setCard({ phase: 'idle' })} /></View> : null}
        {card.phase === 'notready' ? <View style={{ gap: 12 }}><Txt size={16}>{card.text}</Txt><Btn title="Retry" onPress={() => { setCard({ phase: 'idle' }); void runCard(); }} /><Btn title="Close" kind="secondary" onPress={() => setCard({ phase: 'idle' })} /></View> : null}
      </Sheet>

      {/* cash */}
      <CashSheet visible={cashOpen} onClose={() => setCashOpen(false)} due={cashDue(target, remaining, settings.cashRounding)} onTake={takeCash} />

      {/* split */}
      <Sheet visible={splitOpen} onClose={() => setSplitOpen(false)} title="Split amount">
        <Txt sub style={{ textAlign: 'center' }}>First payment</Txt>
        <Txt size={34} weight="700" style={{ textAlign: 'center', marginVertical: 8 }}>{fmt(digitsToCents(splitDigits))}</Txt>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>{[2, 3, 4].map(n => <Chip key={n} label={`Split equally ${n}`} onPress={() => { setEqualLeft(n); setChunk(null); setSplitOpen(false); }} />)}</View>
        <Keypad value={splitDigits} onChange={setSplitDigits} submitLabel="Continue" onSubmit={() => { const v = digitsToCents(splitDigits); if (v >= remaining) { alertMsg('Amount must be less than the remaining total'); return; } setChunk(v); setEqualLeft(0); setSplitOpen(false); }} />
      </Sheet>

      <GiftCheckSheet visible={gift} onClose={() => setGift(false)} onUse={(g, code) => void useGift(g, code)} />
      {done ? <ReceiptPrompt sale={done} onDone={finishAll} /> : null}
    </Page>
  );
}
/** A payment button with an optional plain-English line under it (Simple mode). */
function PayOption({ hint, children }: { hint?: string; children: React.ReactNode }) {
  return <View style={{ gap: 4 }}>{children}{hint ? <Txt size={13} sub style={{ textAlign: 'center', paddingHorizontal: 12 }}>{hint}</Txt> : null}</View>;
}
void lookupGiftCard;
