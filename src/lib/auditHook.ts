// Location: src/lib/auditHook.ts
// A one-line hand-over so the assistant's log can tell the CloudKit audit sync that an event was just written, without the log importing the
// sync code (which would be a cycle). sync.ts sets it once; assistantLogIO.ts calls it after every append. Nothing else.
import type { LogEvent } from './assistantLog';

let hook: ((e: LogEvent) => void) | null = null;
export const setAuditHook = (fn: ((e: LogEvent) => void) | null): void => { hook = fn; };
/** Never throws: a problem in the hook must not break the log. */
export const fireAuditHook = (e: LogEvent): void => { try { hook?.(e); } catch { /* the catch-up covers it */ } };
