# Writing an Alloy

The rules every Alloy follows. The plan and the reasons are in `dev_docs/ALLOYS_PLAN.md`. `tests/alloyboundaries.test.ts` (rules in
`src/alloykit/boundaries.ts`) checks the structure and import rules below over the whole of `src/` and fails the build when one is broken.

An **Alloy** is the code specific to one service (Shopify, Zeller, iCloud, Square...) and nothing else. The app does the shared
work. If a piece of code would be needed by every Alloy, it belongs in `src/alloykit/` or `src/alloyhost/`, not in an Alloy.
The aim: adding a service means writing its calls and its mapping, not rebuilding queues, retries, screens or migration.

## 1. Where an Alloy lives

Pick **one** of two shapes. Both export the same thing (`export default alloy`), so the registry treats them the same.

**Option A: one file.** `src/alloys/<id>.ts`, containing all of the Alloy's logic. Use it when the Alloy is about 400 lines
or fewer, has no native code, and covers a few Elements. Example: `src/alloys/tillium.ts`.

**Option B: a folder.** `src/alloys/<id>/`, for a large Alloy. It **must** contain `alloy.ts`, the middle-man: the only
file the app sees, which default-exports the `Alloy` object and wires in the folder's other files (`catalogue.ts`,
`stock.ts`, `orders.ts`, a native bridge and so on). Those files may import each other and the allowed imports in section 3.
Nothing outside the folder imports any file in it except `alloy.ts`, and only `src/alloys/index.ts` does that.

Every Alloy is listed once, in `src/alloys/index.ts`. That file is the only place an Alloy file is imported.

## 2. The format

```ts
import type { Alloy } from '../../alloykit/types';

const alloy: Alloy = {
  id: 'shopify',                 // lowercase, unique, never changes (it is saved in settings and on sales)
  name: 'Shopify', blurb: 'One line for the picker.',
  contract: 1,                   // the Alloy format version; the app refuses a newer one
  settings: [                    // what setup asks for. The app draws the form and keeps secrets in the Keychain.
    { key: 'domain', label: 'Shop domain' },
    { key: 'clientSecret', label: 'Client secret', secret: true },
  ],
  connect: async (ctx) => { /* check the credentials; return which Elements they allow */ },
  elements: {
    catalogue: { api: catalogueApi, needs: ['read_products'], limits: ['No custom fields'] },
    stock:     { api: stockApi },
  },
  host: undefined,               // only for a native SDK that must be mounted (Zeller's reader)
};
export default alloy;
```

- An Element's `api` has the fixed shape for that Element (`alloykit/types.ts`), in the app's canonical types (`Variant`,
  `Collection`, `Customer`, `SaleRecord`). The Alloy maps its service's data to and from them.
- **Optional functions are the feature list.** The picker reads what an Alloy can do from which functions exist, so it
  cannot claim what it does not implement. `limits` is the only free text: plain words, one line each.
- Every function gets a `ctx` from the app: `http`, `secret(key)`, `setting(key)`, `store` (typed local collections),
  `idempotencyKey()` and `log()`. An Alloy never reads globals, the store, the clock or the network directly.
- An Alloy throws `AlloyNetworkError` for connection problems and `AlloyUserError` for a refusal by the service, from
  `alloykit/errors`. The app decides what to show.

## 3. What an Alloy may import

Allowed: its own files; `src/alloykit/*`; the canonical types (`src/lib/types`) and money helpers; npm packages it needs.

Not allowed: `src/alloyhost/*`, screens, the Zustand store, `sync.ts` or anything else in `src/lib/` beyond the types and
money helpers, and **any other Alloy**. If two Alloys need the same code, it moves to `alloykit`.

## 4. What the app does for you (do not rewrite it in an Alloy)

Selection and Off handling, the practice-mode guard (an Alloy is never called with a write in practice mode), readiness
checks, page loops and merging, delta cursors and refresh timing, the outbox, retries and offline handling, once-only
decisions for money (`alloykit/onceOnly`), idempotency keys, credential storage, the setup form, the picker and status,
building a sale from the cart, local stock bookkeeping, id mapping, the Smelter (migration), and the fake HTTP and conformance
suite used in tests.

Because the contracts speak canonical types, migration needs no Alloy-specific code: the Smelter reads with an Alloy's `list`
functions and writes with another's `create` functions. Declare what cannot move in `limits`.

## 5. Tests every Alloy must pass

`alloykit/conformance.ts` runs the same suite against every Element an Alloy declares, using `alloykit/fakes` (a fake HTTP
layer you feed recorded responses, a fake store, a fixed clock). An Alloy is not registered until it passes. It also
checks the Alloy never touches the network or storage except through `ctx`.

## 6. Adding an Alloy: checklist

1. Choose Option A or B and create the file or folder under `src/alloys/`.
2. Fill in `id`, `name`, `blurb`, `settings`, `connect`, and the Elements the service can really do.
3. Map the service's data to the canonical types. Write recorded responses for the fakes.
4. Run the conformance suite and the boundary test.
5. Add it to `src/alloys/index.ts`.
6. Add its permissions (`needs`) and limits so the picker and the Smelter report are honest.
7. Add a device test to `dev_docs/DEVICE_TESTS.md` and a line to `PROGRESS.md`.

## 7. Policy switches in code

`src/alloykit/policy.ts` holds build-time switches. `ALLOY_POLICY.icloudCustomers` (`'allowed'` or `'disabled'`) decides
whether the iCloud Alloy may hold the Customers Element at all. `'disabled'` removes it when Alloys are registered, the
picker never offers it and the router refuses it.
