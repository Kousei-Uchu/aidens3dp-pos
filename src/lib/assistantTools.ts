// Location: src/lib/assistantTools.ts
// Implements the assistant's built‑in tools used for searching the help documentation, the navigation graph and providing link / guidance paths.

import { searchPages, Page, Depth } from './helpDocs';
import { APP_NAVGRAPH, SCREEN } from './appNavgraph.generated';

/** Extracts a list of screen identifiers from the navigation graph.
 *  The graph is represented as a string with lines like `SCREEN tab_checkout "Checkout" { ... }`.
 *  We parse only the `SCREEN` keyword and the id.
 */
export function extractScreensFromNavgraph(graphText: string): string[] {
  const res: string[] = [];
  const re = /^SCREEN\s+(\S+)\s+/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(graphText)) !== null) {
    res.push(m[1]);
  }
  return res;
}

/** Tool: searchDocs
 *  Searches the help documentation for a user query and returns the best matching page titles and a short excerpt.
 *  This is a thin wrapper around helpDocs.searchPages.
 */
export function searchDocs(query: string, depth: Depth = 'advanced'): Page[] {
  const all = searchPages(window.__docsPages ?? [], query, depth); // window.__docsPages will be set by the app entry point
  return all.map(r => r.page);
}

/** Tool: searchNavgraph
 *  Returns a list of screen ids whose title or id contains the query (case‑insensitive).
 */
export function searchNavgraph(query: string): string[] {
  const screens = extractScreensFromNavgraph(APP_NAVGRAPH);
  const q = query.toLowerCase();
  return screens.filter(id => id.toLowerCase().includes(q));
}

/** Tool: linkHelp
 *  Given a screen id, returns the navigation path from the current screen to that one.
 *  For now this just returns the target id; a full path resolver would need the runtime graph.
 */
export function linkHelp(target: string): string {
  // placeholder: in the full app the routing logic would be here.
  return target;
}

/** Tool: guide
 *  Provides a short description for a given screen or object.
 */
export function guide(node: string): string {
  return `Help for ${node}`;
}

export type ToolName = 'searchDocs' | 'searchNavgraph' | 'linkHelp' | 'guide';
export type ToolFunction = (...args: any[]) => any;
export const TOOLS: Record<ToolName, ToolFunction> = {
  searchDocs,
  searchNavgraph,
  linkHelp,
  guide,
};
