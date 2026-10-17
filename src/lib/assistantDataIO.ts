// Location: src/lib/assistantDataIO.ts
// Takes the snapshot the assistant's data tools read (patch 0163). The only file that connects them to the store and to the imported
// Square history on disk; everything the tools do with it is in assistantData.ts. It only reads, so the tools are handed a copy of the
// references they need and nothing that can write. Local data only: nothing here goes to Shopify.
import { useApp } from '../state/store';
import { isTraining } from './trainingGuard';
import { loadSquareRollups } from './squareHistoryIO';
import { parseBundleConfig } from './bundles';
import { localRollupRows, type AssistantData } from './assistantData';
import type { CatalogueView } from './assistantProducts';

/**
 * What the data tools can read right now, or null while the till is on practice data (the assistant is switched off in practice
 * mode, and this is a second lock: practice data must never be described as the shop's). Called when a question is asked.
 */
export async function takeAssistantData(now: number = Date.now()): Promise<AssistantData | null> {
  if (isTraining()) return null;
  const s = useApp.getState();
  let square: Awaited<ReturnType<typeof loadSquareRollups>> = [];
  try { square = await loadSquareRollups(); } catch { square = []; }
  if (isTraining()) return null; // the till can move into practice while the files are read
  let bundles: AssistantData['bundles'] = null;
  try { bundles = s.settings.bundlesJson ? parseBundleConfig(s.settings.bundlesJson).cfg ?? null : null; } catch { bundles = null; }
  return {
    now,
    sales: s.pos.sales, rollups: localRollupRows(s.pos.rollups, s.pos.outbox, square),
    customers: s.data.customers, autos: s.data.autos, presets: s.data.presets, bundles, variants: s.data.variants, collections: s.data.collections,
  };
}

/**
 * The catalogue the offline product and stock lookup reads (patch 0164), or null on practice data. Nothing but the products, categories and
 * deals, taken at once with no files read, because the chat draws it while it renders. It only reads: nothing here can write.
 */
export function takeCatalogue(now: number = Date.now()): CatalogueView | null {
  if (isTraining()) return null;
  const s = useApp.getState();
  let bundles: CatalogueView['bundles'] = null;
  try { bundles = s.settings.bundlesJson ? parseBundleConfig(s.settings.bundlesJson).cfg ?? null : null; } catch { bundles = null; }
  return { now, variants: s.data.variants, collections: s.data.collections, autos: s.data.autos, bundles };
}
