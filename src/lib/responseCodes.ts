// responseCode → cashier UX map (research doc §6.7). Unknown codes fall back to the SDK's responseText.
export type Category =
  | 'APPROVED'
  | 'DECLINED_TRY_OTHER_CARD'
  | 'DECLINED_CUSTOMER_ACTION'
  | 'CANCELLED'
  | 'TIMEOUT_UNKNOWN'
  | 'SYSTEM_RETRY'
  | 'MERCHANT_CONTACT_ZELLER';

export type CodeInfo = { category: Category; message: string; retryable: boolean; unknownOutcome: boolean };

const C = (category: Category, message: string, o: Partial<CodeInfo> = {}): CodeInfo => ({
  category, message, retryable: category !== 'MERCHANT_CONTACT_ZELLER', unknownOutcome: category === 'TIMEOUT_UNKNOWN', ...o,
});
const OTHER = (m: string) => C('DECLINED_TRY_OTHER_CARD', m);
const CUST = (m: string) => C('DECLINED_CUSTOMER_ACTION', m);

export const RESPONSE_CODES: Record<string, CodeInfo> = {
  // insufficient funds
  '51': OTHER('Insufficient funds — try another card or split with another tender.'),
  '1009': OTHER('Insufficient funds — try another card or split with another tender.'),
  // terminal-side Q*
  Q1: C('CANCELLED', 'Cancelled on the terminal.'),
  Q2: C('CANCELLED', 'Customer took too long — try again.'),
  Q3: OTHER('Card refused (Visa contactless stand-in). Try another card.'),
  Q4: OTHER('Card refused (stand-in). Try another card.'),
  Q5: OTHER('Card refused (stand-in). Try another card.'),
  Q6: OTHER('Card refused (stand-in). Try another card.'),
  Q7: CUST('Signature not valid — try again.'),
  Q8: C('SYSTEM_RETRY', 'Terminal connectivity problem — check Wi‑Fi and try again.', { unknownOutcome: true }),
  Q9: C('SYSTEM_RETRY', 'Terminal is busy — wait a moment and try again.'),
  QA: C('TIMEOUT_UNKNOWN', 'Could not read the bank’s response — checking payment status.'),
  QB: OTHER('Card declined or locked. Try another card.'),
  QC: C('SYSTEM_RETRY', 'Terminal stand-in is disabled — try again.'),
  QD: OTHER('Card blocked. Try another card.'),
  QE: OTHER('Card not supported. Try another card.'),
  QF: CUST('Card read failed — tap, insert or swipe again.'),
  QG: CUST('Please insert the card.'),
  QH: C('TIMEOUT_UNKNOWN', 'A reversal is pending — checking payment status.'),
  QI: C('SYSTEM_RETRY', 'Terminal internal error — try again.'),
  QJ: C('SYSTEM_RETRY', 'Zeller backend error — try again.'),
  // deprecated
  P2: OTHER('Card declined. Try another card.'),
  P3: C('CANCELLED', 'Cancelled on the terminal.'),
  P4: C('SYSTEM_RETRY', 'Terminal error — try again.'),
  P5: C('CANCELLED', 'Customer took too long — try again.'),
  // issuer ISO-8583
  '1': OTHER('Bank asks to be contacted — try another card.'),
  '2': OTHER('Bank asks to be contacted — try another card.'),
  '3': C('MERCHANT_CONTACT_ZELLER', 'Invalid merchant — contact Zeller.'),
  '6': C('SYSTEM_RETRY', 'Bank error — try again.'),
  '7': OTHER('Card declined (pick up). Try another card.'),
  '8': CUST('Signature required — try again.'),
  '9': C('SYSTEM_RETRY', 'Request in progress — terminal busy.'),
  '12': OTHER('Transaction not allowed. Try another card.'),
  '13': OTHER('Invalid amount.'),
  '14': OTHER('Invalid card number. Try another card.'),
  '15': OTHER('Card issuer unknown. Try another card.'),
  '17': C('CANCELLED', 'Customer cancelled.'),
  '18': OTHER('Declined. Try another card.'),
  '19': CUST('Please re-enter / try again.'),
  '33': OTHER('Card expired. Try another card.'),
  '54': OTHER('Card expired. Try another card.'),
  '41': OTHER('Card reported lost. Try another card.'),
  '43': OTHER('Card reported stolen. Try another card.'),
  '52': OTHER('No cheque account on this card. Try another account/card.'),
  '53': OTHER('No savings account on this card. Try another account/card.'),
  '55': CUST('Incorrect PIN — try again.'),
  '56': OTHER('Card not recognised. Try another card.'),
  '57': CUST('Not permitted for this card — insert the card and choose an account.'),
  '58': C('MERCHANT_CONTACT_ZELLER', 'Not permitted for this terminal — contact Zeller.'),
  '59': OTHER('Suspected fraud — declined. Try another card.'),
  '61': OTHER('Over the card limit. Try another card or split.'),
  '62': OTHER('Restricted card. Try another card.'),
  '63': OTHER('Security violation. Try another card.'),
  '65': CUST('Please insert the card and try again.'),
  '75': OTHER('PIN tries exceeded. Try another card.'),
  '91': C('SYSTEM_RETRY', 'Bank is unavailable — try again or use another card.'),
  '92': C('SYSTEM_RETRY', 'Routing error — try again.'),
  '96': C('SYSTEM_RETRY', 'System malfunction — try again.'),
  '98': C('MERCHANT_CONTACT_ZELLER', 'Invalid MAC — contact Zeller.'),
  '5C': OTHER('Not supported / blocked by issuer. Try another card.'),
  '9G': OTHER('Blocked by cardholder. Try another card.'),
  C2: OTHER('PIN unblock failed. Try another card.'),
  // Zeller codes
  '1000': C('CANCELLED', 'Cancelled.'),
  '1001': C('TIMEOUT_UNKNOWN', 'No response in time — checking payment status.'),
  '1002': OTHER('Card declined. Try another card.'),
  '1003': CUST('Signature mismatch — try again.'),
  '1004': C('TIMEOUT_UNKNOWN', 'Communications failure — checking payment status.'),
  '1005': C('TIMEOUT_UNKNOWN', 'Invalid response — checking payment status.'),
  '1006': C('TIMEOUT_UNKNOWN', 'A pending transaction failed — checking payment status.'),
  '1007': C('SYSTEM_RETRY', 'System error — try again.', { unknownOutcome: true }),
};

export function lookupResponse(code?: string | null, text?: string | null): CodeInfo {
  const hit = code ? RESPONSE_CODES[String(code)] : undefined;
  if (hit) return hit;
  return C('DECLINED_TRY_OTHER_CARD', text?.trim() || (code ? `Declined (code ${code}).` : 'Declined.'));
}
