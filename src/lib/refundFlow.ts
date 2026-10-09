// Executes a return: card portion via Zeller, gift-card credit, Shopify refundCreate, local record + CSV + rollup (via outbox).
import { useApp } from '../state/store';
import { csv } from './csvStore';
import { recordSale } from './sync';
import { uid } from './ids';
import { planRefund, refundableByGateway, splitAcrossCards, type RefundMethod } from './returns';
import { startRefund, type TerminalLike } from './zeller';
import { refundOrderInShopify, type PosOrder } from './shopify/orders';
import { creditGiftCard, createGiftCard, newGiftCode } from './shopify/giftcards';
import type { SaleLine, SaleRecord, Tender } from './types';

export const REFUND_REASONS = ['Returned Goods', 'Accidental Charge', 'Cancelled Order', 'Fraudulent Charge', 'Other'] as const;
export type ReturnLine = { lineId: string; qty: number };

export type RefundOutcome = { ok: boolean; message?: string; done: Partial<Record<Tender['kind'], number>>; newGiftCode?: string; cashOwedCents: number; record?: SaleRecord };

export async function executeRefund(a: {
  order: PosOrder; lines: ReturnLine[]; amountCents: number; method: RefundMethod; reason: string; restock: boolean; terminal: TerminalLike | null; exchangeCreditCents?: number;
}): Promise<RefundOutcome> {
  const s = useApp.getState(); const { order } = a; const staff = s.settings.staff.find(x => x.id === s.staffId)?.name;
  const refundable = refundableByGateway(order.transactions);
  const { plan, shortBy } = planRefund(a.amountCents, a.method, refundable);
  if (shortBy > 0) return { ok: false, message: `Only ${(a.amountCents - shortBy) / 100} can be refunded to the original payment methods.`, done: {}, cashOwedCents: 0 };
  const done: Partial<Record<Tender['kind'], number>> = {}; const saleUuid = order.saleUuid ?? order.id; let newGiftCodeOut: string | undefined; const tenders: Tender[] = [];
  const stamp = () => new Date().toISOString();

  // 1. card → Zeller
  if (plan.card) {
    if (!a.terminal) return { ok: false, message: 'Reader not ready — card refunds need the terminal.', done, cashOwedCents: 0 };
    let got = 0;
    for (const part of splitAcrossCards(plan.card, order.tenders)) {
      const ref = part.tender.card?.externalReference ?? part.tender.id; const rr = `${saleUuid}-r${uid().slice(0, 6)}`;
      const r = await startRefund(a.terminal, { purchaseRef: ref, amountCents: part.cents, reference: rr }, { onStarted: () => csv.event({ kind: 'override', saleUuid, reference: rr, amountCents: part.cents, message: 'card refund started', staff }) }).promise;
      if (r.kind === 'APPROVED') { got += part.cents; tenders.push({ id: rr, kind: 'card', amountCents: part.cents, card: { externalReference: rr, receiptLink: r.txn.receiptLink, approvalCode: r.txn.approvalCode, transactionUuid: r.txn.transactionUuid, panMasked: part.tender.card?.panMasked }, at: stamp() }); continue; }
      void csv.event({ kind: 'refund_failed', saleUuid, reference: rr, amountCents: part.cents, message: JSON.stringify(r), staff });
      if (!got) return { ok: false, message: r.kind === 'FAILED' ? r.text : r.kind === 'UNKNOWN' ? 'The card refund status is unknown — check the Zeller dashboard before trying again.' : 'Card refund cancelled.', done, cashOwedCents: 0 };
      done.card = got; return await finish(false, `Card refund partly completed (${got / 100} of ${plan.card / 100}). Check Zeller before retrying the rest.`);
    }
    done.card = got;
  }
  // 2. gift card
  if (plan.gift_card) {
    try {
      const orig = order.tenders.find(t => t.kind === 'gift_card' && t.giftCardId);
      if (a.method === 'original' && orig?.giftCardId) { await creditGiftCard(orig.giftCardId, plan.gift_card, `Refund ${order.name}`); tenders.push({ id: uid(), kind: 'gift_card', amountCents: plan.gift_card, giftCardId: orig.giftCardId, giftCardCode: orig.giftCardCode, at: stamp() }); }
      else { const code = newGiftCode(); await createGiftCard(plan.gift_card, code, `refund-${saleUuid}`, order.customer?.id); newGiftCodeOut = code; tenders.push({ id: uid(), kind: 'gift_card', amountCents: plan.gift_card, giftCardCode: code, at: stamp() }); }
      done.gift_card = plan.gift_card;
    } catch (e: any) { return await finish(false, `Gift card credit failed: ${e.message}`, true); }
  }
  // 3. cash is handed over by the cashier
  if (plan.cash) { done.cash = plan.cash; tenders.push({ id: uid(), kind: 'cash', amountCents: plan.cash, at: stamp() }); }
  return await finish(true);

  async function finish(ok: boolean, message?: string, abortIfNothing = false): Promise<RefundOutcome> {
    const money = Object.values(done).reduce((x, y) => x + (y ?? 0), 0);
    if (abortIfNothing && !money) return { ok, message, done, cashOwedCents: 0 };
    try { await refundOrderInShopify(order, a.lines.map(l => ({ lineItemId: l.lineId, quantity: l.qty, restock: a.restock })), done, `${a.reason} (POS)`, s.settings.locationId); }
    catch (e: any) { void csv.event({ kind: 'error', saleUuid, message: `Shopify refund failed: ${e.message}`, staff }); useApp.getState().notify({ kind: 'refund', title: 'Refund not recorded in Shopify', body: `${order.name}: ${e.message}. The money was already returned.`, route: 'notifications' }); message = (message ? message + ' ' : '') + 'Refund taken but Shopify did not record it — see Notifications.'; }
    const lines: SaleLine[] = a.lines.map(rl => {
      const ol = order.lines.find(l => l.id === rl.lineId)!; const cost = a.restock ? Math.round((ol.costCents ?? 0)) * rl.qty : 0;
      return { variantId: ol.variantId, title: ol.title, variantTitle: ol.variantTitle, qty: rl.qty, baseUnitCents: ol.originalUnitCents, grossCents: ol.originalUnitCents * rl.qty, discountCents: (ol.originalUnitCents - ol.unitCents) * rl.qty, netCents: ol.unitCents * rl.qty, costCents: cost, discountLabels: ol.discount ? [ol.discount] : [], kind: 'item' };
    });
    const credit = a.exchangeCreditCents ?? 0;
    const record: SaleRecord = { uuid: uid(), type: 'refund', refundOf: saleUuid, ts: stamp(), registerId: s.settings.registerId, registerName: s.settings.registerName, staff, customer: order.customer,
      lines, itemsCents: 0, discountCents: 0, netCents: money + credit, tipCents: 0, totalCents: money + credit, cogsCents: lines.reduce((x, l) => x + l.costCents, 0), feesCents: 0, roundingCents: 0,
      tenders, deals: [], reason: a.reason, orderGid: order.id, orderName: order.name };
    await recordSale(record);
    return { ok, message, done, newGiftCode: newGiftCodeOut, cashOwedCents: done.cash ?? 0, record };
  }
}
