// Location: src/lib/assistantGuide.ts
// "Guide me there" (patch 0162): the assistant offers a button under a reply, and tapping it makes the till point at each control to tap,
// one after the other, from the Checkout tab to a screen. This file is the rules and the small store the pointer reads. It is pure (no React,
// no screen measuring), so it runs in the node tests. The pointer itself is src/ui/AssistantGuide.tsx.
//
// The guide holds no state about where the person is. Every moment it looks at which controls of the walk are on screen and points at the last
// one, so a person who is already part of the way there, or who tapped something else, is picked up wherever they are.
import type { GuideStep, ScreenTarget } from './assistantScreens';

export type Guide = {
  screen: string; name: string; steps: GuideStep[];
  /** How to tell the person has arrived, for screens a tab or a page opens. Views have none, so tapping the last control ends the guide. */
  target?: ScreenTarget;
  /** For a view: controls that live on it. One of them on screen means the person has arrived. */
  arrive?: string[];
  /** Who started it. Another person signing in ends it. */
  staffId?: string;
};
export type GuideNav = { tab: string; /** The name of the page on top, when one is open. */ route?: string };
export type GuideInput = GuideNav & { /** Whether a control is on screen right now. */ mounted: (spot: string) => boolean; /** The last control of a view was tapped. */ finished?: boolean };
export type GuideView = { kind: 'point'; index: number; of: number; step: GuideStep } | { kind: 'done' } | { kind: 'lost' };

/** A guide that is left alone this long ends by itself. */
export const GUIDE_MAX_MS = 10 * 60 * 1000;
/** How long "You are there" stays up. */
export const DONE_SHOW_MS = 3500;
export const LOST_LINE = 'I cannot see the next button from here. Go back to the Checkout tab, or tap Stop.';

/** Whether the person is on the screen the guide is for. A tab means that tab with no page open on it; a page means that page on top. */
export function atTarget(t: ScreenTarget | undefined, nav: GuideNav): boolean {
  if (!t) return false;
  return 'tab' in t ? !nav.route && nav.tab === t.tab : nav.route === t.route;
}

/** What to show now: point at a control, say the person is there, or say the way is lost. */
export function guideView(g: Guide, i: GuideInput): GuideView {
  if (g.target ? atTarget(g.target, i) : !!i.finished || (g.arrive ?? []).some(i.mounted)) return { kind: 'done' };
  for (let k = g.steps.length - 1; k >= 0; k--) if (i.mounted(g.steps[k].spot)) return { kind: 'point', index: k, of: g.steps.length, step: g.steps[k] };
  return { kind: 'lost' };
}

/** A tap on this control finishes a view's guide. Screens with a target do not need it: arriving is seen from the navigation. */
export const pressedLast = (g: Guide, spot: string): boolean => !g.target && g.steps.length > 0 && g.steps[g.steps.length - 1].spot === spot;

export const progressLabel = (index: number, of: number): string => `Step ${index + 1} of ${of}`;
export const doneLine = (name: string): string => `You are there: ${name}.`;

// ---------- the one active guide ----------
let active: Guide | null = null; let version = 0; const subs = new Set<() => void>();
const bump = () => { version++; subs.forEach(f => f()); };
/** Starts a guide, replacing any other. A guide with no steps is not started, because there is nothing to point at. */
export function startGuide(g: Guide): boolean {
  if (!g.steps.length) return false;
  active = { ...g, steps: g.steps.map(s => ({ ...s })) }; bump(); return true;
}
export function stopGuide(): void { if (active) { active = null; bump(); } }
export const currentGuide = (): Guide | null => active;
export const guideVersion = (): number => version;
export const subscribeGuide = (f: () => void): (() => void) => { subs.add(f); return () => { subs.delete(f); }; };
