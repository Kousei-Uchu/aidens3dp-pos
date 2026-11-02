// Location: src/lib/cloudkit/noticeCloud.ts
// CloudKit sync, patch 6a (notices, transport half): the shared cash and refund notices written to and read from CloudKit records.
// It joins the pure pieces (noticeShared.ts) to a small native interface. The native module is passed in, so the flow is tested with
// an in-memory fake and no iPad (tests/noticecloud.test.ts). Nothing reaches it unless the CloudKit backend is the active one.
// Decisions: dev_docs/CLOUDKIT_SYNC_DECISIONS.md item 10, Q2.
import type { Notice } from '../types';
import { noticeFromFields, noticeHandle, noticeHandleFromRecord, noticeToFields, noticesToUpload, type SharedNotice } from '../noticeShared';
import { pageAll, PAGE_SIZE } from './drawerCloud';

type Rec = Record<string, any>;
type Page = { rows: Rec[]; next: string | null };

/** What notices need of the native module. */
export type NoticeNative = {
  /** Write one notice if it is not there yet. A notice that already exists is returned as it is, never changed. */
  putNotice(handle: string, fields: Rec): Promise<Rec>;
  listNotices(limit: number, after?: string | null): Promise<Page>;
};

/** Every shared notice in CloudKit, from every register. Records that cannot be read are skipped. */
export async function pullCloudNotices(n: NoticeNative): Promise<SharedNotice[]> {
  const out: SharedNotice[] = [];
  for (const r of await pageAll(after => n.listNotices(PAGE_SIZE, after))) {
    const handle = noticeHandleFromRecord(String(r.recordName ?? '')); const s = handle ? noticeFromFields(handle, r) : null;
    if (s) out.push(s);
  }
  return out;
}

/** Upload one notice as it is raised. Written once under its own name, so repeating this is safe. */
export async function pushCloudNotice(n: NoticeNative, registerId: string, registerName: string, notice: Notice): Promise<void> {
  await n.putNotice(noticeHandle(registerId, notice.id), noticeToFields(registerId, registerName, notice));
}

/** Upload this register's own notices CloudKit lacks (see `noticesToUpload`), oldest first. Safe to repeat. Returns how many were new. */
export async function pushCloudNotices(n: NoticeNative, registerId: string, registerName: string, local: Notice[], now: number): Promise<number> {
  const remote = new Set<string>();
  for (const r of await pageAll(after => n.listNotices(PAGE_SIZE, after))) { const h = noticeHandleFromRecord(String(r.recordName ?? '')); if (h) remote.add(h); }
  const todo = noticesToUpload(registerId, local, remote, now);
  for (const notice of todo) await pushCloudNotice(n, registerId, registerName, notice);
  return todo.length;
}
