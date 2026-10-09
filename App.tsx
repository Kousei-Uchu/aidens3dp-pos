import React, { useEffect } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { ZellerRoot } from './src/zellerBridge';
import { ThemeProvider, useLayout, useTheme } from './src/ui/theme';
import { NavProvider, useNav, type Tab } from './src/ui/nav';
import { Txt } from './src/ui/kit';
import { useApp } from './src/state/store';
import { loadCreds } from './src/lib/shopify/client';
import { pollShared, processOutbox, pushSaved } from './src/lib/sync';
import Checkout from './src/screens/Checkout';
import CartPane from './src/screens/CartPane';
import Pay from './src/screens/Pay';
import Inventory from './src/screens/Inventory';
import Transactions from './src/screens/Transactions';
import Notifications from './src/screens/Notifications';
import More from './src/screens/More';
import SavedCarts from './src/screens/SavedCarts';
import Orders from './src/screens/Orders';
import { ItemsList, CreateItem, EditItem } from './src/screens/Items';
import Customers from './src/screens/Customers';
import Reports from './src/screens/Reports';
import GiftCards from './src/screens/GiftCards';
import Drawer from './src/screens/Drawer';
import Settings from './src/screens/Settings';
import Staff, { PinLock } from './src/screens/Staff';
import Diagnostics from './src/screens/Diagnostics';
import { KeepAwake, ScreensaverLayer } from './src/ui/Screensaver';
import { noteActivity } from './src/lib/idle';

const TABS: { id: Tab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'checkout', label: 'Checkout', icon: 'apps' }, { id: 'inventory', label: 'Inventory', icon: 'cube' }, { id: 'transactions', label: 'Transactions', icon: 'receipt' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications' }, { id: 'more', label: 'More', icon: 'ellipsis-horizontal-circle' },
];

function Routes() {
  const nav = useNav(); const top = nav.stack[nav.stack.length - 1]; if (!top) return null;
  const p = top.params ?? {};
  switch (top.name) {
    case 'pay': return <Pay onBack={nav.pop} />;
    case 'cart': return <CartPane onClose={nav.pop} />;
    case 'saved': return <SavedCarts />;
    case 'orders': return <Orders />;
    case 'items': return <ItemsList />;
    case 'createItem': return <CreateItem />;
    case 'editItem': return <EditItem id={p.id} />;
    case 'customers': return <Customers />;
    case 'reports': return <Reports />;
    case 'giftcards': return <GiftCards />;
    case 'drawer': return <Drawer />;
    case 'settings': return <Settings />;
    case 'staff': return <Staff />;
    case 'diagnostics': return <Diagnostics />;
    default: return null;
  }
}

function Shell() {
  const { c } = useTheme(); const nav = useNav(); const { tablet } = useLayout(); const ready = useApp(s => s.ready); const unlocked = useApp(s => s.unlocked); const requirePin = useApp(s => s.settings.requirePin && s.settings.staff.length > 0);
  const unread = useApp(s => s.pos.notices.filter(n => !n.read).length);
  useEffect(() => { void useApp.getState().hydrate().then(async () => { await loadCreds(); const s = useApp.getState(); if (s.settings.requirePin && s.settings.staff.length) s.set({ unlocked: false }); void processOutbox(); void pollShared(); void pushSaved(); }); }, []);
  useEffect(() => {
    if (!ready) return;
    const tick = () => { void processOutbox(); void pollShared(); void pushSaved(); const neg = Object.values(useApp.getState().data.variants).filter(v => (v.stock ?? 0) < 0).length; if (neg) useApp.getState().notify({ kind: 'stock', title: `${neg} item(s) with negative stock`, route: 'inventory' }); };
    const t = setInterval(tick, 25000); const sub = AppState.addEventListener('change', st => { if (st === 'active') tick(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [ready]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  if (requirePin && !unlocked) return <View style={{ flex: 1, backgroundColor: c.bg }}><PinLock /></View>;
  const hasPage = nav.stack.length > 0;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={c.bg === '#0B0B0C' ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, display: hasPage ? 'none' : 'flex' }}>{/* tabs stay mounted: cart/scan state survives navigation */}
          <View style={{ flex: 1, display: nav.tab === 'checkout' ? 'flex' : 'none' }}><Checkout /></View>
          {nav.tab === 'inventory' ? <Inventory /> : null}{nav.tab === 'transactions' ? <Transactions /> : null}{nav.tab === 'notifications' ? <Notifications /> : null}{nav.tab === 'more' ? <More /> : null}
        </View>
        {hasPage ? <Routes /> : null}
      </View>
      {!hasPage ? (
        <View style={{ flexDirection: 'row', backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line, paddingBottom: tablet ? 8 : 22, paddingTop: 6 }}>
          {TABS.map(t => { const on = nav.tab === t.id; return (
            <Pressable key={t.id} onPress={() => nav.setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <View><Ionicons name={on ? t.icon : (`${t.icon}-outline` as any)} size={24} color={on ? c.text : c.sub} />{t.id === 'notifications' && unread ? <View style={{ position: 'absolute', top: -2, right: -8, backgroundColor: c.bad, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}><Txt size={10} weight="700" color="#fff">{unread > 9 ? '9+' : unread}</Txt></View> : null}</View>
              <Txt size={11} weight={on ? '700' : '500'} color={on ? c.text : c.sub}>{t.label}</Txt></Pressable>); })}
        </View>
      ) : null}
    </View>
  );
}

export default function App() {
  return (
    <ZellerRoot>
      <ThemeProvider><NavProvider>
        <View style={{ flex: 1 }} onTouchStart={noteActivity}><Shell /></View>
        <KeepAwake /><ScreensaverLayer />
      </NavProvider></ThemeProvider>
    </ZellerRoot>
  );
}
