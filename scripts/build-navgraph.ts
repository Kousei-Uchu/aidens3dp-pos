// Location: scripts/build-navgraph.ts
// Reads the hand written src/app.navgraph and src/app.navschema, checks them with routegraph, and writes the
// TypeScript mirror React Native bundles (it has no filesystem). Run `npm run graph:build`, or `graph:check` in CI
// to fail when the mirror is out of date.
import fs from 'node:fs';
import path from 'node:path';
import { resolveSchema, indexTreeFromText, type JsonObject } from 'routegraph';

const root = path.resolve(import.meta.dirname, '..');
const graphPath = path.join(root, 'src', 'app.navgraph');
const schemaPath = path.join(root, 'src', 'app.navschema');
const outPath = path.join(root, 'src', 'lib', 'appNavgraph.generated.ts');

const graph = fs.readFileSync(graphPath, 'utf8');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as JsonObject;

// Parse, validate and index. Throws with a line and column on any mistake.
const tree = indexTreeFromText(graph, { schema: resolveSchema(schema), file: 'src/app.navgraph', diagnostics: 'throw' });
const screens = [...tree.screens.values()];
const counts = screens.reduce<Record<string, number>>((m, s) => { const k = String(s.meta.kind ?? 'screen'); m[k] = (m[k] ?? 0) + 1; return m; }, {});

const header = [
  '// Location: src/lib/appNavgraph.generated.ts',
  '// GENERATED from src/app.navgraph and src/app.navschema by scripts/build-navgraph.ts. Do not edit by hand.',
  '// React Native has no filesystem (see routegraph llms.txt), so the graph travels with the app as text and the schema as data.',
  `// Screens: ${screens.length} (${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')}). Edges: ${tree.edges.length}.`,
  '',
].join('\n');

const body = [
  `export const APP_NAVGRAPH: string = ${JSON.stringify(graph)};`,
  '',
  `export const APP_NAVSCHEMA: Record<string, unknown> = ${JSON.stringify(schema)};`,
  '',
].join('\n');

const out = header + body;
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
  if (cur !== out) { console.error('appNavgraph.generated.ts is out of date. Run: npm run graph:build'); process.exit(1); }
  console.log(`navgraph ok: ${screens.length} screens, ${tree.edges.length} edges`);
} else {
  fs.writeFileSync(outPath, out);
  console.log(`wrote ${path.relative(root, outPath)}: ${screens.length} screens, ${tree.edges.length} edges (${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')})`);
}
