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
  <meta name="theme-color" content="#13111c">
  <title>POS Help · Aiden’s 3D Printing</title>
  <style>
    @font-face{font-family:"Instrument Sans";font-style:normal;font-weight:400;font-display:swap;src:url("https://www.aidens3dp.com/cdn/fonts/instrument_sans/instrumentsans_n4.db86542ae5e1596dbdb28c279ae6c2086c4c5bfa.woff2") format("woff2")}
    @font-face{font-family:"Instrument Sans";font-style:normal;font-weight:700;font-display:swap;src:url("https://www.aidens3dp.com/cdn/fonts/instrument_sans/instrumentsans_n7.e4ad9032e203f9a0977786c356573ced65a7419a.woff2") format("woff2")}
    :root{font:14px/1.6 "Instrument Sans",sans-serif;color:#efd8c9;background:#13111c;font-synthesis:none;--bg:#13111c;--surface:#1b1924;--surface-raised:#211e29;--fg:#efd8c9;--muted:rgba(239,216,201,.68);--line:rgba(246,237,221,.16);--accent:#fae9dc;--accent-text:#13111c;--highlight:#fb873f;--soft:rgba(246,237,221,.08)}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg)}button,input,select{font:inherit}
    header{height:68px;display:flex;align-items:center;gap:12px;padding:0 26px;background:var(--bg);color:var(--fg);border-bottom:1px solid var(--line)}
    .brand-mark{display:block;width:36px;height:36px;object-fit:contain}
    header strong{font-size:19px;font-weight:500;letter-spacing:0}header span{color:var(--muted);font-size:13px}
    #layout{display:grid;grid-template-columns:minmax(250px,310px) minmax(0,1fr);min-height:calc(100vh - 68px);max-width:1600px;margin:auto}
    aside{padding:22px 16px;border-right:1px solid var(--line);background:var(--surface);max-height:calc(100vh - 68px);overflow:auto;position:sticky;top:0}
    .nav-heading{margin:0 8px 12px;color:var(--muted);font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}
    input,select{width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:12px;background:rgba(246,237,221,.08);color:var(--fg);outline:none}
    input::placeholder{color:var(--muted)}option{background:var(--surface);color:var(--fg)}
    input:focus,select:focus,button:focus-visible{border-color:var(--accent);box-shadow:0 0 0 3px rgba(250,233,220,.18);outline:none}
    #tree{padding:12px 0}#tree ul{list-style:none;margin:0;padding-left:14px}#tree>ul{padding-left:0}
    #tree button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:8px 10px;border-radius:10px;color:var(--muted);cursor:pointer;line-height:1.4}
    #tree button:hover,#tree button.active{background:var(--soft);color:var(--fg);font-weight:700}
    main{max-width:1020px;width:100%;margin:24px auto;padding:32px 42px 76px;background:var(--surface);border:1px solid var(--line);border-radius:18px;min-height:calc(100vh - 116px)}
    #crumb{font-size:13px;color:var(--muted);margin-bottom:18px}h1{font-size:clamp(30px,4vw,42px);line-height:1.2;letter-spacing:-.025em;font-weight:400;margin:0 0 9px;color:var(--fg)}#summary{color:var(--muted);line-height:1.6;margin:0 0 18px}
    .reader-tools{display:flex;align-items:center;gap:12px;padding:12px;margin:0 0 25px;border:1px solid var(--line);border-radius:14px;background:var(--surface-raised)}
    .reader-tools label{font-size:12px;font-weight:700;color:var(--muted);white-space:nowrap}#depth{max-width:210px;margin:0}
    .content{line-height:1.7;color:var(--fg)}.content h2{font-size:clamp(22px,3vw,30px);line-height:1.3;font-weight:400;margin:34px 0 16px;color:var(--fg);border-bottom:1px solid var(--line);padding-bottom:9px}
    .content h3{font-size:20px;line-height:1.4;font-weight:500;margin-top:26px;color:var(--highlight)}.content a{color:var(--highlight);text-decoration-thickness:1px;text-underline-offset:3px}.content a:hover{color:var(--accent)}
    .content pre{overflow:auto;background:var(--bg);color:var(--fg);padding:14px;border-radius:12px;border:1px solid var(--line)}
    .content code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}.content :not(pre)>code{background:var(--soft);padding:2px 5px;border-radius:5px}
    .content table{border-collapse:collapse;width:100%;display:block;overflow:auto;border-radius:10px}.content th,.content td{border:1px solid var(--line);padding:9px 11px;text-align:left}.content th{background:var(--surface-raised);color:var(--fg)}
    .content blockquote{border-left:4px solid var(--highlight);margin:18px 0;padding:8px 16px;background:var(--surface-raised);color:var(--muted);border-radius:0 10px 10px 0}
    /* screen figures (B7e): a small drawn picture of a screen, pre-rendered into help.json by scripts/build-help.ts */
    .sf{margin:22px 0;border:1px solid var(--line);border-radius:18px;background:var(--surface-raised);padding:16px}
    .sf-frame{max-width:420px;margin:auto;border:1px solid var(--line);border-radius:14px;background:var(--bg);overflow:hidden;font-size:13.5px;line-height:1.45}
    .sf-bar{display:flex;align-items:baseline;gap:9px;padding:10px 12px;background:var(--surface);border-bottom:1px solid var(--line)}
    .sf-title{font-weight:700}.sf-sub{color:var(--muted);font-size:12px}
    .sf-body{padding:12px;display:grid;gap:7px}
    .sf-label-head{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:6px}
    .sf-text{color:var(--muted)}
    .sf-row{display:flex;align-items:center;gap:8px;padding:5px 0}
    .sf-row .sf-label,.sf-input .sf-label{flex:1}.sf-value{font-weight:700}
    .sf-input{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
    .sf-grid{display:flex;gap:8px;flex-wrap:wrap}
    .sf-tile{flex:0 1 calc(33.3% - 8px);min-height:62px;border-radius:12px;background:var(--surface);padding:8px;display:flex;flex-direction:column;justify-content:space-between;gap:4px}
    .sf-tile-label{font-weight:700}.sf-tile-value{color:var(--muted);font-size:11.5px}
    .sf-key{flex:0 1 calc(33.3% - 8px);min-height:42px;border-radius:10px;background:var(--surface);display:grid;place-items:center;font-weight:600;font-size:15px}
    .sf-button{border-radius:100px;padding:9px 14px;text-align:center;background:var(--soft);font-weight:600}
    .sf-primary{background:var(--accent);color:var(--accent-text)}
    .sf-hi{box-shadow:0 0 0 1.5px var(--accent);border-radius:12px;padding:2px 7px}
    .sf-badge{display:inline-grid;place-items:center;min-width:19px;height:19px;padding:0 5px;border-radius:99px;background:var(--accent);color:var(--accent-text);font-size:11.5px;font-weight:700;margin-right:3px}
    .sf-note{max-width:420px;margin:10px auto 0;color:var(--muted);font-size:12.5px;text-align:center}
    .content ol{list-style:none;counter-reset:help-step;margin:16px 0;padding:0;display:grid;gap:10px}.content ol>li{counter-increment:help-step;position:relative;padding:14px 16px 14px 62px;border:1px solid var(--line);border-radius:14px;background:var(--surface-raised)}
    .content ol>li::before{content:counter(help-step);position:absolute;left:16px;top:14px;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--accent);color:var(--accent-text);font-weight:700;font-size:14px}
    .guide-toggle,.guide-nav button{border:0;border-radius:100px;background:var(--accent);color:var(--accent-text);font-weight:600;padding:11px 20px;cursor:pointer;transition:filter .15s ease}
    .guide-toggle{margin:0 0 12px}.guide-toggle:hover,.guide-nav button:hover:not(:disabled){filter:brightness(.92)}
    .step-guide{padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--surface-raised);margin:0 0 16px}
    .step-guide[hidden]{display:none}.step-guide-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
    .step-label{font-size:13px;font-weight:700;color:var(--highlight)}.step-track{height:6px;background:var(--soft);border-radius:99px;overflow:hidden;margin-bottom:16px}.step-track span{display:block;height:100%;background:var(--highlight);border-radius:inherit;transition:width .2s ease}
    .step-current{padding:16px;border-radius:12px;background:var(--surface);border:1px solid var(--line);min-height:70px}
    .guide-nav{display:flex;justify-content:space-between;gap:10px;margin-top:14px}.guide-nav button:disabled{opacity:.45;cursor:not-allowed}
    #status{color:var(--muted);font-size:12px;margin-top:22px;padding-top:12px;border-top:1px solid var(--line)}
    @media(max-width:760px){header{height:58px;padding:0 15px}header strong{white-space:nowrap}header span:last-child{display:none}#layout{display:flex;flex-direction:column;min-height:calc(100vh - 58px)}aside{position:relative;top:auto;max-height:34vh;min-height:120px;border-right:0;border-bottom:1px solid var(--line);padding:13px 14px}main{width:auto;margin:12px;padding:22px 18px 50px;min-height:auto;border-radius:15px}h1{font-size:30px}.reader-tools{align-items:flex-start;flex-direction:column}.reader-tools label{white-space:normal}#depth{max-width:none}.content ol>li{padding:12px 12px 12px 48px}.content ol>li::before{width:28px;height:28px;left:11px;top:12px}}
  </style>
</head>
<body>
  <header><img class="brand-mark" src="https://www.aidens3dp.com/cdn/shop/files/Untitled_design_1.png?height=108&amp;v=1745546152" alt="Aiden’s 3D Printing"><strong>POS Help</strong><span>Aiden’s 3D Printing · Shopify Zeller POS</span></header>
  <div id="layout">
    <aside><p class="nav-heading">Browse help</p><input id="search" type="search" placeholder="Search 58 guides" aria-label="Search help"><div id="tree"></div></aside>
    <main>
      <div id="crumb"></div><h1 id="title">Loading help…</h1><p id="summary"></p>
      <div class="reader-tools"><label for="depth">How much detail?</label><select id="depth" aria-label="Detail level"><option value="basic">Basic</option><option value="deep">Deep</option><option value="advanced">Advanced</option></select></div>
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
    const searchInput = document.querySelector('#search');
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
    function addStepGuides() {
      let guideNumber = 0;
      for (const list of content.querySelectorAll('ol')) {
        const items = [...list.children].filter(node => node.tagName === 'LI');
        if (items.length < 2) continue;
        const id = 'step-guide-' + guideNumber++;
        const toggle = document.createElement('button');
        toggle.className = 'guide-toggle';
        toggle.type = 'button';
        toggle.textContent = 'Guide me through these steps';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', id);
        const guide = document.createElement('section');
        guide.className = 'step-guide';
        guide.id = id;
        guide.hidden = true;
        guide.setAttribute('aria-label', 'Interactive step-by-step guide');
        const head = document.createElement('div');
        head.className = 'step-guide-head';
        const label = document.createElement('span');
        label.className = 'step-label';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'guide-toggle';
        close.textContent = 'Show all steps';
        head.append(label, close);
        const track = document.createElement('div');
        track.className = 'step-track';
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-label', 'Guide progress');
        track.setAttribute('aria-valuemin', '1');
        track.setAttribute('aria-valuemax', String(items.length));
        const fill = document.createElement('span');
        track.append(fill);
        const currentStep = document.createElement('div');
        currentStep.className = 'step-current';
        currentStep.setAttribute('aria-live', 'polite');
        const nav = document.createElement('div');
        nav.className = 'guide-nav';
        const previous = document.createElement('button');
        previous.type = 'button';
        previous.textContent = 'Previous';
        const next = document.createElement('button');
        next.type = 'button';
        nav.append(previous, next);
        guide.append(head, track, currentStep, nav);
        let index = 0;
        const render = () => {
          label.textContent = 'Step ' + (index + 1) + ' of ' + items.length;
          track.setAttribute('aria-valuenow', String(index + 1));
          fill.style.width = ((index + 1) / items.length * 100) + '%';
          currentStep.replaceChildren(...[...items[index].childNodes].map(node => node.cloneNode(true)));
          previous.disabled = index === 0;
          next.textContent = index === items.length - 1 ? 'Start again' : 'Next step';
        };
        previous.addEventListener('click', () => { index = Math.max(0, index - 1); render(); });
        next.addEventListener('click', () => { index = index === items.length - 1 ? 0 : index + 1; render(); });
        const hideGuide = () => {
          guide.hidden = true;
          list.hidden = false;
          toggle.setAttribute('aria-expanded', 'false');
          toggle.focus();
        };
        close.addEventListener('click', hideGuide);
        toggle.addEventListener('click', () => {
          index = 0;
          render();
          list.hidden = true;
          guide.hidden = false;
          toggle.setAttribute('aria-expanded', 'true');
          guide.scrollIntoView({ block:'nearest', behavior:'smooth' });
          previous.focus();
        });
        list.before(toggle, guide);
      }
    }
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
      // screen figures (B7e): the block's picture is drawn at build time and shipped in help.json, in the same order
      const figs = Array.isArray(p.figures) ? p.figures : [];
      let figAt = 0;
      for (const code of content.querySelectorAll('pre code.language-screen')) {
        const html = figs[figAt++];
        const pre = code.parentElement;
        if (!html || !pre) continue;
        const div = document.createElement('div');
        div.innerHTML = DOMPurify.sanitize(html);
        pre.replaceWith(div);
      }
      await mermaid.run({ nodes: content.querySelectorAll('.mermaid') });
      addStepGuides();
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
      searchInput.placeholder = 'Search ' + pages.length + ' guides';
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
    'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; font-src https://www.aidens3dp.com; connect-src 'self'; img-src 'self' https://www.aidens3dp.com data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
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
