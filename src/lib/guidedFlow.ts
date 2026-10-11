// Location: src/lib/guidedFlow.ts
// The guided checkout (Minimal mode, B5b): one question per screen. Pure rules, no React.
export type StepId = 'items' | 'customer' | 'discount' | 'review' | 'pay';
export type Step = { id: StepId; label: string; question: string; help: string };

const CUSTOMER_STEP: Step = { id: 'customer', label: 'Customer', question: 'Is this sale for a customer we know?', help: 'Adding a customer is optional. It lets you send them a receipt and keeps their history.' };
const DEFAULT_STEPS: Step[] = [
  { id: 'items', label: 'Items', question: 'What is the customer buying?', help: 'Tap an item to add it, or scan it. Tap again to add another. When you have everything, press Next.' },
  { id: 'discount', label: 'Discount', question: 'Does the customer have a discount?', help: 'Deals that apply to the items are added for you. Only add one here if the customer has a voucher or you are giving a special price.' },
  { id: 'review', label: 'Check', question: 'Does this look right?', help: 'Check the items and the total with the customer. Tap an item to change how many, or remove it.' },
  { id: 'pay', label: 'Pay', question: 'Ready to take payment?', help: 'You will choose how they are paying on the next screen: card, cash, gift card or a mix.' },
];
export const stepsFor = (includeCustomer = false): Step[] => includeCustomer
  ? [DEFAULT_STEPS[0], CUSTOMER_STEP, ...DEFAULT_STEPS.slice(1)]
  : DEFAULT_STEPS;
export const STEPS = stepsFor();
export const STEP_IDS: StepId[] = STEPS.map(s => s.id);
export const stepInfo = (id: StepId): Step => [...DEFAULT_STEPS, CUSTOMER_STEP].find(s => s.id === id) ?? STEPS[0];

export type FlowCtx = { itemCount: number; payStarted: boolean };
export const index = (id: StepId, includeCustomer = false) => stepsFor(includeCustomer).findIndex(s => s.id === id);
export const progress = (id: StepId, includeCustomer = false) => ({ n: index(id, includeCustomer) + 1, total: stepsFor(includeCustomer).length });

/** Can the person press Next on this step? The reason is shown in plain words when they cannot. */
export function canAdvance(id: StepId, ctx: FlowCtx): { ok: boolean; why?: string } {
  if (id === 'items' && ctx.itemCount === 0) return { ok: false, why: 'Add at least one item to carry on.' };
  if (id === 'pay') return { ok: false };
  return { ok: true };
}
export function next(id: StepId, includeCustomer = false): StepId {
  const ids = stepsFor(includeCustomer).map(s => s.id); const i = ids.indexOf(id);
  return ids[Math.min(Math.max(i, 0) + 1, ids.length - 1)];
}
export function back(id: StepId, ctx: FlowCtx, includeCustomer = false): StepId {
  const ids = stepsFor(includeCustomer).map(s => s.id); const i = ids.indexOf(id);
  if (ctx.payStarted && i <= ids.indexOf('pay')) return id === 'pay' ? 'review' : id;
  return ids[Math.max(i - 1, 0)];
}
/** Where the flow should be, given the cart. An empty cart (new sale, or the sale just finished) starts again at Items. A part-paid sale goes straight to Pay. */
export function settle(id: StepId, ctx: FlowCtx, includeCustomer = false): StepId {
  if (ctx.payStarted) return 'pay';
  if (ctx.itemCount === 0) return 'items';
  if (!includeCustomer && id === 'customer') return 'discount';
  return id;
}
/** Plain labels for the step bar: done, current, still to come. */
export function barState(id: StepId, includeCustomer = false): ('done' | 'current' | 'todo')[] {
  const ids = stepsFor(includeCustomer).map(s => s.id); const cur = ids.indexOf(id);
  return ids.map((_, i) => (i < cur ? 'done' : i === cur ? 'current' : 'todo'));
}
