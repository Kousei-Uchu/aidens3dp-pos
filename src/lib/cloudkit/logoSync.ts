// Location: src/lib/cloudkit/logoSync.ts
// CloudKit sync, patch 6a (the logo, call site): one reconcile per poll that sends this register's logo, takes the shop's, or removes it.
// As with notices, everything the app supplies is passed in, so the rules are tested without an iPad (tests/logosync.test.ts).
// The app's one instance is made in sync.ts. Decisions: dev_docs/CLOUDKIT_SYNC_DECISIONS.md item 14.
import { decideLogo, MAX_LOGO_BYTES, type LogoState, type LogoType } from '../logoShared';
import { downloadCloudLogo, pushCloudLogo, pushCloudLogoRemoved, readCloudLogo, type LogoNative } from './logoCloud';

/** This register's image file, as read from disk. `tooBig` is an image over the size limit, which is never sent. */
export type LocalLogo = { path: string; hash: string; type: LogoType; bytes: number } | { tooBig: true } | null;

export type LogoSyncDeps = {
  /** True only when the CloudKit backend is the one in use. */
  active: () => boolean;
  /** True in practice mode, when nothing is ever sent or taken in. */
  training: () => boolean;
  who: () => { id: string; name: string };
  native: () => Promise<LogoNative>;
  /** The uploaded logo file on this iPad, hashed (the app caches the hash per path), or null when there is none. */
  readLocal: () => Promise<LocalLogo>;
  /** Hash and size of a downloaded file, or null when it is not a readable image of an allowed type. */
  inspect: (path: string) => Promise<{ hash: string; type: LogoType; bytes: number } | null>;
  /** Put the downloaded image in place as this register's logo, replacing and deleting the old file. */
  install: (tempPath: string, type: LogoType) => Promise<void>;
  /** Remove this register's uploaded logo. */
  clear: () => Promise<void>;
  /** The hash both this register and the shop last agreed on (device only). */
  base: () => string | null;
  setBase: (hash: string) => void;
  now?: () => string;
};

export type LogoResult = 'none' | 'pushed' | 'pulled' | 'cleared';

export function createLogoSync(d: LogoSyncDeps) {
  const now = d.now ?? (() => new Date().toISOString());
  let running = false;
  return {
    /**
     * Compare this register's logo with the shop's and act on it (see `decideLogo`). Returns what was done, or null when nothing was
     * attempted (not active, practice mode, no register id, already running) or it failed. Never throws: the next poll tries again.
     * A failure changes nothing here, and the base moves only after the shop and this register truly agree.
     */
    async run(): Promise<LogoResult | null> {
      if (!d.active() || d.training() || running) return null;
      const w = d.who(); if (!w.id) return null;
      running = true;
      try {
        const n = await d.native();
        const local = await d.readLocal();
        if (local && 'tooBig' in local) return 'none'; // never sent, and the shop's is not allowed to replace it unseen either
        const state: LogoState = local ? { hash: local.hash, type: local.type, bytes: local.bytes } : { hash: '' };
        const remote = await readCloudLogo(n);
        const action = decideLogo(state, remote, d.base());
        if (action === 'none') { if (remote.kind !== 'absent') d.setBase(state.hash); return 'none'; }
        if (action === 'push') {
          if (local) await pushCloudLogo(n, w.id, w.name, local, now()); else await pushCloudLogoRemoved(n, w.id, w.name, now());
          d.setBase(state.hash); return 'pushed';
        }
        if (action === 'clear') { await d.clear(); d.setBase(''); return 'cleared'; }
        // pull: the image is checked before it replaces anything, so a damaged or swapped file leaves this register's logo as it was
        const tmp = await downloadCloudLogo(n); if (!tmp) return null;
        const got = await d.inspect(tmp);
        if (!got || remote.kind !== 'image' || got.hash !== remote.hash || got.bytes > MAX_LOGO_BYTES) return null;
        await d.install(tmp, got.type); d.setBase(got.hash); return 'pulled';
      } catch { return null; } finally { running = false; }
    },
  };
}
export type LogoSync = ReturnType<typeof createLogoSync>;
