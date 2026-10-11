// Location: src/ui/adjustGate.ts
// A16.9: connects the pure role rules (src/lib/adjustPerms.ts) to the signed-in person, for the cart screens.
import { useApp } from '../state/store';
import { actingRole, canAdjust, deniedMessage } from '../lib/adjustPerms';
import type { AdjustKind } from '../lib/adjustReview';
import { alertMsg, confirm } from './kit';

/** Read at the moment of the tap, so a pass swipe or PIN change while a sheet is open is respected. */
export function adjustAllowedNow(kind: AdjustKind): boolean {
  const s = useApp.getState(); const st = s.settings;
  return canAdjust(st.adjustPerms, actingRole(st.requirePin, st.staff, s.staffId), kind);
}
/** For drawing: re-renders when the person or the rules change. */
export function useAdjustAllowed(kind: AdjustKind): boolean {
  return useApp(s => canAdjust(s.settings.adjustPerms, actingRole(s.settings.requirePin, s.settings.staff, s.staffId), kind));
}
/**
 * Called before opening an editor. True = go ahead. False = the person may not set this kind of adjustment: with nothing
 * to remove it explains; with an adjustment already there it offers the one thing they can do, taking it off.
 */
export async function gateAdjust(kind: AdjustKind, existing: boolean, remove: () => void): Promise<boolean> {
  if (adjustAllowedNow(kind)) return true;
  const s = useApp.getState(); const st = s.settings; const d = deniedMessage(actingRole(st.requirePin, st.staff, s.staffId), kind);
  if (!existing) { alertMsg(d.title, d.message); return false; }
  if (await confirm('Take the adjustment off?', `${d.message} You can take this one off, which puts the price back to normal.`, 'Take off', true)) remove();
  return false;
}
/** A last check at the moment of saving. Shows the message and returns false when not allowed. */
export function checkAdjustAllowed(kind: AdjustKind): boolean {
  if (adjustAllowedNow(kind)) return true;
  const s = useApp.getState(); const st = s.settings; const d = deniedMessage(actingRole(st.requirePin, st.staff, s.staffId), kind);
  alertMsg(d.title, d.message); return false;
}
