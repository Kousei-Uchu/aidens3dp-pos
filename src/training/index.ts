// Location: src/training/index.ts
// Every training module the app knows about, in the order the hub lists them. Add a module here once its file exists.
import type { TrainingModule } from '../lib/trainingModule';
import { welcome } from './modules/welcome';

export const MODULES: TrainingModule[] = [welcome];
export const getModule = (id: string): TrainingModule | undefined => MODULES.find(m => m.id === id);
