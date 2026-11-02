// Location: src/lib/cloudkit/logoCloud.ts
// CloudKit sync, patch 6a (the logo, transport half): the shared logo written to and read from one CloudKit record with an asset.
// It joins the pure pieces (logoShared.ts) to a small native interface. The native module is passed in, so the flow is tested with an
// in-memory fake and no iPad (tests/logocloud.test.ts). Nothing reaches it unless the CloudKit backend is the active one.
// Decisions: dev_docs/CLOUDKIT_SYNC_DECISIONS.md item 14.
import { logoFromFields, logoRemovedFields, logoToFields, type LogoType, type RemoteLogo } from '../logoShared';

type Rec = Record<string, any>;

/** What the logo needs of the native module. Reading the fields and fetching the image are separate, so a poll that finds nothing new never downloads the image. */
export type LogoNative = {
  /** Create or change the one logo record. `filePath` is the image file to attach as the asset, or null for a removal (the asset is cleared). */
  putLogo(fields: Rec, filePath: string | null): Promise<Rec>;
  /** The logo record's plain fields, or null when there is none. Does not download the image. */
  getLogo(): Promise<Rec | null>;
  /** Download the image to a temporary file and return its path, or null when the record has no image. */
  downloadLogo(): Promise<string | null>;
};

/** The shop's logo as it stands. A record that cannot be read counts as absent. */
export async function readCloudLogo(n: LogoNative): Promise<RemoteLogo> {
  return logoFromFields(await n.getLogo());
}

/** Upload this register's image. Safe to repeat: it overwrites the same record with the same content. */
export async function pushCloudLogo(n: LogoNative, registerId: string, registerName: string, image: { hash: string; type: LogoType; bytes: number; path: string }, ts: string): Promise<void> {
  await n.putLogo(logoToFields(registerId, registerName, image, ts), image.path);
}

/** Tell the shop the logo was removed. */
export async function pushCloudLogoRemoved(n: LogoNative, registerId: string, registerName: string, ts: string): Promise<void> {
  await n.putLogo(logoRemovedFields(registerId, registerName, ts), null);
}

/** Fetch the shop's image to a temporary file. Null when there is none. */
export const downloadCloudLogo = (n: LogoNative): Promise<string | null> => n.downloadLogo();
