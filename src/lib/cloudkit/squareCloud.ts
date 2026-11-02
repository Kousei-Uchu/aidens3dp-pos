// Location: src/lib/cloudkit/squareCloud.ts
// CloudKit sync, patch 6a (Square history shards, transport half): the month files and their manifest written to and read from CloudKit.
// It joins the pure rules (squareHistoryShared.ts) to a small native interface. The native module is passed in, so the flow is tested with an
// in-memory fake and no iPad (tests/squaresync.test.ts). Nothing reaches it unless the CloudKit backend is the active one.
import { manifestFromFields, manifestToFields, shardHandle, shardToFields, type RemoteSquare, type ShardEntry, type ShardMeta } from '../squareHistoryShared';

type Rec = Record<string, any>;

/** What the history needs of the native module. */
export type SquareNative = {
  /** Write one month's shard once. A shard is named by month and shared id, so a second write of the same name changes nothing. `filePath` is the packed copy to attach. */
  putSquareShard(handle: string, fields: Rec, filePath: string): Promise<Rec>;
  /** The manifest's plain fields plus `tag` (CloudKit's change tag for the record), or null when there is none. */
  getSquareManifest(): Promise<Rec | null>;
  /** Write the manifest only if it is still at `expectedTag` (null when it should not exist yet). `changed` is true when someone else wrote first and nothing was written. */
  putSquareManifest(fields: Rec, expectedTag: string | null): Promise<{ changed: boolean; tag?: string }>;
  /** Download one shard to a temporary file and return its path, or null when it is not there. */
  downloadSquareShard(handle: string): Promise<string | null>;
};

export const readCloudSquare = async (n: SquareNative): Promise<RemoteSquare> => manifestFromFields(await n.getSquareManifest());

export async function uploadShard(n: SquareNative, registerId: string, registerName: string, e: ShardEntry, path: string, ts: string): Promise<void> {
  await n.putSquareShard(shardHandle(e.month, e.sid), shardToFields(e, registerId, registerName, ts), path);
}

/** Replace the manifest. False means another register wrote first, and nothing was changed. */
export async function writeCloudManifest(n: SquareNative, entries: Record<string, ShardEntry>, meta: ShardMeta, registerId: string, registerName: string, expectedTag: string | null, ts: string): Promise<boolean> {
  const r = await n.putSquareManifest(manifestToFields(entries, meta, registerId, registerName, ts), expectedTag);
  return !r.changed;
}

export const downloadCloudShard = (n: SquareNative, e: ShardEntry): Promise<string | null> => n.downloadSquareShard(shardHandle(e.month, e.sid));
