// Location: src/lib/helpTree.ts
// 0092 (device test T8): the nested contents menu in Help. Pure (no React), tested in tests/helptree.test.ts.
// The menu is the page tree (Page.parent → HelpIndex.children) drawn as rows with a depth, where a section's children only show while it is open.
// Opening a page opens every section above it, so the current page is always visible in the menu.
import { ROOT_ID, trail, type HelpIndex } from './helpDocs';

export type TreeRow = { id: string; title: string; depth: number; hasKids: boolean; open: boolean; current: boolean };

/** Sections to start open for `current`: every ancestor, and the page itself when it has children (so its own pages show). The top page is always open. */
export function openFor(idx: HelpIndex, current: string): Set<string> {
  const open = new Set<string>([ROOT_ID]);
  for (const p of trail(idx, current)) if (p.id === current ? (idx.children[p.id]?.length ?? 0) > 0 : true) open.add(p.id);
  return open;
}

/** Opens `id` when closed, closes it when open. Returns a new set; the input is never changed. */
export function toggled(open: ReadonlySet<string>, id: string): Set<string> { const n = new Set(open); if (n.has(id)) n.delete(id); else n.add(id); return n; }

/** The rows to draw, top to bottom: the top page, then its sections, each followed by its pages while open. A broken or looping tree cannot loop forever. */
export function treeRows(idx: HelpIndex, open: ReadonlySet<string>, current: string, maxRows = 2000): TreeRow[] {
  const rows: TreeRow[] = []; const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    const p = idx.byId[id]; if (!p || seen.has(id) || rows.length >= maxRows) return; seen.add(id);
    const kids = idx.children[id] ?? []; const isOpen = open.has(id) && kids.length > 0;
    rows.push({ id, title: id === ROOT_ID ? 'Help home' : p.title, depth, hasKids: kids.length > 0, open: isOpen, current: id === current });
    if (isOpen) for (const k of kids) walk(k, depth + 1);
  };
  if (idx.byId[ROOT_ID]) walk(ROOT_ID, 0); else for (const r of idx.roots) walk(r, 0);
  return rows;
}
