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

## The model, if one is ever used

Requirement, from the owner: any model the assistant uses must be **free forever** and have a
**validated zero retention policy**. An **on-device or local network model is preferred**.

Finding on 15 October 2026 (from OpenRouter's own provider table at
`https://openrouter.ai/api/frontend/v1/all-providers` and the endpoints for each free model):

- Every free model on OpenRouter is served by a first party lab, and each of those labs retains prompts on
  its free endpoint. Examples: Google AI Studio keeps prompts 55 days, Cohere 30 days, Thinking Machines
  and Liquid train on them, Poolside and AtlasCloud retain them.
- So there is **no** OpenRouter free model that meets both "free forever" and "validated zero retention"
  today. A hosted option that fails the retention test is not used.

Decision:

- **Use a local model.** Run a model through Ollama (or another local server) on the same machine or
  the local network. This is free forever and zero retention by construction, because the text never leaves
  the machine. Any current instruction tuned model will do; the vendored checker needs no model at all, so a
  local model is only for rewriting prose by hand when wanted.
- **No hosted fallback.** If a local model is not available, do the rewrite by hand with the vendored
  checker. Do not send repo text to a paid or free hosted endpoint that retains prompts.

If a hosted model is used later, it must be re-checked against the provider table above and must route with
`provider: { data_collection: "deny" }` so only zero retention providers are used. Record the exact model id
here before use.