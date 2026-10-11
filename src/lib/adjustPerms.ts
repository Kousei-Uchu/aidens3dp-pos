// Location: src/lib/adjustPerms.ts
// A16.9: which staff roles may set price adjustments. Pure rules, no React, so they are testable.
//
// The model, in one paragraph: there are three kinds of adjustment (item price, line price, whole order price) and
// three roles (cashier, manager, owner). Everything is allowed until someone says otherwise, so only a `false` is ever
// stored. The owner can never be restricted (like the sole admin keeping Staff and Settings in B5, nobody can lock
// themselves out). Taking an adjustment OFF is never restricted: it can only put a price back to normal. "Keep" on a
// flagged adjustment and "Adjust" both count as setting one, because they confirm or change a price someone else chose.
import type { Role, StaffMember } from './types';
import type { AdjustKind } from './adjustReview';

/** Only explicit `false` entries are stored. Missing or unknown anything = allowed. */
export type AdjustPerms = Partial<Record<Role, Partial<Record<AdjustKind, boolean>>>>;

export const ADJUST_KINDS: AdjustKind[] = ['item', 'line', 'order'];
/** Roles that can be restricted. The owner is deliberately missing. */
export const RESTRICTABLE_ROLES: Exclude<Role, 'owner'>[] = ['cashier', 'manager'];

export const KIND_NAME: Record<AdjustKind, string> = { item: 'item prices', line: 'line prices', order: 'whole order prices' };
const KIND_ONE: Record<AdjustKind, string> = { item: 'an item price', line: 'a line price', order: 'a whole order price' };
export const ROLE_PLURAL: Record<Role, string> = { cashier: 'Cashiers', manager: 'Managers', owner: 'Owners' };

/** Anything read from storage or from another register is untrusted: keep only explicit `false` for a known role and kind. */
export function readAdjustPerms(raw: unknown): AdjustPerms {
  const out: AdjustPerms = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const role of RESTRICTABLE_ROLES) {
    const r = (raw as Record<string, unknown>)[role];
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    const denied: Partial<Record<AdjustKind, boolean>> = {};
    for (const k of ADJUST_KINDS) if ((r as Record<string, unknown>)[k] === false) denied[k] = false;
    if (Object.keys(denied).length) out[role] = denied;
  }
  return out;
}

/** May this role set (or keep, or change) this kind of adjustment? */
export function canAdjust(perms: unknown, role: Role, kind: AdjustKind): boolean {
  if (role === 'owner') return true;
  return readAdjustPerms(perms)[role]?.[kind] !== false;
}

/** A new perms object with one switch changed. Allowed switches are dropped, empty roles are dropped, so a fully open setup is `{}`. */
export function setAdjustPerm(perms: unknown, role: Role, kind: AdjustKind, allowed: boolean): AdjustPerms {
  const cur = readAdjustPerms(perms);
  if (role === 'owner') return cur; // the owner is never restricted
  const mine = { ...(cur[role] ?? {}) };
  if (allowed) delete mine[kind]; else mine[kind] = false;
  const next = { ...cur };
  if (Object.keys(mine).length) next[role] = mine; else delete next[role];
  return next;
}

/** True when nothing is restricted (the default). */
export const isOpen = (perms: unknown): boolean => Object.keys(readAdjustPerms(perms)).length === 0;

/**
 * The role the person at the till is acting as. It matches the More screen: with a PIN required and staff set up, it is the
 * signed-in person's role (a locked or unknown person counts as a cashier, the safe side); otherwise there are no accounts
 * to restrict, so the till acts as the owner.
 */
export function actingRole(requirePin: boolean, staff: Pick<StaffMember, 'id' | 'role'>[], staffId: string | undefined): Role {
  const lockOn = requirePin && staff.length > 0;
  if (!lockOn) return 'owner';
  return staff.find(m => m.id === staffId)?.role ?? 'cashier';
}

/** Who may change these switches: an owner, or a manager when the team has no owner (otherwise nobody could). The till with no accounts acts as owner. */
export function canEditAdjustPerms(role: Role, staff: Pick<StaffMember, 'role'>[]): boolean {
  if (role === 'owner') return true;
  return role === 'manager' && !staff.some(m => m.role === 'owner');
}

/** What to tell someone who is not allowed. */
export function deniedMessage(role: Role, kind: AdjustKind): { title: string; message: string } {
  return { title: 'Not allowed for your role', message: `${ROLE_PLURAL[role]} can't set ${KIND_NAME[kind]} on this register. Ask a manager or owner to do it, or switch to their sign-in.` };
}
/** The line shown in place of Keep / Adjust on a flagged adjustment the person may not touch. */
export const flaggedDeniedHint = (kind: AdjustKind): string => `Your role can't keep or change ${KIND_ONE[kind]}. You can remove it, or ask a manager or owner to look at it.`;

/** One line per restricted role for the Staff screen, e.g. "Cashiers can't set line prices or whole order prices." Empty when open. */
export function permsSummary(perms: unknown): string[] {
  const p = readAdjustPerms(perms); const out: string[] = [];
  for (const role of RESTRICTABLE_ROLES) {
    const no = ADJUST_KINDS.filter(k => p[role]?.[k] === false);
    if (!no.length) continue;
    out.push(no.length === ADJUST_KINDS.length ? `${ROLE_PLURAL[role]} can't set any price adjustments.` : `${ROLE_PLURAL[role]} can't set ${no.map(k => KIND_NAME[k]).join(' or ')}.`);
  }
  return out;
}
