// Location: src/training/index.ts
// Every training module the app knows about, in the order the hub lists them. Add a module here once its file exists.
import type { TrainingModule } from '../lib/trainingModule';
import { welcome } from './modules/welcome';
import { signIn } from './modules/sign-in';
import { cart } from './modules/cart';
import { findItems } from './modules/find-items';

export const MODULES: TrainingModule[] = [welcome, signIn, cart, findItems];
export const getModule = (id: string): TrainingModule | undefined => MODULES.find(m => m.id === id);
