import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { stepUpForRoute } from '../lib/stepUp';
import { useApp } from '../state/store';
import { readMode } from '../lib/appMode';
import { requireStepUp, stepUpDue } from '../lib/stepUpGate';

export type Tab = 'checkout' | 'inventory' | 'transactions' | 'notifications' | 'more' | 'today' | 'scan';
export type Route = { name: string; params?: any };
type Nav = { tab: Tab; setTab: (t: Tab) => void; stack: Route[]; push: (name: string, params?: any) => void; pop: () => void; reset: () => void; go: (route: string, params?: any) => void };
const Ctx = createContext<Nav>(null as any);
const TAB_ROUTES: Record<string, Tab> = { checkout: 'checkout', inventory: 'inventory', transactions: 'transactions', notifications: 'notifications', more: 'more', today: 'today', scan: 'scan' };
let helpOpener: ((id: string) => void) | undefined;
export const openHelpPage = (id: string) => helpOpener?.(id);

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTabState] = useState<Tab>('checkout');
  const [stack, setStack] = useState<Route[]>([]);
  const setTab = useCallback((t: Tab) => { setTabState(t); setStack([]); }, []);
  // Opening a page that changes something that matters asks for the PIN first on a Companion (src/lib/stepUp.ts). Instant when no PIN is due.
  const open = useCallback((name: string, params?: any) => {
    const add = () => setStack(s => [...s, { name, params }]);
    const action = stepUpForRoute(name);
    if (!action || !stepUpDue()) return add();
    void requireStepUp(action).then(ok => { if (ok) add(); });
  }, []);
  const push = open;
  helpOpener = id => push('help', { id });
  const pop = useCallback(() => setStack(s => s.slice(0, -1)), []);
  const reset = useCallback(() => setStack([]), []);
  /** Notification deep-links: a tab name switches tab, anything else pushes a page. */
  const go = useCallback((route: string, params?: any) => { if (route === 'notifications' && readMode(useApp.getState().settings.appMode) === 'companion') open('notices'); else if (TAB_ROUTES[route]) { setTabState(TAB_ROUTES[route]); setStack([]); } else open(route, params); }, [open]);
  const v = useMemo(() => ({ tab, setTab, stack, push, pop, reset, go }), [tab, stack, setTab, push, pop, reset, go]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}
export const useNav = () => useContext(Ctx);
