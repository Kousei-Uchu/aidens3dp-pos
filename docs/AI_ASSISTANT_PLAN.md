# In-app AI assistant: planning document

Repo: `github.com/Kousei-Uchu/aidens3dp-pos` (branch `dev`). Checked against the repo on 18 October 2026.

This document is the starting point for planning the Help menu chatbot. Part 1 is what the repo says today.
Part 2 is what is not built. Part 3 is the decisions, with the owner's answers.
Part 4 is how to work in this repo.

**Revision 23 (18 October 2026), patch 0167:** the screen and register context tool, `screen_context` (3.2 tool 10), the last tool of patch 4 in 3.10. It tells the model which tab or page the person was on when they opened the chat, their role, their display mode and the tabs that mode shows, whether checkout is the guided one, whether practice mode is on and the register's name. The chat screen reads these once, when the question is sent, and the tool only returns that snapshot (`src/lib/assistantContext.ts`, with the tool defined beside the others in `assistantTools.ts`). Decided here, and the owner may want to change any of them: **(1) Where the person is means the page under Help and the chat,** found by skipping those two on the navigation stack, because the chat is itself a page. **(2) A page the graph cannot name is reported as one the till cannot name,** never as the tab under it, and a page the role cannot reach gets exactly the same answer, through the same filter as `search_screens` (3.4). **(3) Windows are not reported.** The chat sits above any window, and the app only tracks open windows in practice mode, where the chat is off. **(4) No ids and nothing personal.** Every field is shop data, and the staff member's name is left out because staff names are customer details (Revision 19). **(5) The display mode is reported by name and by the tabs it shows,** not its text size or its plain-English lines, because the tabs are what change what to tap. **(6) The guides are unchanged and still start from the Checkout tab.** Planning a walk from the current screen, or from a mode that hides rows in More (Minimal), is not done and would be its own patch. **(7) Most people reach the chat through More ▸ Help, so it will usually say they were on the More tab.** A page is only named when Help was opened from that page, for example from a Help button on an error message. Saying which tab they were on before More would need the navigation to remember it, which this patch does not change. The prompt now says fourteen tools. Next: unchanged, patch 8 (cash drawer, calculators and current cart), patch 9 (practice mode coach), or patch 10 (settings reader and app and sync status).

**Revision 22 (18 October 2026), patch 0166:** a small piece of patch 10's neighbourhood, taken early at the owner's request ("next smaller bit"): the date and time tool, `current_time` (3.2 tool 9), in `src/lib/assistantTime.ts`. It returns today's date, the weekday, the time and time zone from the till clock, and the dates this week and this month started and last month began and ended, so a small model never guesses what day it is. Decided here, and the owner may want to change any of them: **(1) It is not a data tool and is not behind the snapshot,** because it holds no shop data. It works even when the snapshot is missing, and in the same places the other tools do (the assistant is blocked in practice mode anyway). **(2) It is a field map of `shop` data,** the category 3.1 gives the date and time. **(3) Weeks start on Monday,** as in the Reports page and `sales_report`. **(4) It reads the iPad's clock and time zone,** not the shop's Shopify time zone, because that is what the cashier sees on the till. Still to come among the tools: screen and register context. Next: unchanged, patch 8 (cash drawer, calculators and current cart, which could be split), or patch 9 (practice mode coach).

**Revision 21 (18 October 2026), patch 0165:** the chat window was tidied and replies are drawn as Markdown (the owner asked). Not a numbered patch in 3.10, and nothing about tools, the gate, roles, history or the log changes. Decided here, and the owner may want to change any of them: **(1) Replies reuse the Help screen's Markdown parser** (`mdBlocks.ts`), after a tidy step (`chatMarkdown.ts`) for what models write that help pages do not: `#` headings, `__bold__`, `_slanted_`, quotes and rules. Strike through is shown as plain text. **(2) No link is tappable in a reply,** whatever the model writes. The prompt already says never to write one, and a made up page id or an outside address behind friendly words must not open anything; the buttons under a reply (patches 0159 and 0162) stay the only way to open a page or screen. **(3) A diagram block is shown as code,** not drawn. **(4) What the user types is still plain text,** and history, the log and what is sent to the model keep the raw text, so only how a reply is drawn changed. Next: unchanged, patch 8 (cash drawer, calculators and current cart), or patch 9 (practice mode coach).

**Revision 20 (18 October 2026), patch 0164:** patch 6 is built: the product and inventory tools, and the model-free product and stock lookup in the offline mode (3.3). Two model-facing tools: `find_products` and `stock_levels`, in `src/lib/assistantProducts.ts`, listed in `assistantDataTools.ts` ahead of the sales tools. They read the catalogue saved on this iPad (`variants`, `collections`, deals), never Shopify live (question 12), and every result goes through the data gate. They reuse the till's own rules (`stockText` and `dealsFor` from `lookup.ts`, and the Inventory list's `filterVariants`, `matchesStock` and `sortVariants`), so the assistant cannot say *low* or *out* differently from the screen. Decided here, and the owner may want to change any of them: **(1) Two tools, not one.** The plan lists inventory levels (5) and product and variant data (6) separately, and *what is low on stock* and *what is this product's SKU and cost* are different questions for a small model; each definition is read on every question, so they stay short. **(2) Stock is as of the last sync**, and the notes say so. **(3) Active and unlisted products only by default**, the same as the Inventory list, with a `status` argument for draft, archived or all. **(4) Product, price, stock, SKU, barcode, deals and categories are shop data; the cost price is costs and profit,** and only appears when `detail` is set. Like Reports, it is shown to every role (0163 decision 8); the Items and Inventory tabs are open to cashiers in the app graph, and no role filter applies. **(5) When only some variations of a product match, only those are shown and there is no total for the product,** so a total never covers more than it says. **(6) *Low* means the Inventory list's low: 2 or fewer, which includes out of stock.** The level is the Inventory default (2) and is not a setting yet. **(7) Offline:** the list gets a PRODUCTS section and a low, out of stock or oversold list. Words that are not part of a name (*how many*, *do we have*, *price*, *stock*) are left out; one or two words must all match, three or more need half. It takes a catalogue snapshot that is null on practice data, so nothing is shown in practice mode, and the data gate does not apply because nothing leaves the device. The offline log line records the product names found. Next: patch 8 (cash drawer, calculators and current cart), or patch 9 (practice mode coach).

**Revision 19 (18 October 2026), patch 0163:** patch 7 is built: the remaining data tools, as five model-facing tools: `sales_report`, `find_orders`, `list_deals`,
`find_customers` and `gift_card_activity`. They read a snapshot of what is saved on this iPad (`src/lib/assistantData.ts`, `assistantDataTools.ts`, `assistantDataIO.ts`), never
Shopify live (question 12), and every result goes through the data gate. Patch 6 (product and inventory) is not built yet and is not needed by patch 7, so 7 went first.
Decided here, and the owner may want to change any of them: **(1) Five tools, not six.** The plan's six areas are sales history, deals, customers, orders, gift cards and report summaries.
Sales history and report summaries are one tool (`sales_report`, which also counts how many of one item sold), and the order tool gives the full order when asked for detail, because every
tool definition is read by the model on every question and the default context is only 8000. **(2) Gift card balances are not available.** A balance lives at Shopify and there is no local copy,
so `gift_card_activity` reports cards sold and payments made with a card from this till's sales, and says to use the Gift cards screen for a balance. The balance category stays in the gate
for when a cached balance exists. **(3) How an order was paid is a payment detail** (never sent), because 3.1 puts tender details there. Takings by payment method in a report are a total, so
they count as shop data, as tool 14 in 3.2 lists them. Card details are never put in a result at all. **(4) Staff names, and what each staff member sold, count as customer details** (personal data).
Customer order counts, spending and notes do too. **(5) No tool matches on a field the model may not read.** A customer is not found by name when names are hidden, an order is not found by
customer name when names are hidden, and a gift card is not found by code when codes are hidden, because a match would tell the model who bought what. When names and emails are both hidden, a
customer search returns an empty list and the privacy note, exactly as for a customer that does not exist. **(6) The gate drops a row whose fields were all hidden** from a list, so the model is
not shown a list of empty rows and told how many there were (a small change to `assistantGate.ts`, with a test). **(7) Scope.** This till's latest 2000 sales and refunds, and the daily totals saved on
this iPad (this till's, sales still in the outbox, and imported Square history). The Reports page also fetches other tills' totals live from Shopify; the assistant does not, and says so in every
report. **(8) Cost and profit are available to every role,** because Reports shows them to every role and Reports, Orders, Customers and Gift cards are open to cashiers in the app graph. On practice
data the snapshot is empty, a second lock behind the practice mode block. Next: patch 6 (product and inventory), or patch 8 (cash drawer, calculators and current cart).

**Revision 18 (18 October 2026), patch 0162:** tool 4 of 4 is built: the guide tool, as the model-facing tool `show_guide`. The plan never defined it, so it is taken to
mean the \"Guide me there\" pointer of question 8, started from a button under a reply: a ring and a small card point at each control to tap, one at a time, from the
Checkout tab, and the card says *You are there* at the end. It never dims the screen or blocks a touch. It is role filtered exactly like `show_link` and `search_screens`
(a screen the role cannot reach gets the same answer as one that does not exist), and `search_screens` marks a hit `can_guide`. Each screen carries a `walk` per role and,
for a view, `arrive` controls. The ring looks at what is on screen a few times a second and points at the last control of the walk that is mounted, so it keeps no state of
its own and picks up someone part of the way. A screen has no walk if a tap has no control or no words, goes into a window or overlay (windows are drawn above the ring), or taps a
control that is not a real spot. Controls fixed: `tab.transactions` and the More rows for Reports, Gift cards, Staff, Settings and Help now have spots. Left without a guide:
Edit item, Training run and the Practice terminal (3.10 item 4 notes why). Not tried on a real iPad (device test T60). Still to come among the tools: screen and register context (so a guide
can start from where the cashier is standing), and date and time.

**Revision 17 (18 October 2026), patch 0161:** patch 5, the data gate (3.1), is built, with the category toggles. No tool returns shop data yet, so
it has nothing to act on until patch 6, but every tool already passes through it. The code is in `src/lib/assistantGate.ts`. Every tool declares a field map
(`gate`) saying which category each field it can return belongs to, or `content` for a tool that returns only help text. The gate runs on every result before
it is cut to size and before the model or the log sees it. A field the map does not name is dropped and reported, and a test helper fails when a tool returns
one. With no policy given the remote rules apply. Three things the plan left open are decided here, and the owner may want to change them: **Always allow on gift
card codes** sends the last four characters, never the whole code, because 3.1 says the code is masked even on a local endpoint; **history** is handled by marking each
reply with the kinds of data it was built from, so a reply that used customer details is left out of the model's history (with its question) once the endpoint
is remote or the toggle is Never allow, since a name in a reply cannot be found by a scrubber; and **typed text and old history keep the full scrubber**, so an email
a cashier pastes is still hidden on a local endpoint, as the owner confirmed in 3.1. The model is told the kind of data that was hidden, never the content. The
scrubber moved to `assistantScrub.ts`. Next: patch 6, the product and inventory tools through the gate.

**Revision 16 (18 October 2026), patch 0160:** the offline mode (3.3) is built, apart from the product and inventory lookup, which waits for the product tools
and the data gate. When the model cannot answer, or is not set up, the chat shows the error banner and a list of matches from the screens and the help pages,
labelled *Model offline, showing search results*, using the same two searches the model's tools use (so the role filter in 3.4 applies). Only the question is stored,
with a marker in place of a reply; the list is searched again each time it is shown, for the role signed in then. The model is never shown a question that only got a list.
Help pages open on tap and screens get the same Open button the link tool makes (3.2 tool 3). The next question tries the model first, and Retry replaces the list. Offline searches are in the audit log as their own kind of line. Not in practice mode, and not after
"More detail". Send works before the model is set up. The tool patches (guide, screen and register context, date and time) are still to come.

**Revision 15 (18 October 2026), patch 0159:** tool 3 of 4 is built: the link tool, as the model-facing tool `show_link`. The plan never said what the link tool
was, so it is taken to mean a tappable button under a reply that opens a help page or a screen. It checks the id with the same role filters as the searches,
the button is saved with the reply (at most 3) and checked again each time it is drawn, and only tabs and plain pages get one (views, windows and pages that
need a cart, an item or a lesson do not). The highlight arrows (\"Guide me there\", question 8) stay with the guide tool. Next: the guide tool.

**Revision 14 (18 October 2026), patch 0158:** tool 2 of 4 is built: the navgraph search, as the model-facing tool `search_screens`. A screen list is built once
from `src/app.navgraph` (`src/lib/assistantScreens.ts`) and filtered by role by walking the graph once per role, so a role is only listed where it can
really get there (Settings has no `roles` on the screen, only on the transition into it, so checking the screen alone would have let a cashier see it).
Each result has a name, what it is for and the taps to open it from the Checkout tab. Screens in the graph gained a `summary` and `keywords`. The result size
limit now holds when a cut result is full of quotes. Next: the link tool (built in 0159), then the guide tool. The current screen is not used as a starting point yet,
because that needs the screen and register context tool.

**Revision 13 (18 October 2026), patch 0157:** patch 4 is split by tool, one patch each, as the owner asked. 0157 is tool 1: the docs
tools (`search_docs`, `read_doc`), the tool runtime and loop, the role header on help pages (`roles:`), and tool calls in the audit log.
Next: the navgraph search tool, then the link tool, then the guide tool. The tool call limit is still a constant (15), not yet a Settings field.

**Revision 12 (17 October 2026), patch 0156:** patch 3 (the audit log) is done. 0152 was the recording half. 0156 is the
viewer half: the manager-only viewer (`src/screens/AssistantLog.tsx`), Export log, Clear log (typed `CLEAR`), the cap
setting (default 200 MB) and `ASSISTANT_OPEN_TO_ALL` is now `true`, so the Help entry shows to everyone (never on the lock
screen). The viewer filters by staff member, date range, errors, practice mode and remote endpoint. Each conversation can be
opened to show what was sent to the model. Export writes every event to one JSONL file through the iPad's Files.

**Revision 11 (17 October 2026), patch 0152:** patch 3 (the audit log) is split in two. 0152 is the recording half: the log
store, the event format, the wiring into the chat and the one-line notice. 0153 is the viewer, Export log, Clear log, the cap
setting and opening the chat to everyone. The owner's answers are in 3.13. The Help entry stays owner and manager only until
0153, because staff would otherwise be told they are logged for a manager who has no way to read the log.

**Revision 10 (17 October 2026), patch 0151:** patch 2 was built: the chat screen and its Help entry (`src/screens/Assistant.tsx`, route
`assistant`), the chat logic in `src/lib/assistantChat.ts`, per-staff history on the device, the error banner, the small
scrubber, the dash filter and the practice mode block, as decided in 3.12. It has no tools, so the model sees only what
the cashier types. Two details worth knowing: the scrubber runs on every endpoint, local or remote, and the cashier's
message is stored already scrubbed, so a pasted card number never reaches the disk; and the Help entry is wired to
`ASSISTANT_OPEN_TO_ALL` in `assistantChat.ts`, which the audit log patch flips to true.

**Revision 9 (17 October 2026), patch 0149:** the owner approved the plan for patch 2 (the chat screen), and the decisions
are recorded here. The "Treat this address as local" switch becomes a three-way Auto / Local / Remote setting (3.1), so an
address can also be forced remote. Four decisions change the order of work: a small scrubber moves forward into the chat
patch, the Help entry shows only to people who may edit assistant settings until the audit log lands, sending is blocked
in practice mode until the coach exists, and the three-way setting gets its own tiny patch (0149) ahead of the chat patch
(0151). See 3.10 and 3.12.

**Revision 8 (17 October 2026), patch 0148:** the plan was checked against the repo and patch 1 was built.
Changes from the check: the latest patch was 0146, not 0143, and a scanner patch took 0147 before patch 1 was finished, so patch 1 is 0148; there are three roles
(cashier, manager, owner), so "manager only" now means the same rule as price adjustment permissions (an owner, or a
manager when the team has no owner); and the assistant settings, including the API key, are part of Backup & transfer
(decided by the owner). Patch 1 (3.10) is done: the Settings page, the OpenAI-compatible client, Test connection,
the local or remote classifier, and the policy docs. Nothing else is built.

**Revision 7 (17 October 2026), final:** the six points in 3.11 are confirmed (all yes), with one change: the manager
can change the context size in Settings. Nothing is left open.

**Revision 6:** all 19 questions answered. New sections: 3.6 audit log, 3.7 practice mode coach, 3.8 limits,
3.9 reply style and language, 3.10 patch order and 3.11 (six small points). Tools 10 to 15 are all accepted.

**Revision 5:** question 7 answered (chat history), the roles reply changed so the model does not know about
restricted things at all (3.4), and new section 3.5 on chat history.

**Revision 4:** question 4 answered (everyone can use it, roles limit what it knows), new section 3.4 on roles.

**Revision 3:** the four points left to confirm in revision 2 are settled, and question 3 (what happens when the
model is unreachable) is answered, see 3.3.

**Revision 2:** owner answers added for the model setup (questions 1 and 2) and for data access (questions 5 and 6).
The tool list has grown. The model decision in 1.3 is now superseded, see 3.1.

## 1. What exists today

### 1.1 Status

Patch 0148 added the Settings page and the connection client, and patch 0151 added the chat screen. There are still no
tools and no data gate. The written spec and model policy are in the files below.

| Where | What it holds |
| --- | --- |
| `docs/WRITING_ASSISTANT.md`, section "The in-app AI assistant (Help menu chatbot)" | The spec of what the chatbot should do |
| `docs/WRITING_ASSISTANT.md`, section "The model" | The model policy as changed in 0148 |
| `docs/GUESSES.md`, section "The writing assistant (style skill and model)" | Repeats the model policy and points to the spec |
| `src/lib/assistantConfig.ts`, `assistantClient.ts`, `assistantKey.ts`, `src/screens/AssistantSettings.tsx` | Patch 0148: settings, address reading, local or remote, the client, the key |

The style checker is not the chatbot. It scans text for AI-sounding writing and for em and en dashes, uses no model,
and is run with `node scripts/style-check.mjs`. It lives in `.opencode/skills/ai-writing-detector/` and
`.opencode/skills/avoid-ai-writing/`. The chatbot has to follow the same style rules in its replies.

### 1.2 The spec (as written in the repo)

A chatbot lives in the Help menu. It answers questions, guides the cashier to the right screen, looks up Shopify
data (products, customers, orders, gift cards), and searches the docs.

It is given read-only tools:

1. Navgraph search: find a screen by name or purpose.
2. Docs search: training manuals, specs, checklists.
3. Shopify data search: products, variants, customers, orders, gift cards.
4. Local CSV export: sales history.

It never performs actions that change state. No price changes, no refunds, no cart edits, no settings changes. It
only answers and points.

It follows the app's style rules: Australian English, no em dashes, no en dashes.

The tool list is extended in 3.2. The read-only rule and the style rules stay as they are.

### 1.3 The model decision (recorded 15 Oct 2026, superseded)

The first decision was a local model only, with no hosted fallback, because every free model on OpenRouter retains
prompts on its free endpoint. The owner then asked for the model to be a setting using the OpenAI-compatible API,
so any provider works, including Ollama. The app can no longer guarantee zero retention by construction, because
the endpoint is the owner's choice. The guarantee moved into the app's data rules (3.1): what the model is allowed
to see depends on whether the endpoint is local. `docs/WRITING_ASSISTANT.md` and `docs/GUESSES.md` were updated in
0148 to say this.

### 1.4 Existing parts the assistant can build on

These are in the repo now and are the likely sources for the tools. Check each in the code before relying on it.

- **Navgraph:** `src/app.navgraph` is the hand-written map of screens and the way between them. It is built into
  `src/lib/appNavgraph.generated.ts` by `npm run graph:build`. `src/lib/appControls.ts` says which screen each
  control (spot) lives on. Screens and edges can carry `roles` (`roleCanReach` in `src/lib/appGraph.ts`), which the
  role filter in 3.4 can reuse. Settings sub pages are not nodes in the graph.
- **Help docs:** Markdown pages under `help/`, each with Basic, Deep and Advanced sections, built into
  `help/help.json` by `npm run help:build`. `src/screens/Help.tsx` is the Help screen. `src/lib/helpRemote.ts` and
  `docs-server/` serve the same pages to the website. `help/README.md` explains the page format. Whether help pages
  carry role information is not yet checked (needed for 3.4).
- **Shopify data:** `src/lib/shopify/catalogue.ts` imports variants, collections and customers. The local catalogue
  is in the app store (`useApp(s => s.data)`), read through `useCatalogue()` in `src/state/selectors.ts`.
  Orders are in `src/lib/shopify/orders.ts` and `orderModel.ts`. Gift cards are in the gift card code.
- **Sales history:** local sales records and the CSV export under Settings > Data. Square history can also be
  imported.
- **Roles:** `Role` is `cashier | manager | owner` (`src/lib/types.ts`). `actingRole()` and `canEditAdjustPerms()` in
  `src/lib/adjustPerms.ts` decide who may do what. A till with no PIN lock acts as the owner.
- **Training:** `src/lib/trainingSandbox.ts` swaps in a practice till. `src/lib/trainingGuard.ts` (`isTraining()`)
  is the one flag that blocks real writes and sends. Hints are a ladder in `src/lib/trainingHints.ts`, and each
  goal in `src/lib/trainingModule.ts` has its own `ladder` and a separate `reveal` spot, so hints and answers look
  separable (to confirm in patch 9).
- **Settings sharing:** `pushSharedSettings` in `src/lib/sync.ts` shares some settings between registers by an
  explicit list. The model address and key are per-register settings and are not on it (a test checks this).
- **Backups:** `src/lib/backupFile.ts` and `backupIO.ts` export the whole settings object and the logins. The
  assistant settings and key travel in them (owner's decision).

## 2. What is not built

Built in 0148: the Settings section and the OpenAI-compatible client with Test connection (3.1), the local or
remote classification, and the policy docs. Built in 0149: the Auto / Local / Remote setting. Built in 0151: the chat
screen and Help entry, per-staff history (3.5), the error banner (3.3, without the offline search), the small scrubber
and the practice mode block (3.12), the dash filter (3.9), the prompt, and the "More detail" button. Built in 0152:
the audit log recording (3.6). Built in 0156: the audit log viewer, Export log, Clear log, the cap setting and opening
the chat to everyone (3.6, 3.13). Built in 0157: the docs tools (`search_docs`, `read_doc`), the tool runtime and loop, and the role header on help pages.
Built in 0158: the screen search tool (`search_screens`) and the role filter for screens.
Built in 0159: the link tool (`show_link`), buttons under a reply that open a help page or a screen.
Built in 0160: the offline mode (3.3), the visible error plus a model-free search of the screens and the help pages.
Built in 0161: the data gate and the category toggles (3.1), in front of every tool result, the history sent to the model and the audit log.
Built in 0163: the sales, order, deal, customer and gift card tools (patch 7), the first tools that return shop data, each with a field map for the gate.
Built in 0164: the product and stock tools (patch 6, `find_products` and `stock_levels`), and the model-free product and stock lookup in the offline mode (3.3).
Built in 0166: the date and time tool (`current_time`). Built in 0167: the screen and register context tool (`screen_context`).

Still to do:

- Role filtering (3.4): a check that removes screens, help pages, tools and data the current role cannot use,
  before anything reaches the model or the screen.
- The read-only tools still to build (3.2): cash drawer, calculators and current cart (patch 8), settings reader and app and sync status (patch 10).
- The practice mode coach (3.7).
- Field maps and `assertNoUnknownFields` tests for every data tool, as each one is added (patches 8 to 10). The gate exists (0161), so no tool may be added without a map.
- The tool parts of the prompt. The base prompt exists (0151), and each role builds its own once tools arrive (3.4).
- A way to keep it from changing anything, enforced in code and not only in the prompt.
- Tests, a help page, a device test and a progress log entry for each later patch.

## 3. Decisions

All 19 questions are answered. Where an answer needed design work, the design is in 3.1 to 3.10. Six small points
that came out of the answers were confirmed in 3.11.

1. **Where does the model run?**
   Answer: wherever the owner points it. It is a Settings entry, not a fixed machine. Examples: Ollama on the shop
   PC over the Wi-Fi, or a hosted provider.
2. **Which model and runtime?**
   Answer: any provider that speaks the OpenAI-compatible API. Settings hold URL, API key, model name and whatever
   else is needed (see 3.1). No model id is hard-wired. Ollama must work.
3. **When the model is unreachable, what should the chat say? Should it still search the docs without a model?**
   Answer: yes, it still searches without a model, and it also shows an error. Details in 3.3.
4. **Who can use it? Does Simple or Minimal mode change it?**
   Answer: everyone can use it. Simple and Minimal modes leave it as it is for now, with shrinking it as a
   possible later change. What each role can ask about is limited by 3.4.
5. **What data may it see?**
   Answer: see the data rules table in 3.1.
6. **Is anything sent to the model that identifies a customer?**
   Answer: only when the endpoint is local, and the owner can override per category (3.1).
7. **Chat history:** kept on the device, kept per staff member, or cleared when the chat closes?
   Answer: kept on the device, kept per staff member, and cleared only manually. Details in 3.5.
8. **"Guide me there":** point with the same highlight arrows training uses, or only say where to tap?
   Answer: say where to tap first, add the highlight arrows in a later patch.
9. **Practice mode:** can it be used during Training? Does it then see only practice data?
   Answer: yes, as a coach that works like the hint button but smarter. It must not hand over the answers and turn
   training into a free ride. Details in 3.7.
10. **Scope of the first patches:**
    Answer: the suggested order was accepted, then adjusted to fit later answers. The current order is in 3.10.
11. **Languages:** English only?
    Answer: English only for the interface and help. The model may reply in the cashier's language, but only if that
    costs essentially no extra work. Details in 3.9.
12. **Shopify data search:** from the local catalogue only, or live queries to Shopify?
    Answer: local catalogue and local order records only.
13. **Anything else it should do or must not do:**
    Answer: nothing else for now.
14. **Proposed tools 10 to 15 in 3.2:**
    Answer: yes to all six. Tools 12 and 15 can come later in the order but are in.
15. **Offline product and inventory lookup:**
    Answer: as early as possible, but not in the very first patches. See 3.3 and 3.10.
16. **Who may change the assistant's settings** (endpoint, key, model, category toggles)?
    Answer: the manager role. Settled in 0148 as the same rule as price adjustment permissions: an owner, or a
    manager when the team has no owner. A till with no accounts acts as the owner. Other roles do not see the row.
17. **Audit view:**
    Answer: yes, and as a full log of every conversation for all users for all time, so every event can be seen.
    Details in 3.6.
18. **Limits:** tool calls per question, context, timeout.
    Answer: many tool calls (unsure whether a limit is needed), as much context as the model allows (unsure how this
    works), 120 seconds. Explained and settled in 3.8.
19. **Reply style:**
    Answer: short by default with a "more detail" option, and the model scales the length to the size of the
    question. Details in 3.9.

### 3.1 Model setup and data rules

**Settings (per register, never synced; built in 0148 except the category toggles):**

- Base URL, for example the shop PC's address and port with `/v1`.
- API key (optional, since Ollama does not need one). Stored in the Keychain only and never shown back in full,
  never logged, never sent to the model, never included in the sync. **It is included in Backup & transfer**, with
  the other logins (owner's decision), so a restored iPad can reach the same model. The address, model name and
  options travel in the backup too.
- Model name.
- Extra options: temperature, request timeout (default 120 seconds), context size and the tool call limit (3.8).
- Only an owner, or a manager when there is no owner, can see or change any of these (see question 16).
- "Test connection": checks the endpoint answers, the model replies, and a trivial tool call works. It sends fixed
  test text and nothing from the shop.
- Endpoint setting with three states: Auto (follow the address), Local, Remote (see below). Built in 0149. Before
  0149 this was a yes or no "treat as local" switch that could only make an address local.

**Local or remote:** the app classifies the endpoint from its host. Local means `localhost`, `127.x.x.x`, `::1`, the
private ranges (`10.x.x.x`, `172.16.x.x` to `172.31.x.x`, `192.168.x.x`) and `.local` names. Everything else is
remote. The setting has three states. **Auto** follows the address. **Local** forces local, for a private network the
rules do not recognise. **Remote** forces remote, for a tunnel or a proxy on an address that looks private but forwards
traffic out of the network. The default is Auto, and the default for an unknown or unreadable host is remote. Settings
saved with the old switch on become Local, and with it off become Auto.

**Data rules (owner's answers):**

| Data | Local endpoint | Remote endpoint |
| --- | --- | --- |
| Customer names, phone numbers, addresses and any other personally identifiable data | Allowed | Never sent |
| Email addresses | Allowed | Never sent |
| Gift card balances | Allowed | Never sent |
| Gift card codes | Last four characters only | Never sent |
| Payment information (card details, tender and terminal details) | Never sent | Never sent |
| Anything that looks like a secret key, token or password | Never sent | Never sent |
| Order totals and line items | Allowed, customer fields removed unless the customer rule allows them | Allowed, customer fields removed |
| Cost prices and profit | Allowed | Allowed |
| Inventory levels, sales history, product and variant data, deals, cash drawer status, date and time | Allowed | Allowed, customer fields removed |

Confirmed by the owner:

- Payment information and secret-key lookalikes are never sent, even to a local endpoint. Emails and other
  personal data are sent only to a local endpoint.
- Gift card codes are masked to the last four characters even on a local endpoint. Balances are local only.

**Per-category override toggles:** each category in the table gets a Settings toggle with three states: Auto
(follow the table above), Always allow, and Never allow. The two "never sent" rows (payment information and
secrets) have no Always allow state. The owner asked for these toggles. Built in 0161 with the gate (patch 5). There are
seven toggles; the two fixed rows are shown in Settings as never sent. Always allow on gift card codes means the last four
characters, because the owner confirmed codes are never sent whole.

**Enforcement in code, not in the prompt:**

- Every tool result passes through one gate before it goes into the request. The gate removes or masks fields by
  category, using the endpoint classification and the toggles.
- A scrubber runs over all text going out, including free text fields such as order notes and customer notes,
  where personal data tends to hide. It masks things that look like email addresses, phone numbers, card numbers
  (digit runs that pass the Luhn check), and keys (long random strings, `sk-` style prefixes, bearer tokens).
- The same scrubber runs over what the cashier types into the chat, so a pasted email or card number never leaves
  the device (confirmed by the owner).
- The gate has its own tests, and a test that fails the build if a tool returns a field the gate does not know
  about.

### 3.2 Tools

**Asked for by the owner:**

1. Navgraph search: find a screen by name or purpose.
2. Docs search: training manuals, specs, checklists.
3. Shopify data search: products, variants, customers, orders, gift cards.
4. Sales history: local sales records, including the CSV export and imported Square history.
5. Inventory levels.
6. Product and variant data.
7. Deals.
8. Cash drawer status and tools (read-only, see the question below).
9. Current date and time.

**Cash drawer (confirmed by the owner):** status only (what the drawer should hold, the float report, change
breakdowns) plus calculators. Opening the drawer, recording a count, or anything that writes is out, because of
the read-only rule.

**Proposed by Claude, all six accepted by the owner (12 and 15 may come later in the order):**

10. Screen and register context: which screen the cashier is on, the display mode, the staff role and whether
    practice mode is on. This is what makes "guide me there" work from where the cashier is standing.
11. Current cart: contents, totals and active warnings, read-only. Lets it answer "why won't this sale go
    through".
12. Settings reader: current values of non-secret settings, read-only. The model key and any other secret is
    excluded in code.
13. Calculators: change breakdown, split payments and float suggestions, using the app's own algorithms and
    returning numbers only. Small models do arithmetic badly, so this stops them guessing.
14. Report summaries: daily totals, top sellers, takings by tender, already added up. Small local models are poor
    at crunching raw sales rows, so a pre-added summary is more reliable than the raw history alone.
15. App and sync status: app version, last sync time, whether the printer and terminal are connected, and a
    scrubbed recent error list. Useful for "something is not working" questions.

**Rules that apply to every tool:**

- Read-only, enforced in code. Tools are plain functions that read state and return data. None is given a
  reference to anything that can write.
- Every result goes through the gate in 3.1.
- In practice mode some tools are switched off or limited to practice data (3.7).
- Every result has a size limit, so a big sales history cannot flood a small model's context.

### 3.3 When the model is unreachable

Owner's answer: still search without a model, and show an error as well.

- **The error is always shown.** A banner at the top of the chat says what went wrong in plain words. The causes to
  tell apart: not set up yet, endpoint unreachable, request timed out, key rejected, model name not found, and the
  model does not support tool calling (these are the error kinds in `assistantClient.ts`). The banner has "Retry"
  and "Open model settings". The text never contains the API key.
- **The chat keeps working as a search.** While the model is down, what the cashier types is run through the
  navgraph search and the docs search, and the results are shown as a list: screens to open and help pages to read.
  The role filter in 3.4 applies to this list too. Each result can be opened, and screens can use "guide me there"
  once question 8 is built. No model text is generated in this mode.
- **It says what it is doing.** The results are labelled something like "Model offline, showing search results", so
  nobody mistakes a list of matches for an answer.
- **It recovers on its own.** The next message retries the model first, and the banner clears when the endpoint
  answers.
- **Product and inventory lookup, with no model (owner wants this early, but not first):** in offline mode the
  search box also looks up products, variants and stock levels from the local catalogue and shows them as a list.
  It reuses the same product and inventory tools the model uses, so there is one implementation. The data never
  leaves the device, so the remote rules in 3.1 do not come into it, but the role filter in 3.4 still does. It comes
  right after those tools exist (3.10).

### 3.4 Roles and permissions

Owner's rule: if a role lacks access to something, the assistant does not guide them to it, does not do it for
them, and does not tell them anything about it.

How that is built, all in code:

- **One permission check.** The assistant reuses whatever the app already uses to decide what a role may open or
  see (`actingRole`, `roleCanReach` and the screens' `roles`). It does not get a second list of its own that could
  drift out of step.
- **The model is only given what the role may use.** Tools the role cannot use are left out of the request
  entirely. The tools that remain return only what the role may see, so there is nothing for the model to leak.
- **Navgraph and docs search are filtered.** Screens the role cannot open do not appear in results, and neither do
  help pages about features it cannot use. This applies to the model's searches and to the offline search in 3.3.
- **The prompt never names restricted things.** The instructions to the model are built per role, so a restricted
  screen or feature is not mentioned in them at all.
- **The model does not know restricted things exist.** Because of the points above, a question about a restricted
  feature gets the same reply as a question about something that does not exist, the standard "I couldn't find
  anything on that" reply used whenever the tools return nothing. There is no separate "you are not allowed"
  message, because that would confirm the thing is there. The prompt must tell the model to answer only from tool
  results, so it does not fill the gap from general knowledge (for example by explaining how refunds usually work).
  Tests should ask restricted questions as a restricted role and check that the reply gives nothing away.
- **Guidance and highlights follow the same filter.** "Guide me there" never points at a screen the role cannot
  open.
- **History follows the staff member, not the register.** Each staff member sees only their own history (3.5). If a
  staff member's role later loses access to something, history that mentions it is hidden or removed.

### 3.5 Chat history

Owner's answer: on the device, per staff member, cleared only manually.

- **Stored on the device only.** It is never part of the sync between registers, never in the shared settings and
  never in an export or backup that leaves the device.
- **One history per staff member.** Switching staff switches to that person's own history.
- **Cleared only by hand.** A "Clear history" button in the chat clears the signed-in staff member's history. There
  is no automatic clearing, and clearing it does not touch the audit log (3.6).
- **The gate runs on the stored history again at send time.** Old messages may hold personal data from a time when
  the endpoint was local. If the endpoint is later changed to a remote one, that history must not be sent on with
  the next question. So every request re-applies the current gate and scrubber to the history it includes, using
  the current endpoint and toggles, and not the ones in force when the message was written.
- **Only recent messages are sent as context** (see 3.8). The full history stays on the device for the cashier to
  scroll.
- **Storage is capped**, with the oldest messages dropped first, so the history cannot grow without limit on an iPad.
- **No keys in history.** The API key is never stored in or near the chat history.

### 3.6 Audit log

Owner's answer: a full log of every conversation, for every staff member, for all time, so every event can be seen.

- **What is recorded:** each message the staff member sent (after the scrubber), each model reply, each tool call
  and the result that was sent to the model (after the gate), the endpoint and model used and whether it counted as
  local or remote, errors, offline searches, the staff member and role, whether practice mode was on, time stamps,
  and for each request a count of what was masked or withheld and in which category.
- **What is not recorded:** the API key, and the content of anything the gate withheld. The log keeps the
  category and count of withheld items, not the items. So the log never holds more than the model was sent.
- **Separate from chat history.** A staff member clearing their own history (3.5) does not touch the log.
- **Device only.** Not synced, not in any export or backup that leaves the device, because on a local endpoint it
  holds personal data. Only the manager role can open the viewer (follows question 16).
- **Built for all time:** entries are compressed and older months are rolled into compressed files, with a storage
  use figure in the viewer and an "Export log" that saves a file through the iPad's Files so it can be moved to a
  PC. Clearing the log is manual, manager only, and asks for a typed confirmation.
- **The viewer:** filter by staff member, date, tool, errors, practice mode, and "sent to a remote endpoint". Each
  request can be opened to show exactly what the model received.
- **Staff are told.** A one-line notice in the chat says conversations are logged for the manager.

### 3.7 Practice mode (Training)

Owner's answer: like the hint button but smarter, and not a free ride.

- **A coach, not an answer key.** The model is not given the answers to training tasks (expected amounts, the
  correct item, the finished sequence). This is the same idea as 3.4: it cannot give away what it does not have.
  The prompt gets the task description and the app's existing hint text. The repo has to be checked for how the
  training modules and the hint button store these, and whether the answer can be kept separate from the task.
- **A hint ladder set by the app, not the model.** Level one is a nudge (which area to look at, or a question
  back). Level two is more specific. Level three says where to tap, but never the final values. The app decides
  which level is allowed and raises it, for example after repeated asks on the same task. Saying "just tell me"
  does not skip a level, because the model never decides that.
- **Tools in practice mode.** Docs search and navgraph search stay on, on practice data only. The calculators and
  report summaries are off, because they would do the sums the task is testing. Real sales history and all real
  data are off. This follows the rule in section 4 that practice mode never touches real data.
- **Logged and marked as practice** in the audit log, so the manager can see where trainees needed help.

### 3.8 Limits

- **Tool calls per question (limit 15 by default, confirmed).** A limit is still needed, but only as a safety stop.
  A model can get stuck calling tools in a loop, which wastes time and, on a hosted provider, money. Normal
  questions use a handful of calls, so a high ceiling costs nothing. Default 15, changeable in Settings by the
  manager. When it is reached the chat says it stopped and shows what it found so far.
- **Context (the manager can change the size in Settings, confirmed).** The context window is how much text the
  model can read at once. The instructions, the tool definitions, the chat history and the tool results all share
  it. The app cannot see the limit by itself, so Settings has a "context size" value. The app fills it with the
  newest messages and tool results and drops the oldest first. "Test connection" fills it in when the provider
  reports it, and the default is a cautious 8000 otherwise. Setting it to the model's maximum gives the owner the
  "as big as the model allows" behaviour. A bigger context also makes local models slower. Ollama's own context size
  has to be set on the Ollama side, because the OpenAI-compatible endpoint does not let a request set it, so a large
  value in Settings would not help if Ollama is still cutting the text short.
- **Timeout.** 120 seconds as asked, with a "still working" indicator and a Retry button.

### 3.9 Reply style and language

- **Short by default, with a "More detail" button.** The prompt tells the model to match the length to the size of
  the question: a sentence or two for a simple one, a fuller answer with steps for a complex one. Tests should use a
  set of simple and complex questions and check the lengths come out right.
- **Language.** The interface and help stay English. The prompt gets one line telling the model to reply in the
  language the cashier writes in. No translation work, no extra tests. If a model does this badly, that is a limit
  of that model.
- **The dash rule in code.** Models use em and en dashes a lot and a prompt alone does not stop it, so a small
  filter replaces em and en dashes in replies before they are shown. The rest of the style rules (Australian
  English) stay in the prompt.

### 3.10 Patch order

Patch 1 is 0148. Later numbers are assigned when each patch is written, and other patches (such as the scanner patch 0147) can land in between. Replies are not streamed in patch 1; the
chat screen patch can add streaming.

1. **Done (0148).** Settings section, the OpenAI-compatible client and "Test connection". No chat screen yet.
   `docs/WRITING_ASSISTANT.md` and `docs/GUESSES.md` updated for the changed model policy (1.3).
   **0149 (tiny, before the chat patch):** the Auto / Local / Remote setting, and this document brought up to date with
   the decisions in 3.12.
2. **Done (0151).** Chat screen and Help menu entry. Plain chat with no tools, the error banner, per-staff history (3.5),
   a small scrubber (3.12) and the practice mode block (3.12).
3. **Done (0152 and 0156).** Audit log and the manager-only viewer (3.6), so every later patch is logged from the start.
   Split in two: **3a. Done (0152):** recording, the store and the notice. **3b. Done (0156):** the viewer, Export log,
   Clear log, the cap setting and opening the chat to everyone (`ASSISTANT_OPEN_TO_ALL`).
4. Navgraph and docs search, current date and time, screen and register context, role filtering (3.4) and the
   offline search (3.3). One tool per patch: **0157 done** (docs search and read, the runtime and loop, role header on help
   pages), **0158 done** (navgraph search, as `search_screens`, with the role filter for screens), **0159 done** (link, as `show_link`). **0160 done:** the offline search
   (screens and help pages; products and stock come with patch 6). **0162 done:** guide (as `show_guide`; no guide for Edit item, Training run, the Practice terminal, windows or the
   Checkout tab). **0166 done:** date and time (as `current_time`). **0167 done:** screen and register context (as `screen_context`).
5. **Done (0161).** The data gate (3.1) with its tests, and the category toggles, building on the small scrubber from patch 2. No data
   tools yet.
6. **Done (0164).** Product and inventory tools through the gate (`find_products`, `stock_levels`), then the model-free product and inventory lookup in offline mode.
7. **Done (0163).** The remaining data tools: sales history and report summaries (`sales_report`), orders (`find_orders`), deals (`list_deals`), customers (`find_customers`) and gift cards (`gift_card_activity`, with no balance, see Revision 19).
8. Cash drawer status, calculators and current cart.
9. Practice mode coach (3.7).
10. Settings reader and app and sync status. (The "Guide me there" highlight arrows were built in 0162, as the guide tool.)

The gate comes before any tool that returns shop data, so no tool is ever added without it.

### 3.12 Decisions for the chat patch (owner approved, 17 October 2026)

1. **Three-way endpoint setting first.** Auto / Local / Remote goes in as its own tiny patch (0149) before the chat patch.
2. **Scrubber pulled forward.** The chat sends whatever the cashier types, so a pasted email or card number could reach a
   remote server from the first day. A small scrubber is built into the chat patch: emails, phone numbers, card
   numbers (digit runs that pass the Luhn check) and key-shaped strings. It runs on the typed text and on stored history
   at send time. The full gate, category rules and toggles stay in patch 5 (3.1).
3. **Who sees the Help entry.** Until the audit log (patch 3) lands, the assistant entry shows only to people who may
   edit assistant settings (an owner, or a manager when there is no owner). Once the audit log lands it opens to
   everyone, as decided in question 4. The entry never shows on the PIN lock screen, because per-staff history needs a
   signed-in person.
4. **Practice mode.** Until the practice mode coach exists (patch 9), sending is blocked while practice mode is on, and
   the chat says so. Practice mode must never send anything out (section 4).

### 3.13 Decisions for the audit log patches (owner answered, 17 October 2026)

1. **When the log is full, send anyway and purge the oldest entries.** Sending is never blocked by the log. The oldest files go
   first, never today's. A purge line is written in the log and the meta file records the day purged through, so nobody mistakes
   the log for complete. The manager is warned from 80 percent of the cap. Default cap 200 MB; the manager's setting is in 0153.
2. **Compact entries.** An event stores the new question and the reply. The messages that went with it are listed by id, with
   the text inline only when the log does not already have it (old history, or after an app restart). The system prompt is
   stored once by hash in `meta.json`. A checksum of the exact request lets the viewer say whether it rebuilt it exactly.
3. **Hidden app folder.** `Library/Application Support/assistant-log/`, a sibling of Documents, which Files.app can see because
   `UIFileSharingEnabled` is on. Export log (0153) is the only way out. Checked in `expo-file-system`: its legacy API allows
   reading and writing the Application Support directory. On a device with no `/Documents/` path the app's private files folder is used.
4. **Typed word for Clear log: `CLEAR`** (0153).
5. **Who can open the viewer:** the same check as the assistant settings (`useCanEditAssistant`: an owner, or a manager when
   the team has no owner) (0153).

Things worth knowing about 0152: the log is written after the model answers or fails, so a request cut off by closing the app
leaves no line; a failed request is logged as an error with the question that was about to be sent; nothing is logged in
practice mode (sending is blocked there anyway); a log write problem shows the cashier a line to tell a manager and never
stops the answer.

### 3.11 Confirmed by the owner

1. The audit log viewer is for the manager role only. Confirmed.
2. A one-line notice in the chat says conversations are logged. Confirmed.
3. Clearing the audit log is manager only, with a typed confirmation, plus the "Export log" option. Confirmed.
4. Practice mode uses a three-step hint ladder raised by the app and not the model. Confirmed.
5. Tool call limit 15 and default context size 8000 (3.8). Confirmed, and the manager can change the context size
   in Settings.
6. The dash filter on replies in code (3.9). Confirmed.

## 4. How to work in this repo

These come from `DEV_NOTES.md`, `docs/PROGRESS.md` and the last few patches.

- Return changes as numbered `.patch` files, one idea per patch, small chunks. Patch 0148 is the assistant settings,
  so the next is 0149. Check `docs/PROGRESS.md` and `patches/` first (`patches/APPLIED.txt` stops at 0107 and is
  not the record to trust).
- Start from a fresh clone of `dev`. Do not trust memory of the repo over the repo.
- Each patch also updates `docs/PROGRESS.md` (a row in the patch log), adds a device test to `docs/DEVICE_TESTS.md`,
  and adds or updates help pages, then runs `npm run help:build` and, if the navgraph changes, `npm run graph:build`.
- Checks to run: `npx tsc --noEmit` and `npm test`. Four tests already fail on an untouched checkout
  (`tests/trainingitems.test.ts` and `tests/trainingstocklookup.test.ts`, a stock-lookup training module that
  looks unfinished), and `tsc` reports errors only in `tests/trainingstocklookup.test.ts`. Those are not caused by
  new work.
- Writing rules: Australian English, no em or en dashes in prose, dollar amounts like `$12.50`. Run
  `node scripts/style-check.mjs` on new text.
- Every control training or guidance can point at needs a spot id in `src/lib/trainingSpots.ts` and a screen in
  `src/lib/appControls.ts` and `src/app.navgraph`.
- Practice mode must never touch real data or send anything out.

## 5. Suggested prompt to send with this document

> Read `docs/AI_ASSISTANT_PLAN.md`, then clone the latest `dev` branch of the repo and check it against the document.
> Tell me anything in the document that the repo does not support. Then turn the next patch in 3.10 into a plan,
> listing anything you still need from me. Do not write code until I approve the plan. Follow section 4 for every
> patch.
