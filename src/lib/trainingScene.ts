// Location: src/lib/trainingScene.ts
// Plays a scene (Info and Show stages) one beat at a time. Pure: the view just draws what this returns.
import type { Actor, Scene, Tone } from './trainingModule';

export type ActorView = { id: string; icon: string; label?: string; x: number; y: number; hidden: boolean; tone: Tone; pulse: boolean };
export type SceneView = { index: number; total: number; say: string; actors: ActorView[]; last: boolean };

/** What the scene looks like after beat `index` (0 based) has played. Out of range indexes are clamped. */
export function sceneAt(scene: Scene, index: number): SceneView {
  const total = scene.beats.length; const n = Math.max(0, Math.min(index, total - 1));
  const state = new Map<string, Actor & { tone: Tone }>(scene.actors.map(a => [a.id, { ...a, tone: a.tone ?? 'neutral' }]));
  let pulse = new Set<string>(); let say = '';
  for (let i = 0; i <= n && i < total; i++) {
    const b = scene.beats[i]; say = b.say; pulse = new Set(b.pulse ?? []);
    for (const [id, p] of Object.entries(b.place ?? {})) { const a = state.get(id); if (a) { if (p.x !== undefined) a.x = p.x; if (p.y !== undefined) a.y = p.y; } }
    for (const id of b.show ?? []) { const a = state.get(id); if (a) a.hidden = false; }
    for (const id of b.hide ?? []) { const a = state.get(id); if (a) a.hidden = true; }
    for (const [id, t] of Object.entries(b.tone ?? {})) { const a = state.get(id); if (a) a.tone = t; }
  }
  return { index: n, total, say, last: n >= total - 1, actors: [...state.values()].map(a => ({ id: a.id, icon: a.icon, label: a.label, x: a.x, y: a.y, hidden: !!a.hidden, tone: a.tone, pulse: pulse.has(a.id) })) };
}
/** Milliseconds to hold a beat in autoplay: reading time for the sentence, never shorter than 2.2 s. */
export const beatMs = (say: string): number => Math.max(2200, 900 + say.split(/\s+/).filter(Boolean).length * 330);
