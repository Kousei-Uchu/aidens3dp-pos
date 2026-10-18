# Contributing

This is a personal shop app that happens to be public. Pull requests are not expected and issues are not a support channel. If you have found a genuine bug and a fix for it, a pull request with a clear description of the problem is welcome.

## Ground rules

- **Australian English** in all prose: colour, optimise, cancelled, licence (noun).
- **No AI-sounding writing.** Em dashes spliced into sentences, "robust", "seamless", "delve", "furthermore" at the start of a sentence: don't. Write like a person explaining something to another person.
- **Tests.** `npm test` must pass (four training-course failures are known and pre-existing). `npm run typecheck` must pass. `npm run graph:check` must pass if you add or move screens.
- **Help text.** If you change behaviour a help page describes, change the page in the same commit. `npm run help:build` regenerates `help/help.json`; `npm run help:check` fails if it is stale.
- **Patches.** This repo keeps a numbered patch file per change under `patches/`, with `patches/APPLIED.txt` as the ledger. Follow the pattern if you are working inside this repo; external contributors can skip it.

## Commits

Write what the change does, not what you felt about it. Subject line under ~72 characters, body explains why when the why isn't obvious.

## Code style

Strict TypeScript, no `any` escapes. Small pure functions in `src/lib/` that can be tested without a device; screens in `src/screens/` stay thin. Tests live in `tests/` named after the module they cover.
