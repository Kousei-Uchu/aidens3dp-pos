// Location: src/lib/trainingProgress.ts
// Who has finished which module. Stored on this device only, keyed by staff id. Pure; the store reads and writes it.
import { STAGES, type Stage } from './trainingModule';

export type ModProg = { stages: Stage[]; done?: string; hints: number; secs: number; runs: number; /** How many times this person's progress in this module has been reset by a manager or owner (0209+: 0210). Absent means never. */ epoch?: number };
export type Progress = { v: 1; by: Record<string, Record<string, ModProg>> };
/** With no staff set up there is one shared record. */
export const SHARED_KEY = '_shared';
export const staffKey = (staffId?: string): string => staffId || SHARED_KEY;
export const emptyProgress = (): Progress => ({ v: 1, by: {} });

/** Anything read from storage is untrusted: bad shapes are dropped, never thrown. */
export function readProgress(raw: unknown): Progress {
  const out = emptyProgress(); if (!raw || typeof raw !== 'object') return out;
  const by = (raw as any).by; if (!by || typeof by !== 'object') return out;
  for (const [who, mods] of Object.entries(by)) {
    if (!mods || typeof mods !== 'object') continue; out.by[who] = {};
    for (const [id, m] of Object.entries(mods as Record<string, any>)) {
      if (!m || typeof m !== 'object') continue;
      const stages = (Array.isArray(m.stages) ? m.stages : []).filter((s: unknown): s is Stage => STAGES.includes(s as Stage));
      out.by[who][id] = { stages: [...new Set<Stage>(stages)], done: typeof m.done === 'string' ? m.done : undefined, hints: Number.isFinite(m.hints) ? m.hints : 0, secs: Number.isFinite(m.secs) ? m.secs : 0, runs: Number.isFinite(m.runs) ? m.runs : 0, ...(Number.isInteger(m.epoch) && m.epoch > 0 ? { epoch: m.epoch } : {}) };
    }
  }
  return out;
}
const get = (p: Progress, who: string, id: string): ModProg => p.by[who]?.[id] ?? { stages: [], hints: 0, secs: 0, runs: 0 };
const put = (p: Progress, who: string, id: string, m: ModProg): Progress => ({ ...p, by: { ...p.by, [who]: { ...(p.by[who] ?? {}), [id]: m } } });
export const stagesDone = (p: Progress, who: string, id: string): Stage[] => get(p, who, id).stages;
export const isComplete = (p: Progress, who: string, id: string): boolean => !!get(p, who, id).done;
export const completedCount = (p: Progress, who: string): number => Object.values(p.by[who] ?? {}).filter(m => m.done).length;
export function recordStage(p: Progress, who: string, id: string, stage: Stage): Progress {
  const m = get(p, who, id); return m.stages.includes(stage) ? p : put(p, who, id, { ...m, stages: [...m.stages, stage] });
}
/** The tick is earned by finishing both checks. Asking for it any other way changes nothing. */
export function completeModule(p: Progress, who: string, id: string, extra: { hints: number; secs: number }, now = new Date()): Progress {
  const m = get(p, who, id); if (!m.stages.includes('check1') || !m.stages.includes('check2')) return p;
  const stages = m.stages.includes('gratify') ? m.stages : [...m.stages, 'gratify' as Stage];
  return put(p, who, id, { stages, done: m.done ?? now.toISOString(), hints: extra.hints, secs: extra.secs, runs: m.runs + 1 });
}
/** Start over for this person (the tick stays until they finish again). */
export const resetModule = (p: Progress, who: string, id: string): Progress => { const m = get(p, who, id); return put(p, who, id, { ...m, stages: m.done ? m.stages : [] }); };
/** The module to suggest after `exceptId`: the first one not finished, with "suggested first" modules ahead of the rest. */
export function nextSuggested(mods: readonly { id: string; suggestedFirst?: boolean }[], p: Progress, who: string, exceptId?: string): string | undefined {
  const open = mods.filter(m => m.id !== exceptId && !isComplete(p, who, m.id));
  return (open.find(m => m.suggestedFirst) ?? open[0])?.id;
}

// ── sharing between registers (CloudKit patch 6c, decisions items 15 and O1) ──────────────────────
export const epochOf = (m: ModProg | undefined): number => m?.epoch ?? 0;
const sameMod = (a: ModProg, b: ModProg): boolean => a.stages.join() === b.stages.join() && a.done === b.done && a.hints === b.hints && a.secs === b.secs && a.runs === b.runs && epochOf(a) === epochOf(b);
export const sameModule = (a: ModProg | undefined, b: ModProg | undefined): boolean => (!a || !b ? a === b : sameMod(a, b));

/**
 * Two registers' record of one person in one module. A reset is deliberate and later than the work it wipes, so the higher reset count wins whole.
 * With the same count the work from both is kept: stages from either, the earliest finish, and the larger run count with its hints and time.
 */
export function mergeModule(a: ModProg | undefined, b: ModProg | undefined): ModProg | undefined {
  if (!a || !b) return a ?? b;
  const ea = epochOf(a), eb = epochOf(b); if (ea !== eb) return ea > eb ? a : b;
  const stages = STAGES.filter(s => a.stages.includes(s) || b.stages.includes(s));
  const done = [a.done, b.done].filter((d): d is string => !!d).sort()[0];
  // The side with more runs supplies hints and time. With the same count the larger of each is kept, so the answer does not depend on the order.
  const lead = b.runs > a.runs ? b : a.runs > b.runs ? a : undefined;
  return { stages, ...(done ? { done } : {}), hints: lead ? lead.hints : Math.max(a.hints, b.hints), secs: lead ? lead.secs : Math.max(a.secs, b.secs), runs: Math.max(a.runs, b.runs), ...(ea > 0 ? { epoch: ea } : {}) };
}
export function mergeProgress(a: Progress, b: Progress): Progress {
  const out = emptyProgress();
  for (const who of new Set([...Object.keys(a.by), ...Object.keys(b.by)])) {
    for (const id of new Set([...Object.keys(a.by[who] ?? {}), ...Object.keys(b.by[who] ?? {})])) {
      const m = mergeModule(a.by[who]?.[id], b.by[who]?.[id]); if (m) (out.by[who] ??= {})[id] = m;
    }
  }
  return out;
}
/** A full reset (the tick too), unlike `resetModule`, which keeps the tick. The reset count goes up so the other registers take it over the old work. */
export const resetModuleFully = (p: Progress, who: string, id: string): Progress => { const m = p.by[who]?.[id]; return m ? put(p, who, id, { stages: [], hints: 0, secs: 0, runs: 0, epoch: epochOf(m) + 1 }) : p; };
export const resetAllFully = (p: Progress, who: string): Progress => Object.keys(p.by[who] ?? {}).reduce((q, id) => resetModuleFully(q, who, id), p);
/** Owners reset anyone's progress. Managers reset roles below manager only. Cashiers reset nobody's. */
export const canResetProgress = (actor: 'cashier' | 'manager' | 'owner', target: 'cashier' | 'manager' | 'owner'): boolean => actor === 'owner' || (actor === 'manager' && target === 'cashier');
