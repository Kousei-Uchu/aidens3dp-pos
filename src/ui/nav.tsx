import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type Tab = 'checkout' | 'inventory' | 'transactions' | 'notifications' | 'more';
export type Route = { name: string; params?: any };
type Nav = { tab: Tab; setTab: (t: Tab) => void; stack: Route[]; push: (name: string, params?: any) => void; pop: () => void; reset: () => void; go: (route: string, params?: any) => void };
const Ctx = createContext<Nav>(null as any);
const TAB_ROUTES: Record<string, Tab> = { checkout: 'checkout', inventory: 'inventory', transactions: 'transactions', notifications: 'notifications', more: 'more' };

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTabState] = useState<Tab>('checkout');
  const [stack, setStack] = useState<Route[]>([]);
  const setTab = useCallback((t: Tab) => { setTabState(t); setStack([]); }, []);
  const push = useCallback((name: string, params?: any) => setStack(s => [...s, { name, params }]), []);
  const pop = useCallback(() => setStack(s => s.slice(0, -1)), []);
  const reset = useCallback(() => setStack([]), []);
  /** Notification deep-links: a tab name switches tab, anything else pushes a page. */
  const go = useCallback((route: string, params?: any) => { if (TAB_ROUTES[route]) { setTabState(TAB_ROUTES[route]); setStack([]); } else setStack(s => [...s, { name: route, params }]); }, []);
  const v = useMemo(() => ({ tab, setTab, stack, push, pop, reset, go }), [tab, stack, setTab, push, pop, reset, go]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}
export const useNav = () => useContext(Ctx);
