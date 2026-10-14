// Location: src/screens/Receipt.tsx
import React, { useEffect, useState } from 'react';
import { SPOT } from '../lib/trainingSpots';
import { isTraining } from '../lib/trainingGuard';
import { Image, Linking, Share, View } from 'react-native';
import { Btn, HelpButton, Sheet, Txt, alertMsg } from '../ui/kit';
import { useApp } from '../state/store';
import { fmt } from '../lib/money';
import { getClaimSecret, getPassSecret } from '../lib/shopify/client';
import { claimUrl } from '../lib/giftClaim';
import { giftQrPayload } from '../lib/giftCode';
import { signedPassUrl } from '../lib/passUrl';
import { GIFT_CARD_PASSES } from '../lib/features';
import { receiptId, receiptUrl } from '../lib/receiptDoc';
import { uploadReceipt } from '../lib/receiptSync';
import { QR } from '../ui/QR';
import type { SaleRecord } from '../lib/types';
import { BUSINESS_LOGO_URL } from '../lib/screensaver';

export const receiptText = (s: SaleRecord): string => {
  const lines = s.lines.map(l => `${l.qty} × ${l.title}${l.variantTitle ? ` (${l.variantTitle})` : ''} — ${fmt(l.netCents)}`);
  const paid = s.tenders.map(t => `${t.kind === 'card' ? 'Card' : t.kind === 'cash' ? 'Cash' : t.kind === 'gift_card' ? 'Gift card' : 'Credit'}: ${fmt(t.amountCents)}`);
  return [`${useApp.getState().settings.shopName || 'Receipt'}`, new Date(s.ts).toLocaleString(), s.orderName ? `Order ${s.orderName}` : '', '', ...lines, '',
    s.discountCents ? `Discounts: −${fmt(s.discountCents)}` : '', `Total: ${fmt(s.netCents)}`, ...paid, s.receiptLink ? `\nCard receipt: ${s.receiptLink}` : '', '\nThank you!'].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
};

/** After payment: QR / text / email the receipt link (merged order + card receipt page), or the plain-text fallback when no receipt server is set. */
export function ReceiptPrompt({ sale, onDone }: { sale: SaleRecord | null; onDone: () => void }) {
  const url = useApp(s => s.settings.passServerUrl); const rc = useApp(s => s.settings.receipt); const shop = useApp(s => s.settings.shopName);
  const [qr, setQr] = useState(false); const [busy, setBusy] = useState(false); const [note, setNote] = useState(''); const [practiceSent, setPracticeSent] = useState('');
  const claimBase = useApp(s => s.settings.giftClaimUrl); const [claimSecret, setClaimSecretState] = useState('');
  const [giftView, setGiftView] = useState<null | { kind: 'claim' | 'card'; i: number }>(null);
  useEffect(() => { void getClaimSecret().then(setClaimSecretState); }, []);
  const enabled = !!rc.serverUrl.trim();
  useEffect(() => { if (sale && enabled) void uploadReceipt(sale).catch(() => {}); }, [sale?.uuid, enabled]); // publish early; the outbox retries if this fails
  if (!sale) return null;
  const link = enabled ? receiptUrl(rc.serverUrl, receiptId(sale.uuid)) : '';
  const body = enabled ? `${rc.name || shop || 'Receipt'}\nYour ${rc.gstRegistered ? 'tax invoice' : 'receipt'}: ${link}` : receiptText(sale);
  const gifts = sale.lines.filter(l => l.kind === 'gift_card' && l.giftCardCode); const gift = gifts[0];
  const claimable = gifts.filter(l => !l.giftRecipient && claimUrl(claimBase, claimSecret, l.giftCardCode!)); // A10: no email given at the till, so the customer can add theirs
  const practice = isTraining(); // in training nothing may leave the till, so an app is never opened: the screen says what would have happened
  const open = async (u: string) => { if (practice) { setPracticeSent(`Practice: ${u.startsWith('sms') ? 'Messages' : 'Mail'} would open now with the receipt ready to send.`); return; } try { await Linking.openURL(u); } catch { alertMsg('Could not open that app', undefined, 'pay/receipts'); } };
  const showQr = async () => { setBusy(true); try { await uploadReceipt(sale); setNote(''); } catch (e: any) { setNote('Not published yet. It goes live when this iPad can reach the receipt server.'); } setBusy(false); setQr(true); };
  return (
    <Sheet visible onClose={onDone} title="Receipt" dismissable={false} screen="sheet_receipt">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
        <Image source={{ uri: BUSINESS_LOGO_URL }} resizeMode="contain" style={{ width: 32, height: 32 }} accessibilityLabel="Aiden’s 3D Printing logo" />
        <Txt size={16} weight="600">{rc.name || shop || 'Thank you for shopping with us'}</Txt>
      </View>
      <View style={{ alignItems: 'center', marginBottom: 14 }}><Txt size={34} weight="700">{fmt(sale.netCents)}</Txt><Txt sub>{sale.type === 'refund' ? 'Refund complete' : 'Sale complete'}{sale.orderName ? ` · ${sale.orderName}` : ''}</Txt></View>
      {sale.tenders.some(t => (t.changeCents ?? 0) > 0) ? <Txt weight="700" size={20} style={{ textAlign: 'center', marginBottom: 12 }}>Change {fmt(sale.tenders.reduce((s, t) => s + (t.changeCents ?? 0), 0))}</Txt> : null}
      {giftView ? <View style={{ gap: 10 }}>
        {(() => {
          const list = giftView.kind === 'claim' ? claimable : gifts; const l = list[giftView.i]; if (!l) return null;
          const value = giftView.kind === 'claim' ? claimUrl(claimBase, claimSecret, l.giftCardCode!) ?? '' : giftQrPayload(l.giftCardCode!);
          return <>
            <QR value={value} size={230} />
            <Txt size={13} sub style={{ textAlign: 'center' }}>{giftView.kind === 'claim' ? 'Scan with a phone camera. The customer enters their name and email and the gift card is emailed to them. It works once.' : 'Scan this at any register to use or check the card. It holds the gift card code, so treat it like cash.'}{list.length > 1 ? ` (${giftView.i + 1} of ${list.length})` : ''}</Txt>
            {list.length > 1 ? <Btn title="Next gift card" kind="secondary" onPress={() => setGiftView({ ...giftView, i: (giftView.i + 1) % list.length })} /> : null}
          </>;
        })()}
        <Btn title="Back" kind="secondary" onPress={() => setGiftView(null)} />
      </View> : qr ? <View style={{ gap: 10 }}>
        <QR value={link} size={230} />
        <Txt size={13} sub style={{ textAlign: 'center' }}>Scan to open the {rc.gstRegistered ? 'tax invoice' : 'receipt'}: itemised, with card details, PDF and image download.</Txt>
        {note ? <Txt size={13} color="#B45309" style={{ textAlign: 'center' }}>{note}</Txt> : null}
        <Btn spot={SPOT.receiptQrBack} title="Back" kind="secondary" onPress={() => setQr(false)} />
      </View> : <View style={{ gap: 8 }}>
        {enabled ? <Btn spot={SPOT.receiptQr} title="Show QR code" icon="qr-code-outline" busy={busy} onPress={() => void showQr()} /> : null}
        <Btn spot={SPOT.receiptEmail} title={enabled ? 'Email link' : 'Email receipt'} icon="mail-outline" kind="secondary" onPress={() => { const to = sale.customer?.email ?? ''; void open(`mailto:${to}?subject=${encodeURIComponent(enabled ? (rc.gstRegistered ? 'Your tax invoice' : 'Your receipt') : 'Your receipt')}&body=${encodeURIComponent(body)}`); }} />
        <Btn spot={SPOT.receiptText} title={enabled ? 'Text link' : 'Text receipt'} icon="chatbubble-outline" kind="secondary" onPress={() => { const to = sale.customer?.phone ?? ''; void open(`sms:${to}&body=${encodeURIComponent(body)}`); }} />
        <Btn spot={SPOT.receiptShare} title="Share…" icon="share-outline" kind="secondary" onPress={() => { if (practice) { setPracticeSent('Practice: the Share sheet would open now.'); return; } void Share.share({ message: body }); }} />
        <HelpButton id={gift ? 'pay/gift-card' : 'pay/receipts'} label="Receipt help" />
        {GIFT_CARD_PASSES && gift && url ? <Btn title="Add gift card to Apple Wallet" icon="wallet-outline" kind="secondary" onPress={async () => { const secret = await getPassSecret(); if (!secret) return alertMsg('Pass server secret missing', 'Add it in Settings ▸ Gift cards.', 'gift'); void open(signedPassUrl(url, secret, gift.giftCardCode!)); }} /> : null}
        {claimable.length ? <Btn title="Claim QR: customer adds their email" icon="qr-code-outline" kind="secondary" onPress={() => setGiftView({ kind: 'claim', i: 0 })} /> : null}
        {gift ? <Btn title="Gift card QR (for scanning at a register)" icon="gift-outline" kind="secondary" onPress={() => setGiftView({ kind: 'card', i: 0 })} /> : null}
        {gift ? <Txt size={13} sub style={{ textAlign: 'center' }}>Gift card code: {gift.giftCardCode}{gift.giftRecipient ? ` · emailing to ${gift.giftRecipient.email}` : ''}</Txt> : null}
        {practiceSent ? <Txt size={13} color="#B45309" style={{ textAlign: 'center' }}>{practiceSent}</Txt> : null}
        <Btn spot={SPOT.receiptNone} title="No receipt" onPress={onDone} />
      </View>}
    </Sheet>
  );
}
