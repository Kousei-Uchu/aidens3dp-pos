// Location: src/lib/cloudkit/backendFlagIO.ts
// CloudKit sync, patch 8: where this till remembers which backend it uses, on this iPad only (decisions item 16: if the flag synced, one wrong
// flip would move every till at once). The flag value is a plain string, as the app already stored `force_meta`. Writes stop on the practice
// guard, because changing where the shop's data is kept is never part of a practice run.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_FLAG_KEY, readFlag, type BackendFlag } from '../backendChoice';
import { TrainingBlockedError, isTraining } from '../trainingGuard';

export const CAUGHT_UP_KEY = 'cloudkit.caughtUp';

export const backendFlagStore = {
  async get(): Promise<BackendFlag> { try { return readFlag(await AsyncStorage.getItem(BACKEND_FLAG_KEY)); } catch { return null; } },
  async set(v: BackendFlag): Promise<void> {
    if (isTraining()) throw new TrainingBlockedError('changing where shared data is kept');
    if (v === null) await AsyncStorage.removeItem(BACKEND_FLAG_KEY); else await AsyncStorage.setItem(BACKEND_FLAG_KEY, v);
  },
};

/** Whether this till has already sent the sales it finished while the import was running. Set once, after it succeeds. */
export const caughtUpStore = {
  async get(): Promise<boolean> { try { return (await AsyncStorage.getItem(CAUGHT_UP_KEY)) === '1'; } catch { return false; } },
  async set(): Promise<void> { if (isTraining()) throw new TrainingBlockedError('changing where shared data is kept'); await AsyncStorage.setItem(CAUGHT_UP_KEY, '1'); },
};
