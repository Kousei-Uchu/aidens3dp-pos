# Writing assistant

How this repo keeps its writing free of AI tells and in Australian English, and which model any
writing helper or the in-app AI assistant chatbot is allowed to use.

## The style rules

The rules come from the `avoid-ai-writing` skill by Conor Bronsdon (MIT). It is vendored into this repo at
`.opencode/skills/avoid-ai-writing/`, so OpenCode loads it as a normal skill and it works offline.
A second vendored skill, `.opencode/skills/ai-writing-detector/`, does the deterministic scan.

Two rules matter most here:

- Use Australian English: colour, organise, cheque, licence (noun), and so on.
- Do not use em dashes or en dashes in editable prose. Rewrite the sentence, or use a comma, a colon or a
  full stop. (Code, data files and third party files are left alone.)

## The checker (offline, no model)

Both checks run on this machine with no network and no model, which is the strongest form of "zero
retention": nothing leaves the laptop.

Scan for em and en dashes:

```sh
node scripts/style-check.mjs
```

Score a file for AI-writing patterns (JSON on stdout, read only):

```sh
node .opencode/skills/ai-writing-detector/scripts/detect.js --file docs/PROGRESS.md --source-mode rendered-markdown
```

`scripts/style-check.mjs` lists dashes by file and line and flags the commonest AI phrasings, so one
command covers the mechanical part of the audit.

## The in-app AI assistant (Help menu chatbot)

A chatbot lives in the Help menu. It answers questions, guides the cashier to the right screen, looks up
Shopify data (products, customers, orders, gift cards), and searches the docs. It is given a set of
read-only tools:

- navgraph search (find a screen by name or purpose)
- docs search (training manuals, specs, checklists)
- Shopify data search (products, variants, customers, orders, gift cards)
- local CSV export (sales history)

The assistant **never** performs actions that modify state: no price changes, no refunds, no cart edits,
no settings changes. It only answers and points.

The assistant must follow the same style rules as the rest of the app (Australian English, no em/en dashes).

The tool list has since grown, and the plan, decisions and patch order are in `docs/AI_ASSISTANT_PLAN.md`. The read-only
rule and the style rules above are unchanged.

Patch 0163 added the shop data tools (sales report, find orders, deals, customers, gift card activity). They read only what is
saved on the till (the spec's "local CSV export" is the same data as the till's own sales records), never ask Shopify live, and
never return a gift card balance, because that lives at Shopify. Every result passes through the data gate first.

Patch 0164 added the product and stock tools (find products, stock levels) and the model-free product and stock lookup in the offline mode. They read the catalogue saved on the till (the spec's "Shopify data search" for products and variants, local only as decided in question 12), and use the till's own stock words and Inventory filters.

## The model

Updated 17 October 2026 (patch 0148). This replaces the earlier "local model only" decision.

**What changed:** the model is a Settings entry (More ▸ Settings ▸ AI assistant), using the OpenAI-compatible API, so
any provider works, Ollama on the shop PC included. No model id is hard-wired. The app can no longer promise zero
retention by construction, because the address is the owner's choice. The promise moves into the app's data rules:
what the model is allowed to see depends on whether the address counts as local.

- **Local or remote.** Local means this device, the private ranges (`10.x.x.x`, `172.16.x.x` to `172.31.x.x`,
  `192.168.x.x`), `127.x.x.x`, `::1`, `localhost` and `.local` names. Everything else, and anything the app cannot
  read, is remote. An Auto / Local / Remote setting (patch 0149) lets the owner force the class either way, so a
  tunnel on a private looking address can be forced remote. The code is
  `classifyEndpoint` in `src/lib/assistantConfig.ts`.
- **Data rules.** Personal data (customer details, emails) and gift card balances go only to a local address. Payment
  information and anything that looks like a key or password never go anywhere. The full table is in
  `docs/AI_ASSISTANT_PLAN.md` section 3.1. The rules are enforced in code by a gate that is built before any tool
  returns shop data (patch 5 in the plan). Until then nothing from the shop is sent: Test connection sends fixed
  test text only.
- **Who can change it.** An owner, or a manager when the team has no owner (the same rule as price adjustment
  permissions). A till with no accounts acts as the owner.
- **The key.** The API key is kept in the iPad's Keychain, never in the settings, the shared settings, any log or
  the chat history. It is part of Backup & transfer, with the other logins, so a restored iPad can reach the same
  model. The address, model name and options travel in the backup too. None of it is shared between registers.
- **The original policy, for a hosted model.** The earlier finding still holds: on 15 October 2026 every free model
  on OpenRouter was served by a first party lab that retains prompts on its free endpoint (examples: Google AI Studio
  55 days, Cohere 30 days, Thinking Machines and Liquid train on them, Poolside and AtlasCloud retain them). If the
  owner points the assistant at a hosted provider, that provider's retention is the owner's responsibility, and the
  data rules above keep personal data off it. A model that is used through OpenRouter should route with
  `provider: { data_collection: "deny" }`.

The vendored style checker needs no model at all. A model is only for the chatbot, or for rewriting prose by hand.
