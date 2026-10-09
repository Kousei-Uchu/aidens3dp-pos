// Location: src/lib/screensaver.ts
// Screensaver settings and the pure rules for when it should show. No React Native imports, so it runs in the node tests.
export type ScreensaverSettings = {
  enabled: boolean; idleMinutes: number; showWhenLoggedOut: boolean; lockedSeconds: number;
  keepAwake: boolean; bgColor: string; logoUrl: string; logoFile: string; drift: boolean; showClock: boolean;
};
export const defaultScreensaver = (): ScreensaverSettings => ({
  enabled: false, idleMinutes: 3, showWhenLoggedOut: true, lockedSeconds: 15,
  keepAwake: true, bgColor: '#111111', logoUrl: '', logoFile: '', drift: true, showClock: false,
});

export const IDLE_CHOICES = [1, 2, 5, 10, 30] as const;
export const LOCKED_CHOICES = [5, 15, 30, 60] as const;
export const SWATCHES = ['#111111', '#FFFFFF', '#F5EFE6', '#1E3A5F', '#14532D', '#7F1D1D', '#4C1D95', '#C2410C'] as const;

/** '#abc', 'abc', '#AABBCC' -> '#aabbcc'. Returns null when it isn't a colour. */
export function normaliseHex(input: string): string | null {
  let h = input.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(h)) h = h.split('').map(ch => ch + ch).join('');
  return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : null;
}
/** Readable text colour on top of a background colour. */
export function contrastOn(hex: string): '#FFFFFF' | '#111111' {
  const h = normaliseHex(hex) ?? '#111111';
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111111' : '#FFFFFF';
}
/** Local file wins over a link; an https link is required (iOS blocks plain http). */
export function logoSource(s: Pick<ScreensaverSettings, 'logoFile' | 'logoUrl'>): { uri: string } | null {
  if (s.logoFile) return { uri: s.logoFile };
  const u = s.logoUrl.trim();
  return /^https:\/\//i.test(u) ? { uri: u } : null;
}

/** A card payment started recently is still waiting on the reader: the iPad sees no touches, but the till is busy. */
export function paymentActive(attempts: { status: string; ts: string }[], nowMs: number, windowMs = 5 * 60_000): boolean {
  return attempts.some(a => a.status === 'started' && nowMs - Date.parse(a.ts) < windowMs);
}

export function shouldShowScreensaver(i: { enabled: boolean; showWhenLoggedOut: boolean; locked: boolean; idleMs: number; idleMinutes: number; lockedSeconds: number; paymentActive: boolean }): boolean {
  if (!i.enabled || i.paymentActive) return false;
  const normal = Math.max(1, i.idleMinutes) * 60_000;
  const limit = i.locked && i.showWhenLoggedOut ? Math.min(normal, Math.max(5, i.lockedSeconds) * 1000) : normal;
  return i.idleMs >= limit;
}
