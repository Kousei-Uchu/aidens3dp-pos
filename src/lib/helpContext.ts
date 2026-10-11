export const HELP_ERROR_PAGES = {
  card: 'fix/card-declined',
  reader: 'fix/reader',
  sync: 'fix/offline-sync',
  cashChange: 'fix/cant-make-change',
  stock: 'fix/stock-mismatch',
  scanner: 'fix/keyboard',
  staff: 'fix/locked-out',
} as const;

export function helpForError(title: string, message = ''): string | undefined {
  const text = `${title} ${message}`.toLowerCase();
  if (/card declined|payment status unknown|payment result unknown/.test(text)) return HELP_ERROR_PAGES.card;
  if (/reader|terminal|zeller/.test(text)) return HELP_ERROR_PAGES.reader;
  if (/can't make .*change|cannot make .*change|cash change|drawer change/.test(text)) return HELP_ERROR_PAGES.cashChange;
  if (/stock|inventory|not linked/.test(text)) return HELP_ERROR_PAGES.stock;
  if (/scanner|keyboard|barcode|sku/.test(text)) return HELP_ERROR_PAGES.scanner;
  if (/wrong pin|cashier pass|sign in|staff access|pin/.test(text)) return HELP_ERROR_PAGES.staff;
  if (/price adjustment|adjustment|cannot use that price|cannot use that total/.test(text)) return 'sales/cart-and-prices';
  if (/role|owner/.test(text)) return 'concepts/roles';
  if (/gift card/.test(text)) return /charge|redeem|lookup|balance/.test(text) ? 'pay/gift-card' : 'gift';
  if (/customer/.test(text)) return 'sales/customers';
  if (/receipt/.test(text)) return 'settings/receipts';
  if (/item not found|tile/.test(text)) return 'sales/grid';
  if (/refund/.test(text)) return 'orders/refunds';
  if (/square/.test(text)) return 'orders/square-history';
  if (/report/.test(text)) return 'orders/reports';
  if (/order/.test(text)) return 'orders';
  if (/sync|outbox|upload|shopify|offline|no connection|network|connection/.test(text)) return HELP_ERROR_PAGES.sync;
  return undefined;
}
