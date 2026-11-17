// Location: src/alloykit/boundaries.ts
// 0250: the structure and import rules in dev_docs/ALLOYS.md, as a pure function over a map of file path to source text.
// tests/alloyboundaries.test.ts runs it over the real `src/` folder, so a rule broken in a patch fails the build.
// Paths are posix, relative to the repo root (for example `src/alloys/shopify/alloy.ts`).

export type Violation = { file: string; rule: string; detail: string };

const ALLOYS = 'src/alloys/';
const KIT = 'src/alloykit/';
/** What an Alloy may import from the rest of the app: the canonical types and the money helpers, nothing else. */
const LIB_ALLOWED = new Set(['src/lib/types', 'src/lib/money']);

export function importsOf(source: string): string[] {
  const out: string[] = []; const re = /(?:from\s+|import\s+|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g; let m: RegExpExecArray | null;
  while ((m = re.exec(source))) out.push(m[1]);
  return out;
}
/** `../../alloykit/types` from `src/alloys/shopify/alloy.ts` becomes `src/alloykit/types`. Non-relative imports (packages) return null. */
export function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const parts = fromFile.split('/').slice(0, -1);
  for (const p of spec.split('/')) { if (p === '.' || p === '') continue; if (p === '..') parts.pop(); else parts.push(p); }
  return parts.join('/').replace(/\.(tsx?|js)$/, '');
}
const stripIndex = (p: string): string => p.replace(/\/index$/, '');

/** `src/alloys/shopify.ts` and `src/alloys/shopify/alloy.ts` both belong to the Alloy `shopify`; the registry belongs to none. */
export function alloyOf(path: string): string | null {
  if (!path.startsWith(ALLOYS)) return null;
  const rest = path.slice(ALLOYS.length); if (rest === 'index.ts') return null;
  return rest.includes('/') ? rest.split('/')[0] : rest.replace(/\.tsx?$/, '');
}

export function checkAlloys(files: Record<string, string>): Violation[] {
  const v: Violation[] = []; const paths = Object.keys(files).sort();

  // Structure: top level of src/alloys/ is index.ts, <id>.ts (Option A) or <id>/ (Option B, which needs alloy.ts).
  const optionA = new Set<string>(); const optionBDirs = new Set<string>();
  for (const p of paths) {
    if (!p.startsWith(ALLOYS)) continue; const rest = p.slice(ALLOYS.length);
    if (rest.includes('/')) optionBDirs.add(rest.split('/')[0]);
    else if (rest !== 'index.ts') { if (/^[a-z][a-z0-9-]*\.ts$/.test(rest)) optionA.add(rest.replace(/\.ts$/, '')); else v.push({ file: p, rule: 'structure', detail: 'Only index.ts, <id>.ts and <id>/ folders may sit directly in src/alloys/.' }); }
  }
  for (const id of optionBDirs) {
    if (!files[`${ALLOYS}${id}/alloy.ts`]) v.push({ file: `${ALLOYS}${id}/`, rule: 'structure', detail: 'A folder Alloy must contain alloy.ts, the file the app sees.' });
    if (!/^[a-z][a-z0-9-]*$/.test(id)) v.push({ file: `${ALLOYS}${id}/`, rule: 'structure', detail: 'Alloy ids are lowercase letters, digits and hyphens.' });
    if (optionA.has(id)) v.push({ file: `${ALLOYS}${id}`, rule: 'structure', detail: 'An Alloy is either one file or one folder, not both.' });
  }
  const entries = new Map<string, string>(); // id -> entry file
  for (const id of optionA) entries.set(id, `${ALLOYS}${id}.ts`);
  for (const id of optionBDirs) if (files[`${ALLOYS}${id}/alloy.ts`]) entries.set(id, `${ALLOYS}${id}/alloy.ts`);
  for (const [id, entry] of entries) if (!/export\s+default\s+/.test(files[entry])) v.push({ file: entry, rule: 'structure', detail: `The entry file of ${id} must export default the Alloy.` });

  // Registry: every Alloy is imported by src/alloys/index.ts, and nothing else is.
  const reg = files[`${ALLOYS}index.ts`];
  if (reg !== undefined) {
    const imported = new Set(importsOf(reg).map(s => resolveImport(`${ALLOYS}index.ts`, s)).filter((x): x is string => !!x));
    for (const [id, entry] of entries) if (![entry.replace(/\.ts$/, ''), `${ALLOYS}${id}`].some(c => imported.has(c))) v.push({ file: `${ALLOYS}index.ts`, rule: 'registry', detail: `Alloy ${id} is not listed in the registry.` });
  } else if (entries.size) v.push({ file: `${ALLOYS}index.ts`, rule: 'registry', detail: 'Alloys exist but src/alloys/index.ts does not.' });

  for (const p of paths) {
    const src = files[p]; const own = alloyOf(p);
    for (const spec of importsOf(src)) {
      const to = resolveImport(p, spec); if (!to) continue; const target = stripIndex(to);

      if (own) { // an Alloy file: its own files, the kit, and the canonical types and money helpers
        const toOwn = alloyOf(`${to}.ts`) === own || alloyOf(`${to}/x.ts`) === own;
        const ok = toOwn || target.startsWith(KIT.slice(0, -1)) || LIB_ALLOWED.has(target);
        if (!ok) v.push({ file: p, rule: 'alloy-imports', detail: `Alloy ${own} imports ${target}. Allowed: its own files, src/alloykit/*, src/lib/types, src/lib/money.` });
      } else if (p.startsWith(KIT)) { // the kit sits below the app and the Alloys
        if (/^src\/(alloyhost|alloys|screens|state|ui)(\/|$)/.test(target) || target === 'App') v.push({ file: p, rule: 'kit-imports', detail: `src/alloykit must not import ${target}.` });
      } else if (p !== `${ALLOYS}index.ts`) { // everything else reaches Alloys only through the registry
        if (target.startsWith('src/alloys/') && target !== 'src/alloys' && target !== 'src/alloys/index') v.push({ file: p, rule: 'registry-only', detail: `Import ${target}: only src/alloys/index.ts may import an Alloy file.` });
      }
    }
  }
  return v;
}
