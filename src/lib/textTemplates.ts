// Location: src/lib/textTemplates.ts
// Text templates for warning messages: `{{ item.name }}` is replaced by whatever that name stands for, so one warning
// can name the item it is about instead of being written out for each one. Pure - no store, no network, no clock - and
// unit-tested in tests/texttemplates.test.ts.
//
// A token is `{{ name }}`. Spaces around the name are optional and the name is matched ignoring case, so `{{item.name}}`
// and `{{ Item.Name }}` are the same token. A name nothing was given for is left in the message exactly as it was
// written, so a typo shows up in the text rather than quietly disappearing.
const TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** The values a message can put in `{{ … }}`, keyed by lower-case name. */
export type TemplateVars = Record<string, string | number>;

/** The names of the tokens in a piece of text, lower case, in the order they appear. */
export function templateTokens(text: string): string[] {
  const out: string[] = []; const re = new RegExp(TOKEN.source, 'g'); let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1].trim().toLowerCase());
  return out;
}

/** Replace each `{{ name }}` with `vars[name]`. A name with no value is left as written. */
export function renderTemplate(text: string, vars: TemplateVars): string {
  if (!text) return '';
  return text.replace(new RegExp(TOKEN.source, 'g'), (whole: string, raw: string) => {
    const v = vars[raw.trim().toLowerCase()];
    return v === undefined || v === null ? whole : String(v);
  });
}

/** What each name stands for, in the order the help is shown in Settings. */
export const TEMPLATE_HINTS: { name: string; what: string }[] = [
  { name: 'item.name', what: 'the item that set it off, with its variation' },
  { name: 'item.product', what: "the item's product name" },
  { name: 'item.variant', what: "the item's variation (blank when there is one)" },
  { name: 'item.sku', what: "the item's SKU" },
  { name: 'item.price', what: 'the price it is selling for' },
  { name: 'qty', what: 'how many of it were in the sale' },
  { name: 'cart.total', what: 'the total of the sale' },
  { name: 'staff', what: 'who is on the till' },
  { name: 'register', what: "this register's name" },
  { name: 'time', what: 'the time of the sale' },
  { name: 'date', what: 'the date of the sale' },
];
