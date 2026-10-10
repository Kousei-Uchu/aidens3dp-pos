// Location: src/lib/giftClaim.ts
// A10: claim links for gift cards sold without a recipient email. Signed with the claim secret (same value as the gift-claim-server's CLAIM_SECRET),
// so only links this shop issued work. Matches gift-claim-server/src/claim.ts (a test checks the two agree).
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { normaliseCode } from './giftCode';

export const claimSig = (secret: string, rawCode: string) => bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(`claim:${normaliseCode(rawCode)}`))).slice(0, 32);
/** https://<worker>/c/<CODE>.<SIG>  (null until the page URL and secret are both set up) */
export function claimUrl(base: string, secret: string, rawCode: string): string | null {
  const b = base.trim().replace(/\/$/, ''); const code = normaliseCode(rawCode);
  if (!/^https:\/\//i.test(b) || !secret.trim() || code.length < 8) return null;
  return `${b}/c/${code}.${claimSig(secret.trim(), code)}`;
}
