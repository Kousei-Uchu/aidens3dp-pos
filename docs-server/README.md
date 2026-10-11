# POS documentation Worker

This Cloudflare Worker serves the same generated help bundle that ships inside the iPad app. It has no database, secrets or user data.

## Develop and deploy

```sh
cd docs-server
npm install
npx wrangler login
npm run dev
npm run deploy
```

`npm run deploy` rebuilds `../help/help.json` first. The Worker prints its `workers.dev` URL after deployment. Custom-domain styling and a dedicated subdomain are tracked separately under E1.

To let the app check for newer help at startup, set `EXPO_PUBLIC_DOCS_URL` to the deployed Worker origin when building the app. Without it, the app always uses its built-in, offline copy.

## Routes

- `GET /` serves the searchable help site with Basic, Deep and Advanced levels, page navigation, and full Mermaid diagrams.
- `GET /api/index` returns the versioned help bundle. The version is also the HTTP `ETag`; send `If-None-Match` to receive `304 Not Modified`.
- `GET /api/page/<id>` returns one page and the bundle version, also with the version `ETag`.

The browser-rendered site sanitises Markdown HTML and runs Mermaid in strict security mode. API responses are read-only and contain only published help text.
