// Location: src/lib/assistantStatusIO.ts
// Takes the snapshot the assistant's settings and status tools read (patch 0169). The only file that connects them to the store, the
// Shopify credentials check and the app version; everything the tools do with it is in assistantStatus.ts. It only reads, and it hands
// the tools two small views built by `buildSettingsView` and `buildStatusView`, never the settings object itself, so no web address,
// token, PIN or staff name is ever in what they can reach. Nothing here goes to Shopify or the card reader.
import DeviceInfo from 'react-native-device-info';
import { useApp } from '../state/store';
import { isTraining } from './trainingGuard';
import { hasCreds, shopDomain } from './shopify/client';
import { receiptsEnabled } from './receiptSync';
import { parseBundleConfig } from './bundles';
import { canEditAdjustPerms } from './adjustPerms';
import type { Role } from './types';
import { buildSettingsView, buildStatusView, type TillState } from './assistantStatus';

/** The app version and build, or empty text when the device cannot say. DeviceInfo is used only here so the tools stay free of native code. */
function appVersion(): { version: string; build: string } {
  try { return { version: String(DeviceInfo.getVersion() ?? ''), build: String(DeviceInfo.getBuildNumber() ?? '') }; } catch { return { version: '', build: '' }; }
}

/**
 * How the till is set up and how it is doing right now, or null while the till is on practice data (the assistant is switched off in
 * practice mode, and this is a second lock: practice data must never be described as the shop's). `role` is the role the person is
 * acting as: the settings view is only built for a manager or an owner, so a cashier's snapshot does not hold it at all.
 */
export function takeTillState(role: string, now: number = Date.now()): TillState | null {
  if (isTraining()) return null;
  const s = useApp.getState(); const st = s.settings;
  let bundleDeals = 0; try { bundleDeals = st.bundlesJson ? (parseBundleConfig(st.bundlesJson).cfg?.discounts.length ?? 0) : 0; } catch { bundleDeals = 0; }
  const connected = hasCreds();
  const mayReadSettings = role === 'manager' || role === 'owner';
  const settings = mayReadSettings
    ? buildSettingsView(st, { shopifyConnected: connected, shopifyStore: connected ? shopDomain() : undefined, bundleDeals, automaticDiscounts: s.data.autos.length, canSeeAssistant: canEditAdjustPerms(role as Role, st.staff) })
    : null;
  const v = appVersion();
  const status = buildStatusView({
    now, version: v.version, build: v.build, registerName: st.registerName, sync: s.sync, zeller: s.zeller, outbox: s.pos.outbox, notices: s.pos.notices,
    shopifyConnected: connected, receiptPageSet: receiptsEnabled(), catalogueAt: s.data.catalogueAt, stockSince: s.data.stockSince, variationCount: Object.keys(s.data.variants).length,
  });
  return { settings, status };
}
