// Location: src/lib/cloudkit/trainingSync.ts
// CloudKit sync, patch 6c (training progress, transport and call site): once per poll, read every person's progress from the shop, join it
// with this register's, keep the joined result here, and write back only the records that differ. The app supplies the local progress, so the
// rules are tested without an iPad (tests/trainingsync.test.ts). The app's one instance is made in sync.ts. Decisions: item 15, O1.
import { mergeModule, mergeProgress, sameModule, type Progress } from '../trainingProgress';
import { progressFromRecords, trainingHandle, trainingToFields } from '../trainingShared';
import { pageAll, PAGE_SIZE } from './drawerCloud';

type Rec = Record<string, any>;
export type TrainingNative = {
  /** Create or change one person's record for one module. */
  putTraining(handle: string, fields: Rec): Promise<Rec>;
  listTraining(limit: number, after?: string | null): Promise<{ rows: Rec[]; next: string | null }>;
};
export type TrainingSyncDeps = {
  active: () => boolean;
  /** True in practice mode. Marks made there are kept here but sent later, never during the practice. */
  training: () => boolean;
  who: () => { id: string; name: string };
  native: () => Promise<TrainingNative>;
  /** This register's progress, loaded from the device. */
  getLocal: () => Promise<Progress>;
  /** Replace this register's progress. Called with the join of the shop's and whatever is here at that moment. */
  setLocal: (p: Progress) => Promise<void>;
  now?: () => string;
};
export type TrainingResult = { taken: number; sent: number };

export function createTrainingSync(d: TrainingSyncDeps) {
  const now = d.now ?? (() => new Date().toISOString());
  let running = false;
  return {
    /** Never throws: the next poll tries again. Returns null when nothing was attempted or it failed. */
    async run(): Promise<TrainingResult | null> {
      if (!d.active() || d.training() || running) return null;
      const w = d.who(); if (!w.id) return null;
      running = true;
      try {
        const n = await d.native();
        const remote = progressFromRecords(await pageAll(after => n.listTraining(PAGE_SIZE, after)));
        const local = await d.getLocal();
        const joined = mergeProgress(local, remote);
        let taken = 0;
        for (const [who, mods] of Object.entries(joined.by)) for (const [id, m] of Object.entries(mods)) if (!sameModule(local.by[who]?.[id], m)) taken++;
        if (taken) { await d.setLocal(mergeProgress(await d.getLocal(), remote)); } // read again: a mark made while this ran is kept
        let sent = 0;
        for (const [who, mods] of Object.entries(joined.by)) for (const [id, m] of Object.entries(mods)) {
          if (sameModule(remote.by[who]?.[id], m)) continue;
          let h: string; try { h = trainingHandle(who, id); } catch { continue; }
          await n.putTraining(h, trainingToFields(who, id, mergeModule(remote.by[who]?.[id], m) ?? m, w.id, w.name, now())); sent++;
        }
        return { taken, sent };
      } catch { return null; } finally { running = false; }
    },
  };
}
export type TrainingSync = ReturnType<typeof createTrainingSync>;
