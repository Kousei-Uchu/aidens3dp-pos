# POS documentation Worker

This Cloudflare Worker serves the same generated help bundle that ships inside the iPad app. It has no database, secrets or user data.

## Local development

```sh
cd docs-server
npm install
npm run dev
```

Open the local URL printed by Wrangler. The development server reads `../help/help.json`; rebuild it from the repository root after editing Help:

```sh
npm run help:build
npm run help:check
```

The Worker's `typecheck` script is also safe to run locally:

```sh
cd docs-server
npm run typecheck
```

## Prepared production setup (not deployed)

The supplied storefront is `https://aidens3dp.com`; Cloudflare manages the `aidens3dp.com` DNS zone. The local Help site now uses the storefront's dark plum/purple direction and the public shop name. A proposed Docs Help address is **`https://help.aidens3dp.com`**. This is a preparation target, not a published or confirmed hostname.

**Do not run `npm run deploy`, `npx wrangler deploy`, or configure a production custom domain until Help feedback is approved and deployment is explicitly authorized.** The deploy command publishes this Worker to Cloudflare; it is not a dry run. Do not share account tokens or credentials in project files or chat.

When publication is approved:

1. Confirm the Cloudflare account has the active `aidens3dp.com` zone and that `help.aidens3dp.com` is available. Check that the final Help content has passed `npm run help:check`.
2. Sign in locally with `cd docs-server && npx wrangler login`. This stores authentication in the local Wrangler environment; never commit it.
3. From the repository root run `npm run help:build`, then `npm run help:check`. From `docs-server`, run `npm run typecheck`.
4. Review `wrangler.toml` and the account/zone selected by Wrangler. Publish only after explicit approval. The existing `npm run deploy` runs the root Help build via its predeploy lifecycle and then runs `wrangler deploy`.
5. In Cloudflare Workers & Pages, open the `pos-docs` Worker and add the approved custom domain `help.aidens3dp.com` under **Settings → Domains & Routes → Add → Custom domain**. Cloudflare provisions the DNS record for a custom domain; do not add a competing manual record. If the dashboard shows a conflict or asks to change existing DNS, stop and resolve that before continuing.
6. Verify the deployment in a browser and check `GET /`, `GET /api/index`, a known `GET /api/page/<id>`, an unknown page (404), and an `If-None-Match` request (304). Check the rendered diagrams, nested navigation, mobile layout, and guided steps.
7. Only when the site is approved, configure `EXPO_PUBLIC_DOCS_URL=https://help.aidens3dp.com` for a separate app build and verify that built-in Help remains available offline. This build setting does not publish or update the app by itself.

The other gift-card and receipt Workers need separate hostnames and their own setup/verification. Do not assume they can share `help.aidens3dp.com`.

## Publishing updates

After the initial site is approved and live, each Help content update follows this sequence: edit `help/**/*.md`, run the Help build/check, typecheck the Worker, review the diff, and deploy only under the project's release approval. Without `EXPO_PUBLIC_DOCS_URL`, the app continues to use its built-in offline copy.

## Routes

- `GET /` serves the searchable help site with Basic, Deep and Advanced levels, nested page navigation, responsive reading layout, step-by-step guides for ordered instructions, and Mermaid diagrams.
- `GET /api/index` returns the versioned help bundle. The version is also the HTTP `ETag`; send `If-None-Match` to receive `304 Not Modified`.
- `GET /api/page/<id>` returns one page and the bundle version, also with the version `ETag`.

The browser-rendered site sanitises Markdown HTML and runs Mermaid in strict security mode. API responses are read-only and contain only published help text.
