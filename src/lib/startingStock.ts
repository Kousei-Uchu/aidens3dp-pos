export type StartingStockResult = { ok: true; quantity?: number } | { ok: false; message: string };

export function parseStartingStock(input: string): StartingStockResult {
  const value = input.trim();
  if (!value) return { ok: true };
  if (!/^\d+$/.test(value)) return { ok: false, message: 'Starting stock must be a whole number of zero or more.' };
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity)) return { ok: false, message: 'Starting stock is too large.' };
  return { ok: true, quantity };
}
