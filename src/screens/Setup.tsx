// Location: src/screens/Setup.tsx
// The setup checklist (Companion plan, patch 0176). A device that has never been set up opens this once: the choice of
// how it will be used (a register or a companion), then that profile's few steps. Every step goes to the screen that
// already does the job, so nothing is duplicated here, and each one is ticked off from the device's own settings.
//
// Nothing here traps anybody: the steps show what is done and what is not, and Finish is always available. The Device
// mode page can open this list again later.
import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Btn, Page, Row, Section, Txt, alertMsg } from '../ui/kit';
import { useNav } from '../ui/nav';
import { useTheme } from '../ui/theme';
import { useApp, currentStaff } from '../state/store';
import { actingRole } from '../lib/adjustPerms';
import { hasCreds } from '../lib/shopify/client';
import { isTraining } from '../lib/trainingGuard';
import { DEVICE_MODES, type DeviceMode } from '../lib/appMode';
import { firstUnfinished, setupContext, setupProgress, setupSteps, type SetupProfile, type SetupStep } from '../lib/setupFlow';
import { SPOT } from '../lib/trainingSpots';

/** Where each step's work is done, and who may do it. The steps themselves are data (src/lib/setupFlow.ts); only the
 *  routes and the role they need live here. Settings and Staff are manager and owner screens, so a companion set up while
 *  a cashier is signed in explains that instead of pushing a page that person may not have. */
const STEP_ROUTE: Record<SetupStep['id'], { route: string; params?: any; managersOnly?: boolean }> = {
  shopify: { route: 'settings', params: { sub: 'shopify' }, managersOnly: true },
  pin: { route: 'staff', managersOnly: true },
  name: { route: 'settings', params: { sub: 'about' }, managersOnly: true },
  features: { route: 'deviceMode' },
};
const STEP_SPOT: Record<SetupStep['id'], string> = { shopify: SPOT.setupStepShopify, pin: SPOT.setupStepPin, name: SPOT.setupStepName, features: SPOT.setupStepFeatures };

const MODE_BLURB: Record<DeviceMode, { title: string; sub: string; spot: string }> = {
  register: { title: 'A register', sub: 'A till for the counter: everything on, exactly as it has always been.', spot: SPOT.setupModeRegister },
  companion: { title: 'A companion', sub: 'A phone or tablet beside the till: browsing, the assistant and whatever register features you switch on.', spot: SPOT.setupModeCompanion },
};

export default function Setup() {
  const nav = useNav();
  const { c } = useTheme();
  const s = useApp(st => st.settings);
  const patch = useApp(st => st.patchSettings);
  const practice = isTraining();

  const mode: DeviceMode = s.appMode;
  const profile: SetupProfile = mode === 'companion' ? 'companion' : 'register';
  const role = actingRole(s.requirePin, s.staff, currentStaff()?.id);
  const ctx = setupContext(s, hasCreds());
  const steps = setupSteps(profile);
  const progress = setupProgress(profile, ctx);
  const next = firstUnfinished(profile, ctx);

  const finish = () => {
    patch({ setupDone: true });
    if (nav.stack.length) nav.pop(); // pushed over the tabs: going back lands on them, which is where setup came from
  };

  return (
    <Page title="Set up this device" onBack={nav.stack.length > 1 ? nav.pop : undefined} helpId="start/setup">
      <View style={{ padding: 16 }}>
        <Txt size={13} sub>Two choices to make, then a short checklist. Nothing is locked in: both live in More, Device mode.</Txt>
      </View>

      <Section title="How will this device be used?" footer="A register is the default, and a device that was already in use stays one. It can be changed later under More, Device mode.">
        {DEVICE_MODES.map((m, i) => (
          <Row key={m} title={MODE_BLURB[m].title} sub={MODE_BLURB[m].sub} last={i === DEVICE_MODES.length - 1} spot={MODE_BLURB[m].spot}
            right={m === mode ? <Ionicons name="checkmark-circle" size={22} color={c.good} /> : undefined}
            onPress={practice ? undefined : () => patch({ appMode: m })} />
        ))}
      </Section>

      <Section title={profile === 'companion' ? 'Before it leaves the bench' : 'Before it goes on the counter'}
        footer={next ? `Next: ${next.title}.` : 'Every step is done.'}>
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <Txt size={13} sub>{progress.done} of {progress.total} done</Txt>
        </View>
        {steps.map((step, i) => {
          const done = step.done(ctx);
          const to = STEP_ROUTE[step.id];
          const asked = !!to.managersOnly && role === 'cashier';
          return (
            <Row key={step.id} title={step.title} sub={step.summary} last={i === steps.length - 1} spot={STEP_SPOT[step.id]}
              right={<Txt size={13} sub weight="600" color={done ? c.good : c.sub}>{done ? 'Done' : asked ? 'Ask a manager' : next?.id === step.id ? 'Next' : 'Not yet'}</Txt>}
              onPress={asked
                ? () => alertMsg('A manager does this step', 'Connecting Shopify, the owner PIN and the register name are manager and owner jobs. Ask a manager to sign in and open this checklist.')
                : () => nav.push(to.route, to.params)} />
          );
        })}
      </Section>

      <View style={{ padding: 16, gap: 10 }}>
        <Btn title="Finish setup" icon="checkmark-outline" spot={SPOT.setupFinish} disabled={practice} onPress={finish} />
        <Txt size={13} sub>Steps left undone stay on this list, under More, Device mode. Setup will not open again by itself.</Txt>
      </View>
    </Page>
  );
}
