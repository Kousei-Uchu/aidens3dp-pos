// Location: src/lib/trainingPass.ts
// The practice cashier passes. A camera cannot scan a pass that does not exist, so during practice the Scan pass window draws these instead
// and a button stands in for holding the pass under the scanner. Pure apart from one small flag, reset whenever practice starts or restarts.
import type { Injection } from './trainingModule';

/** Morgan's pass. A real pass code: 'P' plus 12 Crockford base32 characters (see badge.ts). */
export const PRACTICE_PASS_CODE = 'P7K3M9Q2XW4DE';
/** A pass nobody owns any more, for the "cancelled pass" problem. It matches no staff member, so the till refuses it like a real cancelled pass. */
export const CANCELLED_PASS_CODE = 'PBZ5R8T1HN6CW';
export type PassState = 'good' | 'cancelled';
export type PracticePass = { code: string; name: string; role: string; cancelled: boolean };

let state: PassState = 'good';
export const setPassState = (s: PassState): void => { state = s; };
export const passState = (): PassState => state;
export const resetPass = (): void => { state = 'good'; };
/** A `pass` injection decides the state for the goal that carries it; a goal without one gets a good pass. */
export const passStateOf = (inj: readonly Injection[] | undefined): PassState => ((inj ?? []).find(i => i.kind === 'pass') as Extract<Injection, { kind: 'pass' }> | undefined)?.state ?? 'good';
/** The pass the practice window holds out right now. */
export const practicePass = (): PracticePass => (state === 'cancelled'
  ? { code: CANCELLED_PASS_CODE, name: 'Morgan', role: 'Manager', cancelled: true }
  : { code: PRACTICE_PASS_CODE, name: 'Morgan', role: 'Manager', cancelled: false });
