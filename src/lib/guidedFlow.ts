// Location: src/lib/guidedFlow.ts
// The guided checkout (Minimal mode, B5b): one question per screen. Pure rules, no React.
export type StepId = 'items' | 'customer' | 'discount' | 'review' | 'pay';
export type Step = { id: StepId; label: string; question: string; help: string };

export const STEPS: Step[] = [
  { id: 'items', label: 'Items', question: 'What is the customer buying?', help: 'Tap an item to add it, or scan it. Tap again to add another. When you have everything, press Next.' },
  { id: 'customer', label: 'Customer', question: 'Is this sale for a customer we know?', help: 'Adding a customer is optional. It lets you send them a receipt and keeps their history.' },
  { id: 'discount', label: 'Discount', question: 'Does the customer have a discount?', help: 'Deals that apply to the items are added for you. Only add one here if the customer has a voucher or you are giving a special price.' },
  { id: 'review', label: 'Check', question: 'Does this look right?', help: 'Check the items and the total with the customer. Tap an item to change how many, or remove it.' },
  { id: 'pay', label: 'Pay', question: 'Ready to take payment?', help: 'You will choose how they are paying on the next screen: card, cash, gift card or a mix.' },
];
export const STEP_IDS: StepId[] = STEPS.map(s => s.id);
export const stepInfo = (id: StepId): Step => STEPS.find(s => s.id === id) ?? STEPS[0];

export type FlowCtx = { itemCount: number; payStarted: boolean };
export const index = (id: StepId) => STEP_IDS.indexOf(id);
export const progress = (id: StepId) => ({ n: index(id) + 1, total: STEPS.length });

/** Can the person press Next on this step? The reason is shown in plain words when they cannot. */
export function canAdvance(id: StepId, ctx: FlowCtx): { ok: boolean; why?: string } {
  if (id === 'items' && ctx.itemCount === 0) return { ok: false, why: 'Add at least one item to carry on.' };
  if (id === 'pay') return { ok: false };
  return { ok: true };
}
export function next(id: StepId): StepId { return STEP_IDS[Math.min(index(id) + 1, STEP_IDS.length - 1)]; }
export function back(id: StepId, ctx: FlowCtx): StepId {
  if (ctx.payStarted && index(id) <= index('pay')) return id === 'pay' ? 'review' : id; // a part-paid sale cannot be edited, so Back from Pay stays near the end
  return STEP_IDS[Math.max(index(id) - 1, 0)];
}
/** Where the flow should be, given the cart. An empty cart (new sale, or the sale just finished) starts again at Items. A part-paid sale goes straight to Pay. */
export function settle(id: StepId, ctx: FlowCtx): StepId {
  if (ctx.payStarted) return 'pay';
  if (ctx.itemCount === 0) return 'items';
  return id;
}
/** Plain labels for the step bar: done, current, still to come. */
export function barState(id: StepId): ('done' | 'current' | 'todo')[] {
  const cur = index(id); return STEP_IDS.map((_, i) => (i < cur ? 'done' : i === cur ? 'current' : 'todo'));
}
