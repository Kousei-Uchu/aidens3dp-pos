import React, { useEffect, useRef } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { ZellerRoot } from './src/zellerBridge';
import { ThemeProvider, useTheme } from './src/ui/theme';
import { NavProvider, useNav, type Route, type Tab } from './src/ui/nav';
import { Txt } from './src/ui/kit';
import { useApp } from './src/state/store';
import { loadCreds } from './src/lib/shopify/client';
import { pollShared, processOutbox, pushSaved } from './src/lib/sync';
import Checkout from './src/screens/Checkout';
import GuidedCheckout from './src/screens/GuidedCheckout';
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
import Help from './src/screens/Help';
import Assistant from './src/screens/Assistant';
import Training from './src/screens/Training';
import TrainingRun from './src/screens/TrainingRun';
import TerminalPlay from './src/screens/TerminalPlay';
import DemoHome from './src/screens/DemoHome';
import DemoShow from './src/screens/DemoShow';
import Export from './src/screens/Export';
import TrainingHost from './src/ui/TrainingHost';
import DemoBanner from './src/ui/DemoBanner';
import AssistantGuideOverlay from './src/ui/AssistantGuide';
import AppStatusBar from './src/ui/AppStatusBar';
import { Spot } from './src/ui/Spot';
import { SPOT } from './src/lib/trainingSpots';
import { useTraining } from './src/state/trainingSession';
import { getModule } from './src/training';
import { isTraining } from './src/lib/trainingGuard';
import { KeepAwake, ScreensaverLayer } from './src/ui/Screensaver';
import { noteActivity } from './src/lib/idle';
import { RouteStage, useRouteTransition } from './src/ui/RouteTransition';
import { Enter, TabPane } from './src/ui/Motion';
import { isLockScreen } from './src/lib/posLock';
import { UiProvider, useUi } from './src/ui/uiProfile';
import { effectiveTab } from './src/lib/uiMode';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const TABS: { id: Tab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'checkout', label: 'Checkout', icon: 'apps' }, { id: 'inventory', label: 'Inventory', icon: 'cube' }, { id: 'transactions', label: 'Transactions', icon: 'receipt' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications' }, { id: 'more', label: 'More', icon: 'ellipsis-horizontal-circle' },
];

function Routes({ route: top }: { route: Route }) {
  const nav = useNav();
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
    case 'export': return <Export />;
    case 'giftcards': return <GiftCards />;
    case 'drawer': return <Drawer />;
    case 'settings': return <Settings open={p.sub} />;
    case 'assistant': return <Assistant />;
    case 'staff': return <Staff />;
    case 'diagnostics': return <Diagnostics />;
    case 'help': return <Help id={p.id} />;
    case 'training': return <Training />;
    case 'trainingRun': return <TrainingRun />;
    case 'terminalPlay': return <TerminalPlay />;
    case 'demoHome': return <DemoHome />;
    case 'demoShow': return <DemoShow />;
    default: return null;
  }
}

function Shell() {
  const { c } = useTheme(); const nav = useNav(); const ready = useApp(s => s.ready); const unlocked = useApp(s => s.unlocked); const staffCount = useApp(s => s.settings.staff.length);
  const unread = useApp(s => s.pos.notices.filter(n => !n.read).length); const ui = useUi();
  const onlyTabs = useTraining(s => (s.sandbox && s.run ? getModule(s.run.moduleId)?.tabs : undefined));
  const practiceRoutes = useTraining(s => (s.sandbox && s.run ? getModule(s.run.moduleId)?.routes : undefined));
  const { plan } = useRouteTransition(nav.stack, practiceRoutes); // the page that is leaving stays drawn while the new one arrives
  // A tab this person's display mode hides (mode changed while signed in, or a notification link) falls back to Checkout.
  useEffect(() => { if (effectiveTab(nav.tab, ui) !== nav.tab) nav.setTab('checkout'); }, [nav.tab, ui]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void useApp.getState().hydrate().then(async () => { await loadCreds(); const s = useApp.getState(); if (s.settings.requirePin && s.settings.staff.length) s.set({ unlocked: false }); void processOutbox(); void pollShared(); void pushSaved(); }); }, []);
  useEffect(() => {
    if (!ready) return;
    const tick = () => { if (isTraining()) return; void processOutbox(); void pollShared(); void pushSaved(); const neg = Object.values(useApp.getState().data.variants).filter(v => (v.stock ?? 0) < 0).length; if (neg) useApp.getState().notify({ kind: 'stock', title: `${neg} item(s) with negative stock`, route: 'inventory' }); };
    const t = setInterval(tick, 25000); const sub = AppState.addEventListener('change', st => { if (st === 'active') tick(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [ready]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  if (isLockScreen({ staffCount, unlocked }) && nav.stack[nav.stack.length - 1]?.name !== 'help') return <View style={{ flex: 1, backgroundColor: c.bg }}><PinLock /></View>;
  const hasPage = nav.stack.length > 0; const moving = !!plan; // the tab screen stays drawn underneath while a page slides over it or away from it
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <AppStatusBar />
      <DemoBanner />
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, display: hasPage && !moving ? 'none' : 'flex' }}>{/* tabs stay mounted: cart/scan state survives navigation */}
          <TabPane active={nav.tab === 'checkout'} style={{ flex: 1, display: nav.tab === 'checkout' ? 'flex' : 'none' }}>{ui.guided ? <GuidedCheckout /> : <Checkout />}</TabPane>
          {nav.tab !== 'checkout' ? <Enter key={nav.tab} from="up" distance={10} duration={280} style={{ flex: 1 }}>{nav.tab === 'inventory' ? <Inventory /> : nav.tab === 'transactions' ? <Transactions /> : nav.tab === 'notifications' ? <Notifications /> : <More />}</Enter> : null}
        </View>
        {hasPage || moving ? <RouteStage stack={nav.stack} plan={plan} render={r => <Routes route={r} />} /> : null}
      </View>
      {!hasPage ? (
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line }}>
          <View style={{ flexDirection: 'row', paddingTop: 6, paddingBottom: 8 }}>
            {TABS.filter(t => ui.tabs.includes(t.id) && (!onlyTabs || onlyTabs.includes(t.id))).map(t => { const on = nav.tab === t.id; return (
              <Spot key={t.id} id={t.id === 'checkout' ? SPOT.tabCheckout : t.id === 'more' ? SPOT.tabMore : t.id === 'inventory' ? SPOT.tabInventory : t.id === 'transactions' ? SPOT.tabTransactions : t.id === 'notifications' ? SPOT.tabNotifications : undefined} style={{ flex: 1 }}><Pressable onPress={() => nav.setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label} style={{ alignSelf: 'stretch', alignItems: 'center', gap: 2 }}>
                <View><Ionicons name={on ? t.icon : (`${t.icon}-outline` as any)} size={Math.round(24 * ui.textScale)} color={on ? c.text : c.sub} />{t.id === 'notifications' && unread ? <View style={{ position: 'absolute', top: -2, right: -8, backgroundColor: c.bad, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}><Txt size={10} weight="700" color="#fff">{unread > 9 ? '9+' : unread}</Txt></View> : null}</View>
                <Txt size={11} weight={on ? '700' : '500'} color={on ? c.text : c.sub}>{t.label}</Txt></Pressable></Spot>); })}
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

export default function App() {
  return (
    <ZellerRoot>
      <SafeAreaProvider><ThemeProvider><UiProvider><NavProvider>
        <View style={{ flex: 1 }} onTouchStart={noteActivity}><StatusBar hidden /><TrainingHost><Shell /></TrainingHost><AssistantGuideOverlay /></View>
        <KeepAwake /><ScreensaverLayer />
      </NavProvider></UiProvider></ThemeProvider></SafeAreaProvider>
    </ZellerRoot>
  );
}
