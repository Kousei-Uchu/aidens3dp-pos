// Location: src/alloykit/elements.ts
// 0250: what each Element is called, whether setup must pick something for it, and what a shop loses when it is Off.
import type { ElementId } from './types';

export type ElementInfo = { id: ElementId; label: string; blurb: string; required: boolean; whenOff: string };

export const ELEMENTS: ElementInfo[] = [
  { id: 'catalogue', label: 'Catalogue', blurb: 'Products, variations, prices, images and collections.', required: true, whenOff: '' },
  { id: 'orders', label: 'Orders', blurb: 'Recording each sale, listing orders and refunding them.', required: true, whenOff: '' },
  { id: 'sharedState', label: 'Shared state', blurb: 'Carts, layouts, sales and settings shared between registers.', required: true, whenOff: '' },
  { id: 'stock', label: 'Stock', blurb: 'Counts, receiving, adjusting and counting stock.', required: false, whenOff: 'Items are not tracked and stock screens are hidden.' },
  { id: 'discounts', label: 'Discounts', blurb: 'Automatic discounts and manual presets.', required: false, whenOff: 'Only discounts typed at the till are available.' },
  { id: 'customers', label: 'Customers', blurb: 'Finding and saving customers.', required: false, whenOff: 'Sales cannot be attached to a customer.' },
  { id: 'giftCards', label: 'Gift cards', blurb: 'Selling, checking, charging and refunding gift cards.', required: false, whenOff: 'Gift cards cannot be sold or accepted.' },
  { id: 'cardTerminal', label: 'Connected terminal', blurb: 'Card payments and refunds on a card reader.', required: false, whenOff: 'Cash and gift cards only.' },
  { id: 'tapToPay', label: 'Tap to Pay on iPhone', blurb: 'Card payments on the phone itself.', required: false, whenOff: 'No card payments on the phone.' },
];
export const ELEMENT_IDS: ElementId[] = ELEMENTS.map(e => e.id);
export const REQUIRED_ELEMENTS: ElementId[] = ELEMENTS.filter(e => e.required).map(e => e.id);
export const elementInfo = (id: ElementId): ElementInfo => ELEMENTS.find(e => e.id === id)!;
