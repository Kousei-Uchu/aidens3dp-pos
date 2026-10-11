// Location: src/lib/trainingProgress.ts
// Who has finished which module. Stored on this device only, keyed by staff id. Pure; the store reads and writes it.
import { STAGES, type Stage } from './trainingModule';

export type ModProg = { stages: Stage[]; done?: string; hints: number; secs: number; runs: number };
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
      out.by[who][id] = { stages: [...new Set<Stage>(stages)], done: typeof m.done === 'string' ? m.done : undefined, hints: Number.isFinite(m.hints) ? m.hints : 0, secs: Number.isFinite(m.secs) ? m.secs : 0, runs: Number.isFinite(m.runs) ? m.runs : 0 };
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
