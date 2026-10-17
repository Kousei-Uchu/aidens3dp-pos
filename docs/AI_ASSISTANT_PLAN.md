# In-app AI assistant: planning document

Repo: `github.com/Kousei-Uchu/aidens3dp-pos` (branch `dev`). Checked against the repo on 17 October 2026.

This document is the starting point for planning the Help menu chatbot. Part 1 is what the repo says today.
Part 2 is what is not built. Part 3 is the decisions, with the owner's answers.
Part 4 is how to work in this repo.

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
and the practice mode block (3.12), the dash filter (3.9), the prompt, and the "More detail" button.

Still to do:

- The offline mode (3.3): a visible error plus a model-free search of the navgraph and docs.
- Role filtering (3.4): a check that removes screens, help pages, tools and data the current role cannot use,
  before anything reaches the model or the screen.
- The read-only tools (3.2).
- The audit log and its manager-only viewer (3.6).
- The practice mode coach (3.7).
- Model-free product and inventory lookup for the offline mode (3.3).
- The data gate: the category rules and override toggles (3.1). All enforced in code. The small scrubber exists
  already (0151) and the gate builds on it.
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
secrets) have no Always allow state. The owner asked for these toggles. They are built with the gate (patch 5).

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
3. Audit log and the manager-only viewer (3.6), so every later patch is logged from the start.
4. Navgraph and docs search, current date and time, screen and register context, role filtering (3.4) and the
   offline search (3.3).
5. The data gate (3.1) with its tests, and the category toggles, building on the small scrubber from patch 2. No data
   tools yet.
6. Product and inventory tools through the gate, then the model-free product and inventory lookup in offline mode.
7. The remaining data tools: sales history, deals, customers, orders, gift cards and report summaries.
8. Cash drawer status, calculators and current cart.
9. Practice mode coach (3.7).
10. Settings reader and app and sync status, then the "Guide me there" highlight arrows.

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
