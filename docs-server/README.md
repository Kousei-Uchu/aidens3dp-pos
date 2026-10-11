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

## Production status

The Docs Worker is published at **https://pos-docs.kouseicomms.workers.dev**. The approved custom hostname is **`docs.pos.aidens3dp.com`**, configured as a Wrangler custom domain in `wrangler.toml`. It is not attached yet: deployment failed because the authenticated Cloudflare account does not contain the `aidens3dp.com` zone. No DNS record was created.

The supplied storefront is `https://aidens3dp.com`; the `aidens3dp.com` zone is on Cloudflare. The Help site uses the storefront's dark plum/purple direction and public shop name.

**Publishing a Worker update is a production change.** Obtain approval before future deployments or any additional custom-domain/DNS changes. Do not share account tokens or credentials in project files or chat.

Deployment and domain setup:

1. Review Help changes and pass `npm run help:build`, `npm run help:check`, and `npm run typecheck` in `docs-server`.
2. Sign in locally with `cd docs-server && npx wrangler login` if Wrangler is not already authenticated. Credentials stay in the local Wrangler environment; never commit them.
3. Use a Cloudflare account that has access to the active `aidens3dp.com` zone, then review `wrangler.toml`. The route explicitly names the zone because the chosen hostname is nested.
4. Run `npm run deploy` from `docs-server`; it rebuilds Help and deploys the Worker with the `docs.pos.aidens3dp.com` custom domain from configuration. Cloudflare should provision the DNS record and certificate.
5. Verify both `https://docs.pos.aidens3dp.com` and the `workers.dev` endpoint: `GET /`, `GET /api/index`, a known `GET /api/page/<id>`, an unknown page (404), and an `If-None-Match` request (304). Check rendered diagrams, nested navigation, mobile layout, and guided steps.
6. To enable optional online Help refresh in a separately built app, set `EXPO_PUBLIC_DOCS_URL=https://docs.pos.aidens3dp.com` and verify that built-in Help remains available offline. This does not publish or update the app.

The other gift-card and receipt Workers need separate hostnames and their own setup/verification. Do not reassign `docs.pos.aidens3dp.com` to another Worker.

## Publishing updates

After the initial site is approved and live, each Help content update follows this sequence: edit `help/**/*.md`, run the Help build/check, typecheck the Worker, review the diff, and deploy only under the project's release approval. Without `EXPO_PUBLIC_DOCS_URL`, the app continues to use its built-in offline copy.

## Routes

- `GET /` serves the searchable help site with Basic, Deep and Advanced levels, nested page navigation, responsive reading layout, step-by-step guides for ordered instructions, and Mermaid diagrams.
- `GET /api/index` returns the versioned help bundle. The version is also the HTTP `ETag`; send `If-None-Match` to receive `304 Not Modified`.
- `GET /api/page/<id>` returns one page and the bundle version, also with the version `ETag`.

The browser-rendered site sanitises Markdown HTML and runs Mermaid in strict security mode. API responses are read-only and contain only published help text.
