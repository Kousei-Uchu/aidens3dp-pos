// Location: scripts/build-help.ts
// Reads every page in help/, checks them, and writes help/help.json: the one file the app and the docs Worker both read.
//   npm run help:build            write help/help.json (fails, writing nothing, if any page has a problem)
//   npm run help:check            check the pages and that help/help.json is up to date (what `npm test` also does)
import fs from 'node:fs';
import path from 'node:path';
import { makeBundle, parsePage, validatePages, type HelpBundle, type Page, type PageIssue } from '../src/lib/helpDocs';

export const HELP_DIR = path.resolve(__dirname, '..', 'help');
export const BUNDLE_FILE = path.join(HELP_DIR, 'help.json');

/** Every `.md` under help/, as paths relative to it. README.md and files starting with `_` are notes for authors, not pages. */
export function listPageFiles(dir = HELP_DIR): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name.toLowerCase().endsWith('.md') && e.name.toLowerCase() !== 'readme.md' && !e.name.startsWith('_')) out.push(path.relative(dir, path.join(d, e.name)).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out;
}
export function loadPages(dir = HELP_DIR): { pages: Page[]; issues: PageIssue[] } {
  const pages: Page[] = []; const issues: PageIssue[] = [];
  for (const f of listPageFiles(dir)) {
    const r = parsePage(f, fs.readFileSync(path.join(dir, f), 'utf8'));
    if ('page' in r) pages.push(r.page); else issues.push(r.issue);
  }
  return { pages, issues: [...issues, ...validatePages(pages)] };
}
export const serialise = (b: HelpBundle) => JSON.stringify(b, null, 1) + '\n';

function main() {
  const check = process.argv.includes('--check');
  const { pages, issues } = loadPages();
  if (issues.length) {
    console.error(`${issues.length} problem${issues.length === 1 ? '' : 's'} in help/:`);
    for (const i of issues) console.error(`  ${i.file}${i.id ? ` (${i.id})` : ''}: ${i.problem}`);
    process.exit(1);
  }
  const text = serialise(makeBundle(pages));
  if (check) {
    const have = fs.existsSync(BUNDLE_FILE) ? fs.readFileSync(BUNDLE_FILE, 'utf8') : '';
    if (have !== text) { console.error('help/help.json is out of date. Run: npm run help:build'); process.exit(1); }
    console.log(`help OK: ${pages.length} pages, help.json is current.`);
    return;
  }
  fs.writeFileSync(BUNDLE_FILE, text);
  console.log(`Wrote help/help.json: ${pages.length} pages.`);
}
if (require.main === module) main();
