---
id: settings/ask-assistant
title: Ask the assistant
parent: settings/assistant
summary: Chat with the Help assistant: what it can and cannot do, asking about products, stock, sales, orders, deals, customers and gift cards, what is kept, and what is hidden before anything is sent.
tags: [AI, assistant, chatbot, chat, ask, history, log, audit, privacy, practice mode, sales, orders, deals, customers, gift cards, report, products, stock, inventory, price]
related: [settings/assistant, settings/backup]
updated: 2026-10-18
---
Open **Help** and tap the sparkles button at the top. For now only an owner can see it, or a manager when the team has no owner. It is not on the sign in screen, because your chat history belongs to you and the till needs to know who you are. Set up the model first: see [[settings/assistant]].

## Basic

### What it can do
Type a question and tap the round **Send** arrow beside the box. While the chat is empty it also offers a few questions to start with: tap one to ask it. It answers in plain words, in the language you write in. For how-to questions it looks through the till's help pages first (search, then read the best page), and answers from what it finds. For where-is-it questions it also looks through the till's screens and tells you the taps to get there, starting from the Checkout tab. If it finds nothing, it says so. It only looks at help pages and screens for things your role can use.

### How replies look
The assistant's replies are laid out the way it writes them: headings, **bold** and *slanted* words, bullet and numbered lists, tables and boxes of code. A small round badge marks each of its messages, and the time is shown under each message. Press and hold on a reply to select and copy its words. Links are never tappable in a reply: if it names a page or a screen, use the button under the reply instead.

### Buttons under a reply
When it points you at a help page or a screen, it can put a button under its reply. Tap **Open Reports**, for example, and you go straight there. A help page button opens that page in Help. Back returns you to the chat. Only tabs and ordinary pages get a button. A window that opens on top of something else, such as the refund window, has no button, so the reply gives you the taps instead. Short questions get short answers. Tap **More detail** under a reply for a fuller one.

### Guide me to a screen
Ask to be shown or walked to a screen (*Show me how to get to Reports*) and the reply can have a **Guide me to Reports** button. Tap it and the till goes to the Checkout tab and points at each button to tap, one at a time: a glowing ring on the button, and a small card that says what to do and which step you are on. Tap the button it points at, and it moves on to the next. When you arrive the card says *You are there*. It never dims the screen and never stops you tapping anything else. If you are already part of the way there, it picks up from where you are. Tap **Stop** on the card at any time. If it cannot see the next button (you went somewhere else), the card says so and you can go back to the Checkout tab or tap **Stop**. Only one guide runs at a time, it ends by itself after ten minutes, and it ends if someone else signs in. It only offers a guide to screens your role can reach, and to the others it says it could not find anything, just as it does for a screen that does not exist. A window that opens on top of something else, such as the refund window, has no guide, because the ring cannot be drawn above a window. The reply gives you the taps in words instead. A few pages have no guide either, because the button on the way to them cannot be pointed at (an item in the Items list, or Start on a training lesson). The Checkout tab has none, because that is where every guide starts.

### Ask about the shop's figures
Ask things like *How much is the red Highland Cow, and how many do we have?*, *What is low on stock?*, *How much did we sell today?*, *How many Tadlings did we sell this month?*, *Find order 1042*, *What deals are on right now?*, *Find the customer Priya* or *Which gift cards did we sell this week?* The assistant looks at what is saved on **this till** and answers from that. It does not add anything up itself: sales totals come already added up, the same way the **Reports** page adds them. It tells you plainly when nothing matched. It also knows today's date and the time from the iPad's clock, so *yesterday*, *this week* and *this month* mean the right days.

Good to know:
- It only knows this till. The sales and refunds it can find are the latest 2000 saved here, and the totals it reports are this till's plus any imported Square history. Other tills are not included, so a total here can be lower than Reports when other tills are selling.
- A gift card's **remaining balance** is not something it can look up. Use the **Gift cards** screen for that. It can tell you which cards were sold and paid with on this till.
- Products, prices and stock come from the catalogue saved on this iPad, so stock is as of the last sync. It is not a live look at Shopify. A product that is not tracked is listed as *Not tracked*, and a draft or archived product is only found when you ask for it.
- What it is allowed to read depends on the shop's privacy rules (see **What the assistant may see** in [[settings/assistant]]). When something is hidden, it says it cannot show it. With a model that is not on the shop's own network, that means customer names, emails and phone numbers, staff names, gift card codes and how an order was paid. What was sold, the prices and the totals are still available.

### What it cannot do
It never changes anything: no prices, refunds, carts, stock, customers or settings. It only answers.

### If it does not answer
A red bar says what went wrong in plain words: not set up, cannot reach the model, took too long, key rejected, model not found. **Retry** appears when trying again could help. An owner also gets **Open model settings**. Everyone else is told to ask the owner or a manager.

Below your question it still gives you a list, headed *Model offline, showing search results.* The list is a plain search of the till's **screens** and **help pages** for the words you typed, with no model, so it is a list of matches and not an answer. For each screen it says what the screen is for and the taps to open it from the Checkout tab, with an **Open** button when the screen is a tab or a page that can be opened that way (a window cannot, so its taps are listed). Tap a help page to read it. It only lists things your role can use, and if nothing matches it says it could not find anything. This also works before the model is set up. Your next question tries the model first again, and the red bar goes when it answers. **Retry** replaces the list with the model's answer.

## Deep

### What is kept
Your messages and its replies are kept on this iPad, for you only. Each person who signs in has their own. They are not shared with other registers and are not in Backup & transfer. The newest 200 messages are kept. Tap the bin at the top to clear your own history. Nothing clears it by itself.

### What is hidden before sending
Before anything leaves the iPad, email addresses, Australian and international phone numbers, card numbers and keys or tokens are replaced with a tag such as [email address]. A line under your message says what was hidden. This happens on every model, local or remote, and it also runs again over older messages each time you ask something new. Shop data the assistant is later given goes through a stricter check first, set in **What the assistant may see** in [[settings/assistant]].

### The conversation log
Every question you send and every answer or error is also written to a log on this iPad, so the manager can see what was asked and what the model was sent. A line under the chat says so. The log is separate from your chat history: clearing your history with the bin does not touch it. It keeps what was sent after the hiding described above, so a card number you typed is not in it, and it never holds the API key. It stays on this iPad, is not shared with other registers and is not in Backup & transfer. There is no screen to read it yet. The manager's viewer, with export and clear, comes in the next patch.

If a message cannot be added to the log (the iPad is out of space, for example), you still get your answer. A red line under the chat says *This conversation could not be added to the log. Tell a manager.*

### What shop data it can see
Seven tools read the shop's data, all from what is saved on this iPad:
- **Find products**: a product or variation by name, SKU, barcode or category, with its price and stock in the same words as the Stock check tile (*In stock*, *Out of stock*, *Not tracked*, *oversold*). Ask for detail and it adds SKU, barcode, the usual price, cost, tags, categories and the deals that could apply, for up to three products.
- **Stock levels**: what is low, out of stock, oversold or not tracked, for the whole catalogue or one category, with the counts already added up. *Low* is the same as the low filter on the Inventory tab: 2 or fewer, which includes out of stock.
- **Sales report** for a period (today, yesterday, this week, last month, or two dates): orders, discounts, refunds, net sales, takings by payment method, top items and categories, cost and profit, and the sales by each staff member where names may be sent. It can also count how many of one item were sold.
- **Find orders**: the newest ten sales and refunds that match an order number, an item, a customer or some dates. Ask for detail and it gives the items, prices, deals, price adjustments and notes of up to three.
- **Deals**: the bundle deals, automatic discounts and manual discounts, what each does and whether it is running now.
- **Find customers**: by name, email or phone, with their order count and spending as last synced.
- **Gift card activity**: cards sold and payments made with a card, filtered by the last four or more characters of a code.

Every answer from these goes through the privacy check before the model sees it, and the conversation log shows what the model was given and how many items were hidden.

### Practice mode
The assistant is switched off in practice mode, and that includes the search list. Practice mode never sends anything out, and nothing is logged.

## Advanced

### What goes to the model
Only the short rules the app gives it, then as many of the newest messages as fit in the **Context size** from the AI assistant settings (a quarter is kept free for the reply). Older messages stay on the iPad for you to scroll, but are not sent. Replies have em and en dashes replaced before they are shown.

### How the buttons work
The model asks for a button with the `show_link` tool, giving a kind (help page or screen) and an id it got from a search. The app checks the id against what your role may see, the same check the searches use, so a page or screen you cannot use gets the same answer as one that does not exist. The button is not part of the reply text: it is saved next to the reply, at most three, and it is checked again each time the chat is drawn, so if your role loses access later, the button is gone. Buttons are never sent back to the model. A button can only open a help page, a tab or a page that needs nothing else; it never opens an address on the web and never changes anything. Code: `resolveLink` and `liveLinks` in `src/lib/assistantTools.ts`, the `target` of each screen in `src/lib/assistantScreens.ts`.

### How the guide works
The model asks for the button with the `show_guide` tool, giving a screen id from `search_screens` (which marks the screens that can be guided with `can_guide`). The app checks it for your role exactly as it does for `show_link`, so a screen you cannot reach gets the same answer as one that does not exist. Each screen carries its walk: the controls to tap from the Checkout tab, read from the same graph that gives the plain words, with the words said at each tap. A screen gets no walk if any tap has no control or no words, if the control is not a real spot in the till, or if the walk goes into a window. The ring does not remember where you are: several times a second it looks at which controls of the walk are on screen and points at the last one, so tapping something else or starting part of the way along both work. A guide to a tab or a page ends when you arrive there. A guide to a view of Checkout (such as Keypad) ends when one of that view's own controls is on screen, or when you tap the last control. The ring and card are drawn on the main screen only, never inside a window. The guide changes nothing: it only points. Code: `src/lib/assistantGuide.ts` (the rules and the one active guide, tested), `src/ui/AssistantGuide.tsx` (the ring and card), `walk` of each screen in `src/lib/assistantScreens.ts`, `resolveLink` and `show_guide` in `src/lib/assistantTools.ts`.

### How the log is kept
One file for each day, in a folder inside the app that Files.app cannot see (`Library/Application Support/assistant-log/`, next to Documents and not inside it). A finished month is packed into one compressed file. The log has a size cap, 200 MB for now. When it is full the oldest files are removed to make room, a *purge* line is written saying how many events went and through which day, and sending is never blocked. Each line records who asked (name and role as they were then), the model and whether the address counted as local or remote, the scrubbed question, the reply, the messages sent (by id once the log already holds them, to keep it small), a checksum of the exact request, and how many items the scrubber hid in each category. The system prompt is kept once in `meta.json`. Code: `src/lib/assistantLog.ts` (logic, tested) and `src/lib/assistantLogIO.ts` (the folder). A failed request is logged too, as an error with the question that was about to be sent.

### The offline list
Since 0164 the list also shows **products** (price, stock, and a line for each variation) and a **low, out of stock or oversold** list when your question asks for one, for example *what is low on stock* or *red highland cows*. These use the same lookups as the model's product tools, from the catalogue on this iPad, so they work with no connection at all. The words of a question that are not part of a product name (*how many*, *do we have*, *price*, *stock*) are left out of the search; with one or two words all of them must match, and with three or more half is enough. Only active and unlisted products are listed, and nothing is shown in practice mode. The list is not stored. Only your question is, with a marker where a reply would be. Each time the chat is shown the list is searched again, for whoever is signed in then, so someone whose role has less access is never shown something they cannot use, even in an old chat. The model is never shown a question that only got a list, so it does not try to answer it later. A manager sees these in the conversation log as an *Offline search*, with the screens, help pages and products it found and why the model was not used.

### How the product and stock tools work
They are in `src/lib/assistantProducts.ts` and use the till's own rules, so the assistant cannot say *low* or *out* differently from the screen: `stockText` from `src/lib/lookup.ts` for the words, and `filterVariants`, `matchesStock` and `sortVariants` from `src/lib/inventoryView.ts` for the filters. `dealsFor` from `lookup.ts` gives the deals that could apply. A search needs every word to match the name, variation, SKU or barcode, as the Inventory search box does. When only some variations of a product match, only those are shown and there is no total for the product, so a total never covers more than it says. Product, price, stock, SKU, barcode and deal fields are *shop data* in the gate; the cost price is *costs and profit*, so it goes out only where that is allowed and is never in the summary form. Not tracked is stock `null` in the catalogue, and stock can be negative (oversold) by design.

### How the shop data tools work
Each tool is a plain function over a snapshot taken when you ask the question (`takeAssistantData` in `src/lib/assistantDataIO.ts`): this till's sales (the latest 2000), the daily totals saved here (this till's, any sales in the outbox not yet counted, and imported Square history), the customers, the deals and the catalogue names. They are handed nothing that can write, and a test freezes the snapshot to prove they do not change it. Money is returned as text such as $12.50 so a small model never reads cents. Each tool declares a field map that puts every field it can return into a privacy category, and the data gate removes or masks what the endpoint may not receive. A tool also never matches on something the model may not read: a customer is not found by name when names are hidden, and a gift card is not found by code when codes are hidden, because a match would tell the model who bought what. When names and emails are both hidden, a customer search returns an empty list and the privacy note, exactly as it does for a customer who does not exist. How an order was paid is treated as a payment detail and is never sent. Card details are never put in a result at all. On practice data the snapshot is empty, which is a second lock behind the practice mode block. Code: `src/lib/assistantData.ts` (the queries, tested), `src/lib/assistantDataTools.ts` (the tool definitions and field maps), `src/lib/assistantDataIO.ts` (the snapshot).

### Limits of this version
The offline list looks up products and stock, but not customers or sales yet. The tools are for the help pages, the screens, the button and guide tools, and the seven shop data tools above. There is no live look at Shopify, so a gift card balance and other tills' sales are out of reach. A request is written to the log after the model answers or fails, so if the app is closed in the middle of a request, that request leaves no line. Phone number hiding covers Australian numbers and numbers that start with a plus sign, so a number typed another way may not be caught. Do not type customer details you would not want sent.
