// Location: src/lib/helpBuiltin.ts
// The copy of the help pages that ships inside the app (help/help.json, made by `npm run help:build`), so Help works with no internet.
import bundled from '../../help/help.json';
import { buildIndex, readBundle, type HelpIndex, type Page } from './helpDocs';

export type HelpSet = { version: string; pages: Page[]; index: HelpIndex };
/** Turn a bundle (the built-in one, or later a downloaded newer one) into pages plus their index. Null if the bundle is unusable. */
export function helpSetFrom(raw: unknown): HelpSet | null {
  const b = readBundle(raw); if (!b) return null;
  const pages: Page[] = b.pages.map(p => ({ ...p, file: p.id }));
  return { version: b.version, pages, index: buildIndex(pages) };
}
let cached: HelpSet | null | undefined;
export function builtinHelp(): HelpSet {
  if (cached === undefined) cached = helpSetFrom(bundled);
  if (!cached) throw new Error('help/help.json is unreadable. Run: npm run help:build');
  return cached;
}
