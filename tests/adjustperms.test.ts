// Location: tests/adjustperms.test.ts
// A16.9: which roles may set which price adjustments.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ADJUST_KINDS, actingRole, canAdjust, canEditAdjustPerms, deniedMessage, flaggedDeniedHint, isOpen, permsSummary, readAdjustPerms, setAdjustPerm } from '../src/lib/adjustPerms';
import type { Role } from '../src/lib/types';

const ROLES: Role[] = ['cashier', 'manager', 'owner'];
const staff = [{ id: 'a', role: 'cashier' as Role }, { id: 'b', role: 'manager' as Role }, { id: 'c', role: 'owner' as Role }];

test('by default every role may set every kind (nothing changes until you restrict one)', () => {
  for (const r of ROLES) for (const k of ADJUST_KINDS) assert.equal(canAdjust({}, r, k), true);
  for (const bad of [undefined, null, 'x', 5, [], { cashier: 'no' }]) for (const k of ADJUST_KINDS) assert.equal(canAdjust(bad, 'cashier', k), true);
  assert.ok(isOpen({}) && isOpen(undefined));
});

test('a restriction affects only that role and that kind', () => {
  const p = setAdjustPerm({}, 'cashier', 'line', false);
  assert.equal(canAdjust(p, 'cashier', 'line'), false);
  assert.equal(canAdjust(p, 'cashier', 'item'), true);
  assert.equal(canAdjust(p, 'cashier', 'order'), true);
  assert.equal(canAdjust(p, 'manager', 'line'), true);
  assert.equal(isOpen(p), false);
});

test('the owner can never be restricted, even by a hand-edited or synced setting', () => {
  assert.deepEqual(setAdjustPerm({}, 'owner', 'item', false), {});
  assert.equal(canAdjust({ owner: { item: false, line: false, order: false } }, 'owner', 'item'), true);
  assert.deepEqual(readAdjustPerms({ owner: { item: false } }), {});
});

test('turning a switch back on tidies up: a fully open setup is an empty object again', () => {
  let p = setAdjustPerm({}, 'cashier', 'item', false);
  p = setAdjustPerm(p, 'manager', 'order', false);
  p = setAdjustPerm(p, 'cashier', 'item', true);
  assert.deepEqual(p, { manager: { order: false } });
  p = setAdjustPerm(p, 'manager', 'order', true);
  assert.deepEqual(p, {});
});

test('setAdjustPerm does not change the object it was given', () => {
  const before = { cashier: { line: false } } as const; const copy = JSON.parse(JSON.stringify(before));
  setAdjustPerm(before, 'cashier', 'item', false); setAdjustPerm(before, 'cashier', 'line', true);
  assert.deepEqual(before, copy);
});

test('readAdjustPerms keeps only explicit false for known roles and kinds (data from another register is not trusted)', () => {
  const r = readAdjustPerms({ cashier: { item: false, line: true, order: 'no', bogus: false }, janitor: { item: false }, manager: [] , extra: 1 });
  assert.deepEqual(r, { cashier: { item: false } });
  assert.deepEqual(readAdjustPerms(JSON.parse('{"manager":{"order":false}}')), { manager: { order: false } });
});

test('actingRole matches the More screen: no PIN or no staff means owner, a locked or unknown person is a cashier', () => {
  assert.equal(actingRole(false, staff, 'a'), 'owner');
  assert.equal(actingRole(true, [], undefined), 'owner');
  assert.equal(actingRole(true, staff, 'a'), 'cashier');
  assert.equal(actingRole(true, staff, 'b'), 'manager');
  assert.equal(actingRole(true, staff, 'c'), 'owner');
  assert.equal(actingRole(true, staff, undefined), 'cashier');
  assert.equal(actingRole(true, staff, 'gone'), 'cashier');
});

test('a locked register is as restricted as a cashier (nobody signed in cannot set an adjustment you banned for cashiers)', () => {
  const p = setAdjustPerm({}, 'cashier', 'order', false);
  assert.equal(canAdjust(p, actingRole(true, staff, undefined), 'order'), false);
  assert.equal(canAdjust(p, actingRole(false, staff, undefined), 'order'), true); // PIN not required: no accounts to restrict
});

test('who may change the switches: owner, or a manager only when the team has no owner', () => {
  assert.equal(canEditAdjustPerms('owner', staff), true);
  assert.equal(canEditAdjustPerms('manager', staff), false);
  assert.equal(canEditAdjustPerms('manager', staff.filter(m => m.role !== 'owner')), true);
  assert.equal(canEditAdjustPerms('cashier', staff.filter(m => m.role !== 'owner')), false);
  assert.equal(canEditAdjustPerms('cashier', staff), false);
});

test('messages name the role and the kind, and the summary lists only what is restricted', () => {
  assert.match(deniedMessage('cashier', 'line').message, /Cashiers can't set line prices/);
  assert.match(deniedMessage('manager', 'order').message, /Managers can't set whole order prices/);
  assert.match(flaggedDeniedHint('item'), /remove it/);
  assert.deepEqual(permsSummary({}), []);
  assert.deepEqual(permsSummary({ cashier: { line: false, order: false } }), ["Cashiers can't set line prices or whole order prices."]);
  assert.deepEqual(permsSummary({ cashier: { item: false, line: false, order: false }, manager: { item: false } }),
    ["Cashiers can't set any price adjustments.", "Managers can't set item prices."]);
});

test('the setting survives the JSON round trip used by shared settings and backups', () => {
  const p = setAdjustPerm(setAdjustPerm({}, 'cashier', 'item', false), 'manager', 'order', false);
  const back = JSON.parse(JSON.stringify({ adjustPerms: p })).adjustPerms;
  assert.deepEqual(readAdjustPerms(back), p);
});
