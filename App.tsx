import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { ZellerRoot } from './src/zellerBridge';
import { ThemeProvider, useTheme } from './src/ui/theme';
import { NavProvider, useNav, type Route, type Tab } from './src/ui/nav';
import { Btn, Txt } from './src/ui/kit';
import { useApp } from './src/state/store';
import { loadCreds } from './src/lib/shopify/client';
import { pollShared, processOutbox, pushSaved } from './src/lib/sync';
import { forceMetaobjectBackend, metaobjectForced, setBackend } from './src/lib/syncBackend';
import { metaobjectBackend } from './src/lib/shopify/metaobjectBackend';
import { cloudkitBackend } from './src/lib/cloudkit/cloudkitBackend';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import CloudSync from './src/screens/CloudSync';
import Setup from './src/screens/Setup';
import DeviceMode from './src/screens/DeviceMode';
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
import { idleMs, noteActivity } from './src/lib/idle';
import { backgroundJobs, salesPane, deviceTabs, homeTab, isCompanionTab, lockRequired, readMode, routeAllowed, tabAllowed, visibleNotices } from './src/lib/appMode';
import Today from './src/screens/Today';
import ScanTab from './src/screens/ScanTab';
import { lockDue } from './src/lib/stepUp';
import { lockIdle } from './src/lib/staffAuth';
import { paymentActive } from './src/lib/screensaver';
import StepUpHost from './src/ui/StepUpHost';
import { RouteStage, useRouteTransition } from './src/ui/RouteTransition';
import { Enter, TabPane } from './src/ui/Motion';
import { isLockScreen } from './src/lib/posLock';
import { UiProvider, useUi } from './src/ui/uiProfile';
import { TAB_ORDER, effectiveTab } from './src/lib/uiMode';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import QuickSale from './src/screens/QuickSale';

const TABS: { id: Tab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'checkout', label: 'Checkout', icon: 'apps' }, { id: 'inventory', label: 'Inventory', icon: 'cube' }, { id: 'transactions', label: 'Transactions', icon: 'receipt' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications' }, { id: 'more', label: 'More', icon: 'ellipsis-horizontal-circle' },
  { id: 'today', label: 'Today', icon: 'sunny' }, { id: 'scan', label: 'Scan', icon: 'barcode' },
];

/** The screensaver and keep awake belong to the Till display group: a companion that does not hold it gets neither. */
function DisplayLayers() {
  const mode = useApp(s => s.settings.appMode); const features = useApp(s => s.settings.registerFeatures);
  return backgroundJobs(mode, features, { queuedSales: 0, savedCarts: 0 }).display ? <><KeepAwake /><ScreensaverLayer /></> : null;
}

/** The sale upload, the shared poll and the saved-cart push. A companion only runs what it holds or still has something to send (see backgroundJobs). */
function runBackground() {
  const s = useApp.getState(); const jobs = backgroundJobs(s.settings.appMode, s.settings.registerFeatures, { queuedSales: s.pos.outbox.length, savedCarts: s.pos.saved.length });
  if (jobs.outbox) void processOutbox();
  void pollShared(); // staff, settings and the shop's shared records are needed whatever the device holds
  if (jobs.savedCarts) void pushSaved();
}

function Routes({ route: top }: { route: Route }) {
  const nav = useNav(); const mode = useApp(s => s.settings.appMode); const features = useApp(s => s.settings.registerFeatures);
  const p = top.params ?? {};
  const allowed = routeAllowed(mode, features, top.name);
  // A page this device's mode hides (a notification link, the assistant, a mode change while it was open) closes itself.
  useEffect(() => { if (!allowed) nav.pop(); }, [allowed]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!allowed) return null;
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
    case 'handoff': return <QuickSale kind="handoff" onBack={nav.pop} />; // a companion with Selling off: build a cart and send it to a register
    case 'notices': return <Notifications onBack={nav.pop} />; // a companion has no Notifications tab: the bell on Today opens it
    case 'export': return <Export />;
    case 'cloudSync': return <CloudSync />;
    case 'setup': return <Setup />;
    case 'deviceMode': return <DeviceMode />;
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
  const setupDone = useApp(s => s.settings.setupDone);
  const unreadNotices = useApp(s => s.pos.notices); const unreadMode = useApp(s => s.settings.appMode); const unreadFeatures = useApp(s => s.settings.registerFeatures); const unread = visibleNotices(unreadNotices, unreadMode, unreadFeatures).filter(n => !n.read).length; const ui = useUi();
  const onlyTabs = useTraining(s => (s.sandbox && s.run ? getModule(s.run.moduleId)?.tabs : undefined));
  const practiceRoutes = useTraining(s => (s.sandbox && s.run ? getModule(s.run.moduleId)?.routes : undefined));
  const { plan } = useRouteTransition(nav.stack, practiceRoutes); // the page that is leaving stays drawn while the new one arrives
  // A tab this person's display mode hides (mode changed while signed in, or a notification link) falls back to Checkout.
  // This device's mode decides which tabs exist (Today and Scan on a companion, Checkout only with Selling on). A hidden tab falls back to the home tab.
  const devMode = useApp(s => s.settings.appMode); const devFeatures = useApp(s => s.settings.registerFeatures);
  const barTabs = deviceTabs(devMode, devFeatures, TAB_ORDER);
  const [fullPos, setFullPos] = useState(false); // a companion's Checkout tab opens the quick sale; Full checkout swaps in the whole POS on the same cart
  const quick = salesPane(devMode, fullPos) === 'quick';
  useEffect(() => { if (!tabAllowed(devMode, devFeatures, nav.tab) || (!isCompanionTab(nav.tab) && effectiveTab(nav.tab, ui) !== nav.tab)) nav.setTab(homeTab(devMode)); }, [nav.tab, ui, devMode, devFeatures]); // eslint-disable-line react-hooks/exhaustive-deps
  // CloudKit sync patch 3: shared state sits behind a backend seam. The metaobject backend is the one that exists today; a
  // later patch swaps in CloudKit without sync.ts changing. Installing it before the first poll means every shared call has a
  // backend from the start.
  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem('cloudkit.backend');
        if (raw === 'force_meta') {
          forceMetaobjectBackend(true);
          setBackend(metaobjectBackend);
          return;
        }
      } catch {}
      try {
        // Try CloudKit if available; fall back to metaobjects
        if (!metaobjectForced() && (cloudkitBackend as any)) {
          // Only switch if explicitly enabled or native available? Keep metaobjects by default for now
          // but allow a rollback flag
        }
      } catch {}
      setBackend(metaobjectBackend);
    })();
  }, []);
  useEffect(() => { void useApp.getState().hydrate().then(async () => { await loadCreds(); const s = useApp.getState(); if (lockRequired(s.settings) && s.settings.staff.length) s.set({ unlocked: false }); runBackground(); }); }, []);
  // Companion plan, patch 0176: a device that has never been set up opens the setup checklist once. Installs from before
  // this patch were marked set up by hydrate, and practice never runs it.
  useEffect(() => { if (ready && !setupDone && !isTraining() && nav.stack.length === 0) nav.push('setup'); }, [ready, setupDone, nav.stack.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ready) return;
    const tick = () => { if (isTraining()) return; runBackground(); const neg = Object.values(useApp.getState().data.variants).filter(v => (v.stock ?? 0) < 0).length; if (neg) useApp.getState().notify({ kind: 'stock', title: `${neg} item(s) with negative stock`, route: 'inventory' }); };
    const t = setInterval(tick, 25000); const sub = AppState.addEventListener('change', st => { if (st === 'active') tick(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [ready]);
  // A Companion locks itself after sitting idle or away (src/lib/stepUp.ts). Time spent in the background counts as idle.
  useEffect(() => {
    if (!ready) return undefined;
    const check = () => { if (isTraining()) return; const s = useApp.getState(); if (lockDue({ companion: readMode(s.settings.appMode) === 'companion', staffCount: s.settings.staff.length, unlocked: s.unlocked, paymentActive: paymentActive(s.pos.attempts, Date.now()), quietMs: idleMs(), minutes: s.settings.autoLockMinutes })) lockIdle(); };
    const t = setInterval(check, 10000); const sub = AppState.addEventListener('change', st => { if (st === 'active') check(); });
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
          {tabAllowed(devMode, devFeatures, 'checkout') ? <TabPane active={nav.tab === 'checkout'} style={{ flex: 1, display: nav.tab === 'checkout' ? 'flex' : 'none' }}>{quick ? <QuickSale kind="sell" onExpand={() => setFullPos(true)} /> : <View style={{ flex: 1 }}>{readMode(devMode) === 'companion' ? <View style={{ alignItems: 'flex-end', padding: 6, backgroundColor: c.card }}><Btn small kind="ghost" title="Quick sale" icon="flash-outline" onPress={() => setFullPos(false)} /></View> : null}{ui.guided ? <GuidedCheckout /> : <Checkout />}</View>}</TabPane> : null}
          {nav.tab !== 'checkout' ? <Enter key={nav.tab} from="up" distance={10} duration={280} style={{ flex: 1 }}>{nav.tab === 'inventory' ? <Inventory /> : nav.tab === 'transactions' ? <Transactions /> : nav.tab === 'notifications' ? <Notifications /> : nav.tab === 'today' ? <Today /> : nav.tab === 'scan' ? <ScanTab /> : <More />}</Enter> : null}
        </View>
        {hasPage || moving ? <RouteStage stack={nav.stack} plan={plan} render={r => <Routes route={r} />} /> : null}
      </View>
      {!hasPage ? (
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line }}>
          <View style={{ flexDirection: 'row', paddingTop: 6, paddingBottom: 8 }}>
            {barTabs.map(id => TABS.find(t => t.id === id)!).filter(t => (isCompanionTab(t.id) || ui.tabs.includes(t.id as any)) && (!onlyTabs || onlyTabs.includes(t.id))).map(t => { const on = nav.tab === t.id; return (
              <Spot key={t.id} id={t.id === 'checkout' ? SPOT.tabCheckout : t.id === 'more' ? SPOT.tabMore : t.id === 'inventory' ? SPOT.tabInventory : t.id === 'transactions' ? SPOT.tabTransactions : t.id === 'notifications' ? SPOT.tabNotifications : t.id === 'today' ? SPOT.tabToday : t.id === 'scan' ? SPOT.tabScan : undefined} style={{ flex: 1 }}><Pressable onPress={() => nav.setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label} style={{ alignSelf: 'stretch', alignItems: 'center', gap: 2 }}>
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
        <View style={{ flex: 1 }} onTouchStart={noteActivity}><StatusBar hidden /><TrainingHost><Shell /></TrainingHost><AssistantGuideOverlay /><StepUpHost /></View>
        <DisplayLayers />
      </NavProvider></UiProvider></ThemeProvider></SafeAreaProvider>
    </ZellerRoot>
  );
}
