// Location: src/training/index.ts
// Every training module the app knows about, in the order the hub lists them. Add a module here once its file exists.
import type { TrainingModule } from '../lib/trainingModule';
import { welcome } from './modules/welcome';
import { signIn } from './modules/sign-in';
import { cart } from './modules/cart';
import { findItems } from './modules/find-items';
import { payCard } from './modules/pay-card';

export const MODULES: TrainingModule[] = [welcome, signIn, cart, findItems, payCard];
export const getModule = (id: string): TrainingModule | undefined => MODULES.find(m => m.id === id);
