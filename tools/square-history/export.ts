// One-off Square history export. Runs on YOUR PC only; the Square token never leaves it.
//   cd tools/square-history && npm install && npx tsx export.ts
// Pulls orders (sales + refunds), the catalogue (for SKUs/categories) and customers (for names) through the official
// `square` SDK, writes compressed files to ./out, then serves them once on your Wi-Fi behind a random link shown as a QR code.
// It reads from Square only. It never talks to Shopify and never writes to Square.
import { SquareClient, SquareEnvironment } from 'square';
import qrcode from 'qrcode-terminal';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertAll, type CatalogIndex, type SqContext, type SqOrder } from '../../src/lib/squareConvert';
import { buildManifest, packMonths } from '../../src/lib/squareHistory';

const here = dirname(fileURLToPath(import.meta.url)); const OUT = join(here, 'out');
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const flag = (n: string) => process.argv.includes(`--${n}`);

function loadEnv() { // tiny .env reader so the token never has to be typed on the command line
  const p = join(here, '.env'); if (!existsSync(p)) return;
  for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) { const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(l); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
}
loadEnv();
const token = process.env.SQUARE_ACCESS_TOKEN;
if (!token) { console.error('Set SQUARE_ACCESS_TOKEN in tools/square-history/.env (Square Developer Dashboard ▸ your app ▸ Credentials ▸ Production access token).'); process.exit(1); }
const client = new SquareClient({ token, environment: arg('env') === 'sandbox' ? SquareEnvironment.Sandbox : SquareEnvironment.Production });

/** The SDK returns BigInt money; the converter wants plain numbers. */
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
const log = (m: string) => console.log(m);

async function main() {
  const from = arg('from'); const to = arg('to');
  log('Locations…'); const locRes = await client.locations.list();
  const locs = (locRes.locations ?? []).filter(l => l.id); const locations: Record<string, string> = {}; for (const l of locs) locations[l.id as string] = l.name ?? l.id as string;
  log(`  ${locs.map(l => l.name).join(', ')}`);

  log('Catalogue…'); const catalogue: CatalogIndex = { variations: {} }; const cats = new Map<string, string>(); const items = new Map<string, { name: string; cat?: string }>(); const vars: any[] = [];
  for await (const o of await client.catalog.list({ types: 'ITEM,ITEM_VARIATION,CATEGORY' })) {
    const x: any = plain(o);
    if (x.type === 'CATEGORY') cats.set(x.id, x.categoryData?.name ?? '');
    else if (x.type === 'ITEM') items.set(x.id, { name: x.itemData?.name ?? '', cat: x.itemData?.reportingCategory?.id ?? x.itemData?.categories?.[0]?.id ?? x.itemData?.categoryId });
    else if (x.type === 'ITEM_VARIATION') vars.push(x);
  }
  for (const v of vars) { const it = items.get(v.itemVariationData?.itemId); catalogue.variations[v.id] = { sku: v.itemVariationData?.sku || undefined, upc: v.itemVariationData?.upc || undefined, item: it?.name ?? '', variation: v.itemVariationData?.name ?? '', category: it?.cat ? cats.get(it.cat) : undefined }; }
  log(`  ${Object.keys(catalogue.variations).length} variations`);

  log('Customers…'); const customers: SqContext['customers'] = {};
  for await (const c of await client.customers.list({})) { const x: any = plain(c); const name = [x.givenName, x.familyName].filter(Boolean).join(' ') || x.companyName || x.nickname || ''; if (x.id && name) customers[x.id] = { name, email: x.emailAddress || undefined, phone: x.phoneNumber || undefined }; }
  log(`  ${Object.keys(customers).length} customers`);

  log('Orders (30-day windows, so no single request is too large)…');
  const orders = new Map<string, SqOrder>(); const start = from ? new Date(from) : new Date('2013-01-01'); const end = to ? new Date(`${to}T23:59:59Z`) : new Date();
  for (const loc of locs) {
    for (let a = new Date(start); a < end; a = new Date(a.getTime() + 30 * 86400000)) {
      const b = new Date(Math.min(a.getTime() + 30 * 86400000, end.getTime() + 1)); let cursor: string | undefined;
      do {
        const res = await client.orders.search({ locationIds: [loc.id as string], cursor, limit: 500, query: { filter: { stateFilter: { states: ['COMPLETED'] }, dateTimeFilter: { createdAt: { startAt: a.toISOString(), endAt: b.toISOString() } } }, sort: { sortField: 'CREATED_AT', sortOrder: 'ASC' } } });
        for (const o of res.orders ?? []) orders.set(o.id as string, plain(o) as unknown as SqOrder);
        cursor = res.cursor;
      } while (cursor);
    }
    log(`  ${loc.name}: ${orders.size} orders so far`);
  }

  const sales = convertAll([...orders.values()], { catalogue, customers, locations });
  const { files } = packMonths(sales); const manifest = buildManifest(sales, files, Object.values(locations));
  rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
  for (const f of files) writeFileSync(join(OUT, f.name), f.data);
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest));
  const bytes = files.reduce((s, f) => s + f.data.length, 0);
  log(`\nDone: ${manifest.sales} sales + ${manifest.refunds} refunds in ${files.length} monthly files, ${(bytes / 1048576).toFixed(1)} MB compressed.\nFiles are in ${OUT}`);
  if (flag('no-serve')) return;
  serve();
}

function lanIp(): string {
  const all = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i!.address);
  return all.find(a => a.startsWith('192.168.')) ?? all.find(a => /^10\./.test(a)) ?? all.find(a => /^172\.(1[6-9]|2\d|3[01])\./.test(a)) ?? all[0] ?? 'localhost';
}
function serve() {
  const key = randomBytes(8).toString('hex'); const port = Number(arg('port') ?? 8787); const names = new Set(readdirSync(OUT));
  createServer((req, res) => {
    const m = /^\/([a-f0-9]+)\/([A-Za-z0-9._-]+)$/.exec(req.url ?? '');
    if (!m || m[1] !== key || !names.has(m[2])) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': m[2].endsWith('.json') ? 'application/json' : 'application/gzip' }).end(readFileSync(join(OUT, m[2])));
    console.log(`  sent ${m[2]} to ${req.socket.remoteAddress}`);
  }).listen(port, '0.0.0.0', () => {
    const url = `http://${lanIp()}:${port}/${key}/manifest.json`;
    console.log(`\nIn the POS app: Settings ▸ Data ▸ Square history ▸ Scan QR from PC\n${url}\n`);
    qrcode.generate(url, { small: true });
    console.log('\nLeave this running until the app says it is done, then press Ctrl+C.\nNo Wi-Fi route? Copy the files in the out folder to the iPad (AirDrop / Files) and use "Pick files" instead.');
  });
}
main().catch(e => { console.error('\nFailed:', e?.message ?? e); process.exit(1); });
