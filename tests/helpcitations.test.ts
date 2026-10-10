// Location: tests/helpcitations.test.ts
// B7: help pages name real files and functions. If code is renamed or deleted, this fails and says which page to update.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadPages } from '../scripts/build-help';

const ROOT = path.resolve(__dirname, '..');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out); else if (/\.(ts|tsx|js)$/.test(e.name)) out.push(rel);
  }
  return out;
};
const code = [...walk('src'), ...walk('tests'), ...walk('scripts'), 'App.tsx'];
const corpus = code.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const baseNames = new Set(code.map(f => path.basename(f)));
/** Words that are fine to name in a page even though they are not code in this repo. Keep this short, and say why. */
const ALLOW = new Set<string>([
  'inventoryAdjustQuantities', 'orderCreate', // Shopify API names, called inside template strings
]);

test('every file and function a page names in `backticks` exists in the code', () => {
  const missing: string[] = [];
  for (const p of loadPages().pages) {
    const text = [p.lead, p.sections.basic, p.sections.deep, p.sections.advanced].join('\n').replace(/```[\s\S]*?```/g, '');
    for (const m of new Set([...text.matchAll(/`([^`\n]+)`/g)].map(x => x[1].trim()))) {
      if (ALLOW.has(m)) continue;
      if (/^(src|tests|scripts|help)\/[\w./-]+\.\w+$/.test(m)) { if (!fs.existsSync(path.join(ROOT, m))) missing.push(`${p.id}: file ${m}`); continue; }
      if (/^[A-Za-z][\w]*\.tsx?$/.test(m)) { if (!baseNames.has(m)) missing.push(`${p.id}: file name ${m}`); continue; }
      if (/^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/.test(m) || /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*[A-Z]?[A-Za-z0-9]*$/.test(m) && m.length > 4) { if (!corpus.includes(m)) missing.push(`${p.id}: name ${m}`); }
    }
  }
  assert.deepEqual(missing, [], 'A help page names something that is not in the code any more. Update the page (or, for an outside name, add it to ALLOW with a reason).');
});
