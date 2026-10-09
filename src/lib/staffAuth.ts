// Location: src/lib/staffAuth.ts
// Signing in by PIN or by scanning a cashier pass, and switching person without locking the register first.
import { useApp } from '../state/store';
import { csv } from './csvStore';
import { findByBadge } from './badge';
import { verifyPin } from './pin';
import { paymentActive } from './screensaver';
import type { StaffMember } from './types';

export type SignInResult = { ok: boolean; message: string; staff?: StaffMember };

function apply(m: StaffMember, method: 'PIN' | 'pass'): SignInResult {
  const st = useApp.getState(); const prev = st.settings.staff.find(x => x.id === st.staffId);
  if (prev?.id === m.id && st.unlocked) return { ok: true, message: `Already signed in as ${m.name}`, staff: m };
  st.set({ staffId: m.id, unlocked: true });
  void csv.event({ kind: 'staff_switch', staff: m.name, detail: `${method}; from ${prev?.name ?? 'nobody'}` }).catch(() => {});
  return { ok: true, message: prev && st.unlocked ? `Switched to ${m.name}` : `Signed in as ${m.name}`, staff: m };
}
/** Someone else taking over while a card payment waits on the reader would mis-tag that sale, so it waits. */
function blocked(): SignInResult | null {
  const st = useApp.getState();
  if (st.unlocked && paymentActive(st.pos.attempts, Date.now())) return { ok: false, message: 'A card payment is in progress. Finish it before switching staff.' };
  return null;
}

export async function signInWithPin(pin: string): Promise<SignInResult> {
  const b = blocked(); if (b) return b;
  for (const m of useApp.getState().settings.staff) if (await verifyPin(m.salt, pin, m.pinHash)) return apply(m, 'PIN');
  return { ok: false, message: 'Wrong PIN' };
}
export async function signInWithPass(raw: string): Promise<SignInResult> {
  const b = blocked(); if (b) return b;
  const m = findByBadge(useApp.getState().settings.staff, raw);
  return m ? apply(m, 'pass') : { ok: false, message: 'That pass is not recognised. It may have been cancelled or replaced.' };
}
export function lockRegister() { useApp.getState().set({ unlocked: false, staffId: undefined }); }
