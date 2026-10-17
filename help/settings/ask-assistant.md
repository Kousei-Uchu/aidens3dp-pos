---
id: settings/ask-assistant
title: Ask the assistant
parent: settings/assistant
summary: Chat with the Help assistant: what it can and cannot do yet, what is kept, and what is hidden before anything is sent.
tags: [AI, assistant, chatbot, chat, ask, history, log, audit, privacy, practice mode]
related: [settings/assistant, settings/backup]
updated: 2026-10-18
---
Open **Help** and tap the sparkles button at the top. For now only an owner can see it, or a manager when the team has no owner. It is not on the sign in screen, because your chat history belongs to you and the till needs to know who you are. Set up the model first: see [[settings/assistant]].

## Basic

### What it can do
Type a question and tap **Send**. It answers in plain words, in the language you write in. For how-to questions it looks through the till's help pages first (search, then read the best page), and answers from what it finds. For where-is-it questions it also looks through the till's screens and tells you the taps to get there, starting from the Checkout tab. If it finds nothing, it says so. It only looks at help pages and screens for things your role can use.

### Buttons under a reply
When it points you at a help page or a screen, it can put a button under its reply. Tap **Open Reports**, for example, and you go straight there. A help page button opens that page in Help. Back returns you to the chat. Only tabs and ordinary pages get a button. A window that opens on top of something else, such as the refund window, has no button, so the reply gives you the taps instead. Short questions get short answers. Tap **More detail** under a reply for a fuller one.

### What it cannot do yet
It cannot see the shop's data. It does not know your products, prices, stock, customers, orders or sales, and it will say so instead of guessing. It never changes anything either: no prices, refunds, carts or settings. It only answers.

### If it does not answer
A red bar at the top says what went wrong in plain words: not set up, cannot reach the model, took too long, key rejected, model not found. **Retry** appears when trying again could help. An owner also gets **Open model settings**. Everyone else is told to ask the owner or a manager.

## Deep

### What is kept
Your messages and its replies are kept on this iPad, for you only. Each person who signs in has their own. They are not shared with other registers and are not in Backup & transfer. The newest 200 messages are kept. Tap the bin at the top to clear your own history. Nothing clears it by itself.

### What is hidden before sending
Before anything leaves the iPad, email addresses, Australian and international phone numbers, card numbers and keys or tokens are replaced with a tag such as [email address]. A line under your message says what was hidden. This happens on every model, local or remote, and it also runs again over older messages each time you ask something new.

### The conversation log
Every question you send and every answer or error is also written to a log on this iPad, so the manager can see what was asked and what the model was sent. A line under the chat says so. The log is separate from your chat history: clearing your history with the bin does not touch it. It keeps what was sent after the hiding described above, so a card number you typed is not in it, and it never holds the API key. It stays on this iPad, is not shared with other registers and is not in Backup & transfer. There is no screen to read it yet. The manager's viewer, with export and clear, comes in the next patch.

If a message cannot be added to the log (the iPad is out of space, for example), you still get your answer. A red line under the chat says *This conversation could not be added to the log. Tell a manager.*

### Practice mode
The assistant is switched off in practice mode. Practice mode never sends anything out, and nothing is logged.

## Advanced

### What goes to the model
Only the short rules the app gives it, then as many of the newest messages as fit in the **Context size** from the AI assistant settings (a quarter is kept free for the reply). Older messages stay on the iPad for you to scroll, but are not sent. Replies have em and en dashes replaced before they are shown.

### How the buttons work
The model asks for a button with the `show_link` tool, giving a kind (help page or screen) and an id it got from a search. The app checks the id against what your role may see, the same check the searches use, so a page or screen you cannot use gets the same answer as one that does not exist. The button is not part of the reply text: it is saved next to the reply, at most three, and it is checked again each time the chat is drawn, so if your role loses access later, the button is gone. Buttons are never sent back to the model. A button can only open a help page, a tab or a page that needs nothing else; it never opens an address on the web and never changes anything. Code: `resolveLink` and `liveLinks` in `src/lib/assistantTools.ts`, the `target` of each screen in `src/lib/assistantScreens.ts`.

### How the log is kept
One file for each day, in a folder inside the app that Files.app cannot see (`Library/Application Support/assistant-log/`, next to Documents and not inside it). A finished month is packed into one compressed file. The log has a size cap, 200 MB for now. When it is full the oldest files are removed to make room, a *purge* line is written saying how many events went and through which day, and sending is never blocked. Each line records who asked (name and role as they were then), the model and whether the address counted as local or remote, the scrubbed question, the reply, the messages sent (by id once the log already holds them, to keep it small), a checksum of the exact request, and how many items the scrubber hid in each category. The system prompt is kept once in `meta.json`. Code: `src/lib/assistantLog.ts` (logic, tested) and `src/lib/assistantLogIO.ts` (the folder). A failed request is logged too, as an error with the question that was about to be sent.

### Limits of this version
The only tools are for the help pages and the screens, and the button tool for opening them, so no shop data is sent at all. The full data rules, the shop data tools and the guide tools (the highlight arrows) arrive in later patches. A request is written to the log after the model answers or fails, so if the app is closed in the middle of a request, that request leaves no line. Phone number hiding covers Australian numbers and numbers that start with a plus sign, so a number typed another way may not be caught. Do not type customer details you would not want sent.
