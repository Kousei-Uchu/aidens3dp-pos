// Location: tests/companionjobs.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { useApp, defaultSettings } from '../src/state/store';

const read = (p: string) => fs.readFileSync(p, 'utf8');

test('a companion without the Card reader group raises no reader notice, and a register still does', () => {
  const before = useApp.getState();
  try {
    useApp.setState({ settings: { ...defaultSettings(), appMode: 'companion' }, pos: { ...before.pos, notices: [] } });
    useApp.getState().notify({ kind: 'reader', title: 'Reader issue' });
    useApp.getState().notify({ kind: 'sync', title: 'Offline' });
    assert.deepEqual(useApp.getState().pos.notices.map(n => n.kind), ['sync']);
    useApp.setState({ settings: { ...defaultSettings(), appMode: 'companion', registerFeatures: { ...defaultSettings().registerFeatures, cardReader: true } }, pos: { ...before.pos, notices: [] } });
    useApp.getState().notify({ kind: 'reader', title: 'Reader issue' });
    assert.deepEqual(useApp.getState().pos.notices.map(n => n.kind), ['reader']);
    useApp.setState({ settings: { ...defaultSettings(), appMode: 'register' }, pos: { ...before.pos, notices: [] } });
    useApp.getState().notify({ kind: 'reader', title: 'Reader issue' });
    assert.deepEqual(useApp.getState().pos.notices.map(n => n.kind), ['reader']);
  } finally { useApp.setState({ settings: before.settings, pos: before.pos }); }
});

test('the hardware and sync gates are wired where the work happens', () => {
  const bridge = read('src/zellerBridge.tsx');
  assert.ok(bridge.includes("if (!readerOn()) return false;"), 'checkReader asks first');
  assert.ok(bridge.includes('if (!on) return undefined;'), 'the bridge does not poll without the group');
  assert.ok(bridge.includes('[terminal, on]'), 'switching the group on starts the checks');
  const sync = read('src/lib/sync.ts');
  assert.ok(sync.includes("if (!drawerOn() && !s.settings.drawerPending) return;"), 'pushDrawer');
  assert.ok(sync.includes('isTraining() || !drawerOn() || st().settings.drawerPending'), 'pullDrawer');
  const app = read('App.tsx');
  for (const needle of ['runBackground();', 'if (jobs.outbox) void processOutbox();', 'void pollShared();', 'if (jobs.savedCarts) void pushSaved();', '<DisplayLayers />', 'visibleNotices(unreadNotices']) assert.ok(app.includes(needle), needle);
  assert.ok(read('src/screens/Diagnostics.tsx').includes('{readerOn ? ('), 'the reader tools');
  assert.ok(read('src/screens/Notifications.tsx').includes('routeAllowed(devMode, devFeatures, n.route)'), 'a notice never opens a hidden page');
});
