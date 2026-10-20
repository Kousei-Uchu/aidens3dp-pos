// Location: src/state/stepUp.ts
// The PIN prompt that Companion mode shows before a sensitive action. In memory only: whoever asks gets a promise that
// resolves true when the signed-in person typed their PIN, or false when they gave up (or were locked out for too many tries).
import { create } from 'zustand';
import type { StepUpAction } from '../lib/stepUp';

type StepUpState = { ask?: { action: StepUpAction; resolve: (ok: boolean) => void }; open: (action: StepUpAction) => Promise<boolean>; close: (ok: boolean) => void };
export const useStepUp = create<StepUpState>((set, get) => ({
  open: action => new Promise<boolean>(resolve => { get().ask?.resolve(false); set({ ask: { action, resolve } }); }), // a second prompt cancels the first
  close: ok => { const a = get().ask; set({ ask: undefined }); a?.resolve(ok); },
}));
