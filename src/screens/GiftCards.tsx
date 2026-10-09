import React, { useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, Money, Page, Row, Txt } from '../ui/kit';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { GIFT_CARD_PASSES } from '../lib/features';
import { GiftCheckSheet, GiftSellSheet } from './sheets';
import { giftCardHistory, type GiftCardTxn } from '../lib/shopify/giftcards';
import { lookupGiftCard, type GiftCardInfo } from '../lib/shopify/giftcards';

/** Gift cards hub: sell (adds a line to the cart), check balance by scan/typing, use as tender at Pay. */
export default function GiftCards() {
  const nav = useNav(); const [sell, setSell] = useState(false); const [check, setCheck] = useState(false); const url = useApp(s => s.settings.passServerUrl);
  const [hist, setHist] = useState<{ info: GiftCardInfo; txns: GiftCardTxn[] } | null>(null);
  const show = async (_g: GiftCardInfo, code: string) => { const info = await lookupGiftCard(code); if (info) setHist({ info, txns: await giftCardHistory(info.id) }); setCheck(false); };
  return (
    <Page title="Gift cards" onBack={nav.pop}>
      <View style={{ padding: 16, gap: 10 }}>
        <Btn title="Sell gift card" icon="gift-outline" onPress={() => { setSell(true); }} />
        <Btn title="Check balance" icon="search-outline" kind="secondary" onPress={() => setCheck(true)} />
        <Btn title="Sales report (sold / redeemed / outstanding)" icon="stats-chart-outline" kind="secondary" onPress={() => nav.push('reports')} />
        {GIFT_CARD_PASSES ? <Txt size={12} sub>{url ? 'Apple Wallet passes are offered after a gift card sale.' : 'Set the pass server URL in Settings ▸ Gift cards to offer Apple Wallet passes.'}</Txt> : null}
      </View>
      {hist ? <View style={{ paddingHorizontal: 16 }}><Card><Row title={`Card ••••${hist.info.last4}`} sub={hist.info.enabled ? 'Active' : 'Disabled'} right={<Money cents={hist.info.balanceCents} weight="700" />} />{hist.txns.map((t, i) => <Row key={t.id} last={i === hist.txns.length - 1} title={t.kind === 'credit' ? 'Credit' : 'Redeemed'} sub={new Date(t.at).toLocaleString()} right={<Money cents={t.kind === 'credit' ? t.cents : -t.cents} />} />)}</Card></View> : null}
      <GiftSellSheet visible={sell} onClose={() => { setSell(false); nav.setTab('checkout'); }} />
      <GiftCheckSheet visible={check} onClose={() => setCheck(false)} onUse={(g, code) => void show(g, code)} />
    </Page>
  );
}
