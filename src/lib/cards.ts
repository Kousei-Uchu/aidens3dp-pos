// Location: src/lib/cards.ts
// What we keep and show of a card number: the last four digits, and nothing else. The Zeller SDK only
// ever hands back a masked PAN (for example XXXXXXXXXXXX0000 or 411111******1111), so the last four are
// taken from its digits. The full card number is never read, stored or logged.

/** The last four digits of a masked card number, or '' when there is nothing to take. */
export const cardLast4 = (masked?: string): string => (masked ? masked.replace(/\D/g, '').slice(-4) : '');

/** "•••• 1234" for display, or '' when neither a stored last four nor a masked PAN is present. */
export const maskedLast4 = (masked?: string, last4?: string): string => {
  const l = last4 && last4.replace(/\D/g, '').slice(-4) || cardLast4(masked);
  return l ? `•••• ${l}` : '';
};
