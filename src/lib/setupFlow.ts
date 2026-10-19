// Location: src/lib/setupFlow.ts
// The setup flow (Companion plan, patch 0176): the few things a new device needs before it is useful, as data rather
// than as screens, so the same list drives the setup screen, its progress line and the tests.
//
// Nothing here blocks the app. The setup screen is a checklist: each step says how to do it, whether it is done, and
// goes away when the person is finished. A shop that wants to look around first can finish with steps undone, and the
// Device mode page can open the checklist again later.
import type { RegisterFeatures } from './appMode';

export type SetupProfile = 'register' | 'companion';
export const SETUP_PROFILES: SetupProfile[] = ['register', 'companion'];

/** What the setup steps look at. Plain values, so a test can build one without a store or a keychain. */
export type SetupContext = {
  shopify: boolean; // the shop domain and the app's credentials are saved
  ownerPin: boolean; // a PIN is required and an owner with a PIN exists
  registerNamed: boolean; // this register was given a name of its own
  anyFeature: boolean; // a Companion has at least one register feature switched on
};

export type SetupStep = {
  id: 'shopify' | 'pin' | 'name' | 'features';
  profiles: SetupProfile[];
  title: string;
  summary: string;
  done: (c: SetupContext) => boolean;
};

export const SETUP_STEPS: SetupStep[] = [
  {
    id: 'shopify', profiles: ['register', 'companion'], title: 'Connect Shopify',
    summary: 'The shop domain, the app credentials and a location. Sync, stock, orders and gift cards all need it.',
    done: c => c.shopify,
  },
  {
    id: 'pin', profiles: ['register', 'companion'], title: 'Create the owner PIN',
    summary: 'A PIN for the owner, so staff have their own sign-in and the app can lock. A companion needs one before it can lock itself.',
    done: c => c.ownerPin,
  },
  {
    id: 'name', profiles: ['register'], title: 'Name this register',
    summary: 'Something you would recognise on a receipt or in the orders list, for example "Counter" or "Back room".',
    done: c => c.registerNamed,
  },
  {
    id: 'features', profiles: ['companion'], title: 'Choose its features',
    summary: 'A companion starts with the register features off. Turn on the ones this phone or tablet needs.',
    done: c => c.anyFeature,
  },
];

/** The steps for one profile, in order. */
export const setupSteps = (profile: SetupProfile): SetupStep[] => SETUP_STEPS.filter(s => s.profiles.includes(profile));

/** Our best first step for the profile, or undefined when every step is done. */
export function firstUnfinished(profile: SetupProfile, ctx: SetupContext): SetupStep | undefined {
  return setupSteps(profile).find(s => !s.done(ctx));
}

/** How many steps are done, for "2 of 4 done" and for the progress bar. */
export function setupProgress(profile: SetupProfile, ctx: SetupContext): { done: number; total: number } {
  const steps = setupSteps(profile);
  return { done: steps.filter(s => s.done(ctx)).length, total: steps.length };
}

export const setupFinished = (profile: SetupProfile, ctx: SetupContext) => !firstUnfinished(profile, ctx);

/**
 * The steps' view of a device. `shopifyConnected` comes from the keychain (hasCreds()), which this pure module cannot
 * read, so the screen passes it in.
 */
export function setupContext(
  settings: { requirePin?: boolean; staff?: { role: string; pinHash?: string }[]; registerName?: string; registerFeatures?: unknown },
  shopifyConnected: boolean,
): SetupContext {
  const features = (settings.registerFeatures ?? {}) as Partial<RegisterFeatures>;
  return {
    shopify: shopifyConnected,
    ownerPin: !!settings.requirePin && (settings.staff ?? []).some(m => m.role === 'owner' && !!m.pinHash),
    registerNamed: (settings.registerName ?? '').trim() !== '' && settings.registerName !== DEFAULT_REGISTER_NAME,
    anyFeature: Object.values(features).some(v => v === true),
  };
}

/** The name defaultSettings() gives a new register, so leaving it alone can be told apart from naming the register. */
export const DEFAULT_REGISTER_NAME = 'Register 1';
