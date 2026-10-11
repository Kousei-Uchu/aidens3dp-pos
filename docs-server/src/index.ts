import bundle from '../../help/help.json';

const etag = `"${bundle.version}"`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
      etag,
      'x-content-type-options': 'nosniff',
      'access-control-allow-origin': '*',
    },
  });
}

function pageHTML(nonce: string): string {
  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Help for the Shopify Zeller POS register.">
  <title>POS Help</title>
  <style>
    :root{font:16px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17202a;background:#f4f6f8}
    *{box-sizing:border-box}body{margin:0}header{height:60px;display:flex;align-items:center;gap:16px;padding:0 22px;background:#fff;border-bottom:1px solid #d9dee4}
    header strong{font-size:20px}header span{color:#68727d;font-size:13px}
    #layout{display:grid;grid-template-columns:minmax(250px,310px) minmax(0,1fr);min-height:calc(100vh - 60px)}
    aside{padding:18px;border-right:1px solid #d9dee4;background:#fff;max-height:calc(100vh - 60px);overflow:auto;position:sticky;top:0}
    input,select{font:inherit;width:100%;padding:10px 12px;border:1px solid #c6cdd5;border-radius:9px;background:#fff}
    #tree{padding:12px 0}#tree ul{list-style:none;margin:0;padding-left:14px}#tree>ul{padding-left:0}
    #tree button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:7px 8px;border-radius:7px;color:#283747;cursor:pointer}
    #tree button:hover,#tree button.active{background:#e9eef5;color:#111;font-weight:650}
    main{max-width:940px;width:100%;margin:0 auto;padding:24px 34px 80px;background:#fff;min-height:calc(100vh - 60px)}
    #crumb{font-size:13px;color:#68727d;margin-bottom:14px}h1{font-size:30px;margin:0 0 8px}#summary{color:#68727d;line-height:1.5;margin:0 0 14px}
    #depth{max-width:240px;margin:8px 0 20px}.content{line-height:1.65}.content h2{font-size:22px;margin-top:30px;border-bottom:1px solid #e6e9ed;padding-bottom:6px}
    .content h3{font-size:18px;margin-top:24px}.content a{color:#1259a7}.content pre{overflow:auto;background:#f3f5f7;padding:14px;border-radius:9px}
    .content code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}.content :not(pre)>code{background:#eef1f4;padding:2px 4px;border-radius:4px}
    .content table{border-collapse:collapse;width:100%;display:block;overflow:auto}.content th,.content td{border:1px solid #d9dee4;padding:7px 9px;text-align:left}.content blockquote{border-left:3px solid #c6cdd5;margin-left:0;padding-left:14px;color:#55616d}
    #status{color:#68727d;font-size:12px;margin-top:10px}.hidden{display:none}
    @media(max-width:760px){header{padding:0 14px}#layout{display:block}aside{position:relative;top:auto;max-height:36vh;border-right:0;border-bottom:1px solid #d9dee4;padding:12px 14px}main{padding:20px 16px 60px;min-height:auto}h1{font-size:26px}}
  </style>
</head>
<body>
  <header><strong>POS Help</strong><span>Shopify Zeller POS</span></header>
  <div id="layout">
    <aside><input id="search" type="search" placeholder="Search help" aria-label="Search help"><div id="tree"></div></aside>
    <main>
      <div id="crumb"></div><h1 id="title">Loading help…</h1><p id="summary"></p>
      <select id="depth" aria-label="Detail level"><option value="basic">Basic</option><option value="deep">Deep</option><option value="advanced">Advanced</option></select>
      <article id="content" class="content"></article><div id="status"></div>
    </main>
  </div>
  <script type="module" nonce="${nonce}">
    import { marked } from 'https://cdn.jsdelivr.net/npm/marked@15.0.7/lib/marked.esm.js';
    import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs';
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad:false, securityLevel:'strict', theme:'neutral' });
    const tree = document.querySelector('#tree');
    const search = document.querySelector('#search');
    const depth = document.querySelector('#depth');
    const title = document.querySelector('#title');
    const summary = document.querySelector('#summary');
    const content = document.querySelector('#content');
    const crumb = document.querySelector('#crumb');
    const status = document.querySelector('#status');
    let pages = [];
    let current = null;
    let version = '';
    const pageById = new Map();
    const allText = p => [p.title,p.summary,...p.tags,p.lead,p.sections.basic,p.sections.deep,p.sections.advanced].join(' ').toLowerCase();
    function wikiLinks(text) {
      let fenced = false;
      const tick = String.fromCharCode(96);
      const inlineCode = new RegExp('(' + tick + '+[^' + tick + ']*' + tick + '+)', 'g');
      const fence = new RegExp('^\\\\s*(' + tick + '{3,}|~{3,})');
      const wiki = /\\[\\[([a-z0-9/-]+)(?:\\|([^\\]]+))?\\]\\]/gi;
      return text.split('\\n').map(line => {
        if (fence.test(line)) { fenced = !fenced; return line; }
        if (fenced) return line;
        return line.split(inlineCode).map(part => part.startsWith(tick) ? part : part.replace(wiki,
          (_, id, label) => '[' + (label || id) + '](#/' + encodeURIComponent(id) + ')')).join('');
      }).join('\\n');
    }
    function renderTree(rows, parent, host) {
      const ul = document.createElement('ul');
      if (parent === 'start') {
        const root = pageById.get('start');
        if (root) {
          const li = document.createElement('li');
          const button = document.createElement('button');
          button.textContent = root.title;
          button.dataset.id = root.id;
          button.onclick = () => show(root.id);
          li.append(button); ul.append(li);
        }
      }
      for (const p of rows.filter(x => x.parent === parent)) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.textContent = p.title;
        button.dataset.id = p.id;
        button.onclick = () => show(p.id);
        li.append(button);
        renderTree(rows, p.id, li);
        ul.append(li);
      }
      if (ul.childElementCount) host.append(ul);
    }
    function renderSearch(q) {
      const words = q.trim().toLowerCase().split(/\\s+/).filter(Boolean);
      tree.replaceChildren();
      if (!words.length) { renderTree(pages, 'start', tree); return; }
      const matches = pages.filter(p => words.every(w => allText(p).includes(w)));
      const ul = document.createElement('ul');
      for (const p of matches.slice(0, 40)) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.textContent = p.title + ' · ' + (p.parent === 'start' ? 'Help' : pageById.get(p.parent)?.title || p.parent);
        button.onclick = () => show(p.id);
        li.append(button); ul.append(li);
      }
      tree.append(ul);
    }
    function toHTML(text) { return marked.parse(wikiLinks(text), { async:false }); }
    async function show(id, updateHash=true) {
      const p = pageById.get(id) || pageById.get('start');
      if (!p) return;
      current = p;
      title.textContent = p.title;
      summary.textContent = p.summary || '';
      const levels = ['basic','deep','advanced'];
      const stop = levels.indexOf(depth.value);
      const sections = levels.slice(0, stop + 1).filter(k => p.sections[k]);
      const source = [p.lead, ...sections.map(k => '## ' + k[0].toUpperCase() + k.slice(1) + '\\n\\n' + p.sections[k])].filter(Boolean).join('\\n\\n');
      content.innerHTML = DOMPurify.sanitize(toHTML(source), { USE_PROFILES: { html:true } });
      for (const code of content.querySelectorAll('pre code.language-mermaid')) {
        const div = document.createElement('div');
        div.className = 'mermaid';
        div.textContent = code.textContent || '';
        code.parentElement.replaceWith(div);
      }
      await mermaid.run({ nodes: content.querySelectorAll('.mermaid') });
      const chain = []; let node = p;
      while (node) { chain.unshift(node.title); node = pageById.get(node.parent); }
      crumb.textContent = chain.join('  ›  ');
      tree.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.id === p.id));
      if (updateHash) history.replaceState(null, '', '#/' + encodeURIComponent(p.id));
      status.textContent = 'Help version ' + version;
    }
    try {
      const response = await fetch('/api/index');
      if (!response.ok) throw new Error('Help could not be loaded.');
      const data = await response.json();
      pages = data.pages;
      version = data.version;
      pages.forEach(p => pageById.set(p.id, p));
      renderTree(pages, 'start', tree);
      const requested = decodeURIComponent(location.hash.slice(2));
      depth.value = localStorage.getItem('pos-help-depth') || 'basic';
      await show(pageById.has(requested) ? requested : 'start', false);
    } catch {
      title.textContent = 'Help is unavailable';
      summary.textContent = 'Check your connection and reload this page.';
    }
    search.addEventListener('input', () => renderSearch(search.value));
    depth.addEventListener('change', () => { localStorage.setItem('pos-help-depth', depth.value); if (current) void show(current.id, false); });
    document.addEventListener('click', event => {
      const a = event.target.closest('a[href^="#/"]');
      if (a) { event.preventDefault(); void show(decodeURIComponent(a.getAttribute('href').slice(2))); }
    });
    window.addEventListener('hashchange', () => void show(decodeURIComponent(location.hash.slice(2)), false));
  </script>
</body>
</html>`;
}

function siteResponse(): Response {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...nonceBytes));
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'public, max-age=60',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  });
  return new Response(pageHTML(nonce), { headers });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'If-None-Match',
      'access-control-max-age': '86400',
    } });
    if (request.method !== 'GET') return new Response('method not allowed', { status: 405, headers: { allow: 'GET' } });
    if (url.pathname === '/') return siteResponse();
    if (url.pathname === '/api/index') {
      if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag } });
      return json(bundle);
    }
    const match = url.pathname.match(/^\/api\/page\/([a-z0-9/-]+)$/);
    if (match) {
      const page = bundle.pages.find(p => p.id === match[1]);
      if (!page) return json({ error: 'page not found' }, 404);
      if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag } });
      return json({ version: bundle.version, page });
    }
    return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};
