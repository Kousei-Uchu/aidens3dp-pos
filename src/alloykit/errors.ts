// Location: src/alloykit/errors.ts
// 0250: the two errors an Alloy throws. The app decides what to show; an Alloy only says which kind of trouble it was.

/** The service could not be reached (offline, timed out, DNS, 5xx). Worth retrying; a queued sale stays queued. */
export class AlloyNetworkError extends Error {
  readonly retryable = true;
  constructor(message: string, readonly cause?: unknown) { super(message); this.name = 'AlloyNetworkError'; }
}
/** The service answered and refused (bad credentials, a missing permission, a rule it enforces). Retrying will not help. */
export class AlloyUserError extends Error {
  readonly retryable = false;
  constructor(message: string, readonly field?: string) { super(message); this.name = 'AlloyUserError'; }
}
export const isAlloyNetworkError = (e: unknown): e is AlloyNetworkError => e instanceof AlloyNetworkError;
export const isAlloyUserError = (e: unknown): e is AlloyUserError => e instanceof AlloyUserError;
