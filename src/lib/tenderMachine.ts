// Location: src/lib/tenderMachine.ts
// B1g: the porting point for the automatic cash tender machine (the Raspberry Pi drawer that counts what goes in and pays out what it is asked).
// The hardware does not exist yet, so this is deliberately one empty function and nothing else. Today the cashier enters, confirms and takes out
// the notes and coins by hand (see src/screens/CashSheet.tsx); nothing in the app calls this function.
//
// To build it later:
//  1. Fill in `tenderMachine` below (planned: a WebSocket to the Pi, one POS connected at a time, because there is a single machine).
//  2. Make `TENDER_MACHINE_READY` true, and turn the Settings ▸ Payments toggle into a real setting (it is a locked, greyed-out switch today).
//  3. Call it from the cash sheet: `accept` when taking cash (the machine reports the notes and coins it counted), `dispense` for change and
//     cash refunds (the machine pays out the counts the app asks for), then write the ledger exactly as the manual flow does (`postCashSale`).
import type { Counts } from './cashLedger';

/** What the app would ask the machine to do. Counts are cents → how many, the same shape as the drawer ledger. */
export type TenderMachineRequest = { op: 'accept'; dueCents: number } | { op: 'dispense'; counts: Counts };

/** False until the machine exists. The Settings switch reads this and stays locked Off while it is false. */
export const TENDER_MACHINE_READY = false;

/** The porting point. Intentionally empty. */
export async function tenderMachine(_request: TenderMachineRequest): Promise<void> {}
