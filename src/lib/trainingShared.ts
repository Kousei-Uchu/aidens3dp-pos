// Location: src/lib/trainingShared.ts
// CloudKit sync, patch 6c (training progress): one record per person per module, `training-<staff id>-<module id>`, so progress follows the
// person across iPads (decisions item 15). Pure: no React, no files, no native module (tests/trainingshared.test.ts). The merge rules are in
// trainingProgress.ts. Training and demo data are never sent, only these marks.
import { STAGES, type Stage } from './trainingModule';
import { epochOf, type ModProg, type Progress } from './trainingProgress';

const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;
export const isTrainingId = (x: unknown): x is string => typeof x === 'string' && ID_RE.test(x);
/** The part of the record name after `training-`. Both ids are checked, so the name cannot be bent into another one. */
export const trainingHandle = (who: string, module: string): string => { if (!isTrainingId(who) || !isTrainingId(module)) throw new Error('Bad training id.'); return `${who}-${module}`; };

type Fields = Record<string, string | number>;
export function trainingToFields(who: string, module: string, m: ModProg, registerId: string, registerName: string, ts: string): Fields {
  return { who, module, stages: m.stages.join(','), done: m.done ?? '', hints: m.hints, secs: m.secs, runs: m.runs, epoch: epochOf(m), ts, registerId, registerName };
}
/** One record read back, or null when it is not a readable progress record. */
export function trainingFromFields(f: Record<string, unknown>): { who: string; module: string; mod: ModProg } | null {
  if (!isTrainingId(f.who) || !isTrainingId(f.module)) return null;
  const n = (x: unknown): number => (Number.isFinite(Number(x)) && Number(x) >= 0 ? Math.floor(Number(x)) : 0);
  const listed = typeof f.stages === 'string' ? f.stages.split(',') : [];
  const stages = STAGES.filter((s): s is Stage => listed.includes(s));
  const epoch = n(f.epoch);
  return { who: f.who, module: f.module, mod: { stages, done: typeof f.done === 'string' && f.done ? f.done : undefined, hints: n(f.hints), secs: n(f.secs), runs: n(f.runs), ...(epoch > 0 ? { epoch } : {}) } };
}
export function progressFromRecords(rows: Record<string, unknown>[]): Progress {
  const out: Progress = { v: 1, by: {} };
  for (const r of rows) { const t = trainingFromFields(r); if (t) (out.by[t.who] ??= {})[t.module] = t.mod; }
  return out;
}
