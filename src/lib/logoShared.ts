// Location: src/lib/logoShared.ts
// CloudKit sync, patch 6a (the logo): the uploaded logo image, shared between registers.
//
// Decisions (dev_docs/CLOUDKIT_SYNC_DECISIONS.md item 14): the branding logo syncs as an iCloud asset, so a new register shows the shop's
// logo without a backup restore. The only logo image the app stores is the one uploaded under Settings ▸ Screensaver & display
// (`screensaver.logoFile`, a file on this iPad). That is what is shared. The https link beside it stays per device: a link is not an image.
//
// One record, `logo-current`, holds the image as a CloudKit asset plus plain fields (hash, type, size, who and when). Removing the logo
// writes the same record with `removed` set and no asset, so the removal reaches the other registers too.
// Each register keeps `logoBase` (device only): the hash both it and the shop last agreed on, the base for telling who changed.
// No React, no files, no native module: tested on its own (tests/logoshared.test.ts).
import { hash53 } from './eventRecords';

export const LOGO_RECORD = 'logo-current';
/** The same ceiling the backup file uses. A bigger image is neither sent nor taken in. */
export const MAX_LOGO_BYTES = 700_000;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type LogoType = (typeof LOGO_TYPES)[number];
export const LOGO_EXT: Record<LogoType, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const BY_EXT: Record<string, LogoType> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

export const isLogoType = (x: unknown): x is LogoType => LOGO_TYPES.includes(x as LogoType);
/** The image type a file name says it is, or null (an SVG, for one, is not supported). */
export const logoTypeOfPath = (path: string): LogoType | null => BY_EXT[(path.split('?')[0].split('.').pop() ?? '').toLowerCase()] ?? null;
/** A short name for the same image bytes. Not a secret. It is of the file's base64 text, so the same file hashes the same on every iPad. */
export const logoHash = (base64: string): string => hash53(base64);

/** What a register holds or the shop holds. `hash` is '' when there is no image (never set, or removed). */
export type LogoState = { hash: string; type?: LogoType; bytes?: number };
/** The shop's side as read back: nothing written yet, the logo was removed, or an image. */
export type RemoteLogo = { kind: 'absent' } | { kind: 'removed' } | { kind: 'image'; hash: string; type: LogoType; bytes: number; registerId: string; registerName: string; ts: string };

export type LogoAction = 'none' | 'push' | 'pull' | 'clear';

/**
 * What to do, given this register's image, the shop's, and `base` (the hash both last agreed on; null when they never have).
 *  - Same on both sides: nothing, and the caller records the hash as the new base.
 *  - The shop has never had a logo: send this register's, if it has one.
 *  - This register changed its logo since the base (added, replaced or removed it): send it. This register wins when both changed.
 *  - Only the shop changed: take the shop's image, or, if it was removed, remove this register's.
 *  - No base (a register that has just joined): the shop's image is taken. If the shop removed its logo and this register has one,
 *    this register's is sent, because deleting a file on a guess is worse than keeping one.
 */
export function decideLogo(local: LogoState, remote: RemoteLogo, base: string | null): LogoAction {
  const l = local.hash; const r = remote.kind === 'image' ? remote.hash : '';
  if (remote.kind === 'absent') return l ? 'push' : 'none';
  if (l === r) return 'none';
  if (base === null) return remote.kind === 'image' ? 'pull' : 'push';
  if (l !== base) return 'push';
  return remote.kind === 'image' ? 'pull' : 'clear';
}

type Fields = Record<string, string | number | boolean>;

/** The plain fields of the logo record, for an image. The image itself travels as the asset. */
export function logoToFields(registerId: string, registerName: string, s: { hash: string; type: LogoType; bytes: number }, ts: string): Fields {
  return { hash: s.hash, mime: s.type, bytes: s.bytes, removed: 0, ts, registerId, registerName };
}
/** The plain fields for a removal. */
export const logoRemovedFields = (registerId: string, registerName: string, ts: string): Fields => ({ hash: '', mime: '', bytes: 0, removed: 1, ts, registerId, registerName });

const isRemoved = (x: unknown): boolean => x === 1 || x === true || x === '1';

/** Reads the record's fields. A record that is not a readable logo is treated as absent, so one bad record cannot break the poll. */
export function logoFromFields(f: Record<string, unknown> | null | undefined): RemoteLogo {
  if (!f) return { kind: 'absent' };
  if (isRemoved(f.removed)) return { kind: 'removed' };
  const bytes = Number(f.bytes);
  if (typeof f.hash !== 'string' || !f.hash || !isLogoType(f.mime) || !Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_LOGO_BYTES) return { kind: 'absent' };
  return { kind: 'image', hash: f.hash, type: f.mime, bytes, registerId: typeof f.registerId === 'string' ? f.registerId : '', registerName: typeof f.registerName === 'string' ? f.registerName : '', ts: typeof f.ts === 'string' ? f.ts : '' };
}
