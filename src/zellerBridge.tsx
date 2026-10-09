// Keeps ONE Zeller terminal handle for the whole app (Provider must stay mounted at the root – never unmount mid-payment).
import React, { useEffect } from 'react';
import * as Zeller from '@zeller-public/payments-sdk-react-native';
import { useApp } from './state/store';
import type { TerminalLike } from './lib/zeller';

let handle: TerminalLike | null = null;
export const getTerminal = () => handle;

export const ZellerRoot = ({ children }: { children: React.ReactNode }) => (
  <Zeller.Provider vendorName="Kousei" vendorApplicationName="ShopifyZellerPOS" vendorApplicationVersion="1.0.0" vendorDeviceType="POS">
    <Bridge />
    {children}
  </Zeller.Provider>
);

export async function checkReader(): Promise<boolean> {
  const set = useApp.getState().set;
  if (!handle) { set({ zeller: { ready: false, message: 'Reader starting…' } }); return false; }
  const r: any = await handle.initialise();
  if (r instanceof Error) {
    const offline = (r as any).type === 'Network Failure';
    set({ zeller: { ready: false, message: offline ? 'Reader offline — no internet' : 'Reader not set up' } });
    useApp.getState().notify({ kind: 'reader', title: 'Reader issue', body: offline ? 'No internet — card payments need a connection.' : 'Pair the terminal in More ▸ Support ▸ Zeller.', route: 'diagnostics' });
    return false;
  }
  set({ zeller: { ready: true } });
  return true;
}
export async function pairReader(): Promise<string | null> {
  if (!handle) return 'Reader not started yet.';
  const r: any = await handle.setup();
  if (r instanceof Error) return r.message || 'Setup failed';
  await checkReader(); return null;
}

function Bridge() {
  const terminal = Zeller.useTerminal() as TerminalLike;
  useEffect(() => { handle = terminal; void checkReader(); const t = setInterval(() => { if (!useApp.getState().zeller.ready) void checkReader(); }, 60000); return () => clearInterval(t); }, [terminal]);
  return null;
}
