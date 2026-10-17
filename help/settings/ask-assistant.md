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

### Guide me to a screen
Ask to be shown or walked to a screen (*Show me how to get to Reports*) and the reply can have a **Guide me to Reports** button. Tap it and the till goes to the Checkout tab and points at each button to tap, one at a time: a glowing ring on the button, and a small card that says what to do and which step you are on. Tap the button it points at, and it moves on to the next. When you arrive the card says *You are there*. It never dims the screen and never stops you tapping anything else. If you are already part of the way there, it picks up from where you are. Tap **Stop** on the card at any time. If it cannot see the next button (you went somewhere else), the card says so and you can go back to the Checkout tab or tap **Stop**. Only one guide runs at a time, it ends by itself after ten minutes, and it ends if someone else signs in. It only offers a guide to screens your role can reach, and to the others it says it could not find anything, just as it does for a screen that does not exist. A window that opens on top of something else, such as the refund window, has no guide, because the ring cannot be drawn above a window. The reply gives you the taps in words instead. A few pages have no guide either, because the button on the way to them cannot be pointed at (an item in the Items list, or Start on a training lesson). The Checkout tab has none, because that is where every guide starts.

### What it cannot do yet
It cannot see the shop's data. It does not know your products, prices, stock, customers, orders or sales, and it will say so instead of guessing. It never changes anything either: no prices, refunds, carts or settings. It only answers.

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
The list is not stored. Only your question is, with a marker where a reply would be. Each time the chat is shown the list is searched again, for whoever is signed in then, so someone whose role has less access is never shown something they cannot use, even in an old chat. The model is never shown a question that only got a list, so it does not try to answer it later. A manager sees these in the conversation log as an *Offline search*, with the screens and help pages it found and why the model was not used.

### Limits of this version
The offline list does not look up products, stock or customers yet. The only tools are for the help pages and the screens, the button tool for opening them and the guide tool, so no shop data is sent at all. The full data rules and the shop data tools arrive in later patches. A request is written to the log after the model answers or fails, so if the app is closed in the middle of a request, that request leaves no line. Phone number hiding covers Australian numbers and numbers that start with a plus sign, so a number typed another way may not be caught. Do not type customer details you would not want sent.
