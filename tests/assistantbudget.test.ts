// Location: tests/assistantbudget.test.ts
// Patch 0174: the prompt and the tool definitions are sent with every question and share the model's context with the chat.
// At the default context of 8000 they took so much that a cashier had about 700 tokens left, and a manager about 400.
// This pins the room that is left, so adding a tool or a long sentence has to be paid for somewhere else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessagesDetailed, buildSystemPrompt, estimateTokens, REPLY_SHARE } from '../src/lib/assistantChat';
import { DEFAULT_CONTEXT_SIZE } from '../src/lib/assistantConfig';
import { makeToolSet, toolDefs, toolsFor } from '../src/lib/assistantTools';

const ROOM_FOR_CHAT = 1000; // tokens of chat history and tool results, after the prompt, the definitions and the reply share

const room = (role: string) => {
  const tools = toolsFor(role);
  const system = estimateTokens(buildSystemPrompt('short', true, tools.map(t => t.def.function.name)));
  const defs = estimateTokens(JSON.stringify(toolDefs(tools)));
  return { system, defs, left: Math.floor(DEFAULT_CONTEXT_SIZE * (1 - REPLY_SHARE)) - system - defs };
};

test('at the default context size every role keeps room for the chat', () => {
  assert.equal(DEFAULT_CONTEXT_SIZE, 8000, 'the owner confirmed 8000 as the default (plan 3.11); change this test only with the plan');
  for (const role of ['cashier', 'manager', 'owner']) {
    const r = room(role);
    assert.ok(r.left >= ROOM_FOR_CHAT, `${role}: the prompt (${r.system}) and the tool definitions (${r.defs}) leave ${r.left} tokens for the chat`);
  }
});

test('the room the budget test counts is the room the chat code uses', () => {
  const set = makeToolSet({ pages: [], role: 'cashier', contextSize: DEFAULT_CONTEXT_SIZE });
  const long = 'word '.repeat(2000);
  const one = buildMessagesDetailed([{ id: 'a', role: 'user', text: long, at: 1 }], 'short', DEFAULT_CONTEXT_SIZE, set);
  // A question this long is cut to the room that is left, not to the 200 token floor.
  const kept = estimateTokens(one.messages[one.messages.length - 1].content ?? '');
  assert.ok(kept >= ROOM_FOR_CHAT - 50 && kept <= room('cashier').left + 4, `kept ${kept}`);
});

test('a short prompt still carries every rule the owner approved', () => {
  const p = buildSystemPrompt('short', true, toolsFor('manager').map(t => t.def.function.name));
  for (const rule of [/never guess the date/i, /never tell them to tap a tab that it does not list/i, /never count stock yourself/i, /never add up figures yourself/i, /never do them yourself/, /only source for why a sale will not go through/, /Never open, count or edit them/, /Never change one/, /never show a web address, key or PIN/, /never write a link, an id or a page id/, /couldn't find anything on that/, /cannot see what is left on a gift card/, /privacy rules/]) assert.match(p, rule);
});
