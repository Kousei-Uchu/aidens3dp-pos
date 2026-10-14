// Location: scripts/style-check.mjs
// Offline writing audit (docs/WRITING_ASSISTANT.md). Finds em and en dashes and the most common AI
// phrasings in the repo's own prose, so the F4 tidy up is repeatable. No network, no model.
// Usage: node scripts/style-check.mjs [path ...]   (default: the repo's prose and source)
// Exit code 1 when anything is found, so it can gate a check.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const SKIP = new Set(['node_modules', '.git', 'ios', 'android', 'patches', '.expo', 'dist', 'build', '.opencode', 'coverage']);
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.md', '.json', '.html', '.yml', '.yaml', '.txt']);
const DEFAULT_PATHS = ['.'];

// The commonest AI tells. Deliberately short and whole word, so it stays useful instead of noisy.
const PHRASES = [
  "it's worth noting", 'it is worth noting', 'in conclusion', "in today's", 'delve', 'leverage',
  'seamless', 'robust', 'tapestry', 'realm', 'landscape', 'unlock', 'elevate', 'embark',
  'testament to', 'game-changer', 'cutting-edge', 'paradigm', 'synergy', 'furthermore', 'moreover',
  'navigate the', 'underscore', 'showcase', 'plethora', 'myriad', 'holistic', 'utilise', 'utilize',
];
const phraseRe = new RegExp('\\b(' + PHRASES.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi');
const dashRe = /[\u2013\u2014]/;

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.has(extname(name))) out.push(p);
  }
}

const targets = process.argv.slice(2);
const roots = targets.length ? targets : DEFAULT_PATHS;
const files = [];
for (const r of roots) {
  try {
    if (statSync(r).isDirectory()) walk(r, files);
    else files.push(r);
  } catch { console.error('no such path:', r); process.exit(2); }
}

let dashes = 0, phrases = 0;
for (const f of files) {
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { continue; }
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (dashRe.test(line)) {
      dashes++;
      console.log(`${relative(ROOT, f)}:${i + 1}: dash  ${line.trim().slice(0, 120)}`);
    }
  });
  for (const m of text.matchAll(phraseRe)) {
    phrases++;
    const before = text.slice(0, m.index);
    const line = before.split('\n').length;
    console.log(`${relative(ROOT, f)}:${line}: phrase "${m[0]}"`);
  }
}

console.log(`\n${files.length} files scanned, ${dashes} dash lines, ${phrases} AI phrases`);
process.exit(dashes || phrases ? 1 : 0);
