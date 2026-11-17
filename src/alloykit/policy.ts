// Location: src/alloykit/policy.ts
// 0250: build-time switches. A build that must never behave a certain way sets it here, and nothing in the app can turn it back on.

export type AlloyPolicy = {
  /**
   * Whether the iCloud Alloy may hold the Customers Element, which puts customer names, emails and phones in the shop's own iCloud.
   * `'allowed'` (the default) offers it as an explicit choice with a warning. `'disabled'` removes it when Alloys are registered, the
   * picker never offers it, and the router refuses it. Today's rule (customers live in Shopify only) is what `'disabled'` keeps.
   */
  icloudCustomers: 'allowed' | 'disabled';
};
export const ALLOY_POLICY: AlloyPolicy = { icloudCustomers: 'allowed' };
