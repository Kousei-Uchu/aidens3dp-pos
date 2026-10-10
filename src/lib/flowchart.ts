// Location: src/lib/flowchart.ts
// Reads the small Mermaid flowchart subset that help pages use and lays it out in layers (B7b). Pure: the Help screen only draws what this returns.
// Supported: `flowchart TD|TB|LR` (or `graph`), nodes `A[text]` `A{text}` `A(text)`, arrows `A --> B` and `A -->|label| B`, chains `A --> B --> C`,
// statements split by new lines or `;`, `%%` comments. Anything else (subgraph, style, classDef, click, other diagram types) returns null,
// and the screen shows the source as text instead.

export type FlowShape = 'box' | 'decision' | 'round';
export type FlowParsed = { dir: 'TD' | 'LR'; nodes: { id: string; label: string; shape: FlowShape }[]; edges: { from: string; to: string; label?: string }[] };
export type FlowNode = { id: string; shape: FlowShape; lines: string[]; x: number; y: number; w: number; h: number };
export type FlowEdge = { from: string; to: string; label?: string; x1: number; y1: number; x2: number; y2: number; back: boolean };
export type FlowLayout = { width: number; height: number; nodes: FlowNode[]; edges: FlowEdge[] };

const HEADER = /^(flowchart|graph)\s+(TD|TB|LR)\s*$/i;
const UNSUPPORTED = /^(subgraph|end|style|classDef|class|click|linkStyle|direction)\b/;
const NODE = /^([A-Za-z_][\w]*)\s*(?:\[([^\]]*)\]|\{([^}]*)\}|\(([^)]*)\))?$/;
const ARROW = /\s*-->\s*(?:\|([^|]*)\|)?\s*/;

/** Split a line on `;`, but not inside [ ], { } or ( ), so a label can hold one. */
function splitStatements(line: string): string[] {
  const out: string[] = []; let depth = 0, cur = '';
  for (const ch of line) {
    if (ch === '[' || ch === '{' || ch === '(') depth++; else if ((ch === ']' || ch === '}' || ch === ')') && depth > 0) depth--;
    if (ch === ';' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out.map(x => x.trim()).filter(Boolean);
}
export function parseFlowchart(source: string): FlowParsed | null {
  const lines = source.replace(/\r\n?/g, '\n').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  if (!lines.length) return null;
  const head = HEADER.exec(lines[0]); if (!head) return null;
  const dir: 'TD' | 'LR' = head[2].toUpperCase() === 'LR' ? 'LR' : 'TD';
  const nodes = new Map<string, { id: string; label: string; shape: FlowShape }>(); const edges: FlowParsed['edges'] = [];
  const ref = (txt: string): string | null => {
    const m = NODE.exec(txt.trim()); if (!m) return null;
    const id = m[1]; const label = (m[2] ?? m[3] ?? m[4])?.trim().replace(/^"(.*)"$/, '$1');
    const shape: FlowShape = m[3] !== undefined ? 'decision' : m[4] !== undefined ? 'round' : 'box';
    const have = nodes.get(id);
    if (label !== undefined) nodes.set(id, { id, label, shape }); else if (!have) nodes.set(id, { id, label: id, shape: 'box' });
    return id;
  };
  for (const raw of lines.slice(1)) {
    for (const stmt of splitStatements(raw)) {
      if (UNSUPPORTED.test(stmt)) return null;
      const parts = stmt.split(ARROW); // node, label, node, label, node ...
      if (parts.length === 1) { if (ref(parts[0]) === null) return null; continue; }
      let prev: string | null = null;
      for (let k = 0; k < parts.length; k += 2) {
        const id = ref(parts[k]); if (id === null) return null;
        if (prev !== null) { const lab = parts[k - 1]?.trim(); edges.push({ from: prev, to: id, ...(lab ? { label: lab } : {}) }); }
        prev = id;
      }
    }
  }
  return nodes.size ? { dir, nodes: [...nodes.values()], edges } : null;
}

const CHAR_W = 6.6, LINE_H = 15, PAD_X = 12, PAD_Y = 9, MAX_CHARS = 24, GAP_ALONG = 38, GAP_ACROSS = 18;
/** Break a label into lines no longer than `max` characters, at spaces where possible. */
export function wrapLabel(text: string, max = MAX_CHARS): string[] {
  const out: string[] = []; let cur = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!cur) cur = word; else if ((cur + ' ' + word).length <= max) cur += ' ' + word; else { out.push(cur); cur = word; }
    while (cur.length > max + 6) { out.push(cur.slice(0, max)); cur = cur.slice(max); } // an unbreakable path or word
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}

/** Layered layout. Layers follow the longest route from the start nodes (arrows that would loop back are drawn but do not push nodes around). */
export function layoutFlowchart(f: FlowParsed): FlowLayout {
  const ids = f.nodes.map(n => n.id); const idx = new Map(ids.map((id, i) => [id, i]));
  const out = new Map<string, string[]>(ids.map(id => [id, []])); const inn = new Map<string, string[]>(ids.map(id => [id, []]));
  // find back edges with a depth-first walk, so cycles cannot stall the layering
  const state = new Map<string, 0 | 1 | 2>(); const back = new Set<string>(); const key = (a: string, b: string) => `${a}\u0000${b}`;
  const adj = new Map<string, string[]>(ids.map(id => [id, []])); for (const e of f.edges) adj.get(e.from)?.push(e.to);
  const dfs = (u: string) => { state.set(u, 1); for (const v of adj.get(u) ?? []) { const s = state.get(v) ?? 0; if (s === 1) back.add(key(u, v)); else if (s === 0) dfs(v); } state.set(u, 2); };
  const hasIn = new Set(f.edges.filter(e => e.from !== e.to).map(e => e.to));
  for (const id of ids) if (!hasIn.has(id) && !state.get(id)) dfs(id);
  for (const id of ids) if (!state.get(id)) dfs(id);
  for (const e of f.edges) { if (e.from === e.to || back.has(key(e.from, e.to))) continue; out.get(e.from)!.push(e.to); inn.get(e.to)!.push(e.from); }
  // longest-path layers
  const layer = new Map<string, number>(); const visit = (u: string): number => { if (layer.has(u)) return layer.get(u)!; layer.set(u, 0); const l = Math.max(0, ...inn.get(u)!.map(p => visit(p) + 1)); layer.set(u, l); return l; };
  for (const id of ids) visit(id);
  const nLayers = Math.max(...ids.map(id => layer.get(id)!)) + 1;
  const rows: string[][] = Array.from({ length: nLayers }, () => []); for (const id of ids) rows[layer.get(id)!].push(id);
  // order inside each layer: a few passes of the average position of the neighbours (keeps branches from crossing needlessly)
  const pos = new Map<string, number>(); rows.forEach(r => r.forEach((id, i) => pos.set(id, i)));
  const sweep = (down: boolean) => {
    const order = down ? rows.map((_, i) => i).slice(1) : rows.map((_, i) => i).slice(0, -1).reverse();
    for (const li of order) {
      const bary = (id: string) => { const ns = (down ? inn.get(id)! : out.get(id)!).filter(n => layer.get(n) === (down ? li - 1 : li + 1)); return ns.length ? ns.reduce((s, n) => s + pos.get(n)!, 0) / ns.length : pos.get(id)!; };
      rows[li].sort((a, b) => bary(a) - bary(b) || idx.get(a)! - idx.get(b)!); rows[li].forEach((id, i) => pos.set(id, i));
    }
  };
  for (let p = 0; p < 3; p++) { sweep(true); sweep(false); }

  const info = new Map(f.nodes.map(n => { const lines = wrapLabel(n.label); const w = Math.max(70, Math.max(...lines.map(l => l.length)) * CHAR_W + PAD_X * 2) + (n.shape === 'decision' ? 24 : 0); const h = lines.length * LINE_H + PAD_Y * 2 + (n.shape === 'decision' ? 10 : 0); return [n.id, { shape: n.shape, lines, w, h }] as const; }));
  const td = f.dir === 'TD';
  // `across` = the direction nodes in one layer are spread along; `along` = the direction layers stack
  const acrossSize = (id: string) => (td ? info.get(id)!.w : info.get(id)!.h), alongSize = (id: string) => (td ? info.get(id)!.h : info.get(id)!.w);
  const layerAcross = rows.map(r => r.reduce((s, id) => s + acrossSize(id), 0) + GAP_ACROSS * Math.max(0, r.length - 1));
  const layerAlong = rows.map(r => Math.max(...r.map(alongSize)));
  const totalAcross = Math.max(...layerAcross), totalAlong = layerAlong.reduce((s, v) => s + v, 0) + GAP_ALONG * (nLayers - 1);
  const nodes: FlowNode[] = []; const at = new Map<string, FlowNode>(); let along = 0;
  rows.forEach((r, li) => {
    let across = (totalAcross - layerAcross[li]) / 2;
    for (const id of r) {
      const i = info.get(id)!; const a = acrossSize(id), l = alongSize(id); const alongPos = along + (layerAlong[li] - l) / 2;
      const n: FlowNode = { id, shape: i.shape, lines: i.lines, w: i.w, h: i.h, x: td ? across : alongPos, y: td ? alongPos : across };
      nodes.push(n); at.set(id, n); across += a + GAP_ACROSS;
    }
    along += layerAlong[li] + GAP_ALONG;
  });
  const edges: FlowEdge[] = f.edges.map(e => {
    const a = at.get(e.from)!, b = at.get(e.to)!; const isBack = back.has(key(e.from, e.to)) || e.from === e.to;
    // leave from the side facing the target, arrive on the side facing the source
    if (td) { const down = b.y >= a.y; return { ...e, back: isBack, x1: a.x + a.w / 2, y1: down ? a.y + a.h : a.y, x2: b.x + b.w / 2, y2: down ? b.y : b.y + b.h }; }
    const right = b.x >= a.x; return { ...e, back: isBack, x1: right ? a.x + a.w : a.x, y1: a.y + a.h / 2, x2: right ? b.x : b.x + b.w, y2: b.y + b.h / 2 };
  });
  return { width: td ? totalAcross : totalAlong, height: td ? totalAlong : totalAcross, nodes, edges };
}
