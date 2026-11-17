// Location: tests/alloyboundaries.test.ts
// 0250: the structure and import rules of dev_docs/ALLOYS.md, checked over the real src/ folder and over made-up folders that break them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { alloyOf, checkAlloys, importsOf, resolveImport } from '../src/alloykit/boundaries';

const ROOT = path.resolve(__dirname, '..');
function walk(dir: string, out: Record<string, string>) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out); else if (/\.(ts|tsx)$/.test(e.name)) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  }
}
const real = (): Record<string, string> => { const f: Record<string, string> = {}; walk('src', f); f['App.tsx'] = fs.readFileSync(path.join(ROOT, 'App.tsx'), 'utf8'); return f; };
const ALLOY = "import type { Alloy } from '../alloykit/types';\nconst alloy = {} as Alloy;\nexport default alloy;\n";
const ALLOY_B = "import type { Alloy } from '../../alloykit/types';\nconst alloy = {} as Alloy;\nexport default alloy;\n";
const rules = (f: Record<string, string>) => checkAlloys(f).map(v => v.rule);

test('the real src/ folder obeys every rule', () => { assert.deepEqual(checkAlloys(real()), []); });

test('imports are read and resolved', () => {
  assert.deepEqual(importsOf("import a from './a';\nimport type { B } from \"../b\";\nconst c = require('c');\nconst d = await import('./d');\nexport * from './e';"), ['./a', '../b', 'c', './d', './e']);
  assert.equal(resolveImport('src/alloys/shopify/alloy.ts', '../../alloykit/types'), 'src/alloykit/types');
  assert.equal(resolveImport('src/alloys/shopify/alloy.ts', './catalogue.tsx'), 'src/alloys/shopify/catalogue');
  assert.equal(resolveImport('src/alloys/x.ts', 'react-native'), null);
  assert.equal(alloyOf('src/alloys/shopify/stock.ts'), 'shopify'); assert.equal(alloyOf('src/alloys/tillium.ts'), 'tillium'); assert.equal(alloyOf('src/alloys/index.ts'), null); assert.equal(alloyOf('src/lib/a.ts'), null);
});

test('a well formed Option A and Option B Alloy pass', () => {
  const f = {
    'src/alloys/index.ts': "import tillium from './tillium';\nimport shopify from './shopify/alloy';\nexport const ALLOYS = [tillium, shopify];\n",
    'src/alloys/tillium.ts': ALLOY,
    'src/alloys/shopify/alloy.ts': ALLOY_B + "import { x } from './catalogue';\nimport { toCents } from '../../lib/money';\nimport type { Variant } from '../../lib/types';\n",
    'src/alloys/shopify/catalogue.ts': "import { gql } from './graphql';\nimport { AlloyUserError } from '../../alloykit/errors';\n",
    'src/alloys/shopify/graphql.ts': "import fetch from 'node-fetch';\n",
  };
  assert.deepEqual(checkAlloys(f), []);
});

test('structure: stray files, a folder with no alloy.ts, both shapes at once, no default export', () => {
  assert.ok(rules({ 'src/alloys/index.ts': '', 'src/alloys/helpers.tsx': '' }).includes('structure'));
  assert.ok(rules({ 'src/alloys/index.ts': '', 'src/alloys/zeller/terminal.ts': '' }).includes('structure'));
  assert.ok(rules({ 'src/alloys/index.ts': "import a from './a';\nimport b from './a/alloy';", 'src/alloys/a.ts': ALLOY, 'src/alloys/a/alloy.ts': ALLOY_B }).includes('structure'));
  assert.ok(rules({ 'src/alloys/index.ts': "import a from './a';", 'src/alloys/a.ts': 'export const alloy = {};' }).includes('structure'));
});

test('registry: every Alloy is listed, and the registry must exist', () => {
  assert.ok(rules({ 'src/alloys/index.ts': 'export const ALLOYS = [];', 'src/alloys/a.ts': ALLOY }).includes('registry'));
  assert.ok(rules({ 'src/alloys/a.ts': ALLOY }).includes('registry'));
});

test('an Alloy may not import the app, another Alloy, or lib beyond types and money', () => {
  const base = { 'src/alloys/index.ts': "import a from './a';\nimport b from './b';", 'src/alloys/a.ts': ALLOY, 'src/alloys/b.ts': ALLOY };
  for (const bad of ["import { s } from '../state/store';", "import { sync } from '../lib/sync';", "import b from './b';", "import { host } from '../alloyhost/router';", "import { Row } from '../ui/kit';"]) {
    assert.ok(rules({ ...base, 'src/alloys/a.ts': ALLOY + bad }).includes('alloy-imports'), bad);
  }
  assert.deepEqual(checkAlloys({ ...base, 'src/alloys/a.ts': ALLOY + "import { toCents } from '../lib/money';\nimport type { Variant } from '../lib/types';\nimport z from 'zod';" }), []);
});

test('only the registry reaches Alloy files; the kit stays below the app', () => {
  const base = { 'src/alloys/index.ts': "import a from './a';", 'src/alloys/a.ts': ALLOY };
  assert.ok(rules({ ...base, 'src/screens/Settings.tsx': "import a from '../alloys/a';" }).includes('registry-only'));
  assert.ok(rules({ ...base, 'src/lib/sync.ts': "import a from '../alloys/shopify/alloy';" }).includes('registry-only'));
  assert.deepEqual(checkAlloys({ ...base, 'src/screens/Settings.tsx': "import { ALLOYS } from '../alloys';\nimport { ALLOYS as B } from '../alloys/index';" }), []);
  assert.ok(rules({ ...base, 'src/alloykit/x.ts': "import { s } from '../state/store';" }).includes('kit-imports'));
  assert.ok(rules({ ...base, 'src/alloykit/x.ts': "import { r } from '../alloyhost/router';" }).includes('kit-imports'));
});
