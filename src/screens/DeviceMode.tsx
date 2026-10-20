// Location: src/screens/DeviceMode.tsx
// Device mode (Companion plan, patch 0176): what this device is, and, for a companion, which register features it has.
// Open to every signed-in person, because a companion is usually somebody's phone rather than the shop's till.
//
// A register has every feature whatever is stored, so a register shows the mode and nothing to switch. The switches a
// companion had are kept while it is a register, so going back and forth does not lose them. The step-up PIN that
// guards these changes arrives with patch 0177 (below): changing the mode, a feature or the locking choices asks for the PIN.
import React from 'react';
import { View } from 'react-native';
import { Btn, Page, Row, Section, Segmented, Toggle, Txt, confirm } from '../ui/kit';
import { Spot } from '../ui/Spot';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { isTraining } from '../lib/trainingGuard';
import { FEATURE_GROUPS, resolveFeatures, type DeviceMode, type FeatureId } from '../lib/appMode';
import { featureSpot, SPOT } from '../lib/trainingSpots';
import { requireStepUp } from '../lib/stepUpGate';
import { AUTO_LOCK_CHOICES, STEP_UP_CHOICES } from '../lib/stepUp';

export default function DeviceMode() {
  const nav = useNav();
  const s = useApp(st => st.settings);
  const patch = useApp(st => st.patchSettings);
  const practice = isTraining();
  const mode = s.appMode;
  const features = resolveFeatures(mode, s.registerFeatures);

  const setMode = async (next: DeviceMode) => {
    if (next === mode) return;
    const ok = await confirm(
      next === 'companion' ? 'Use this device as a companion?' : 'Use this device as a register?',
      next === 'companion'
        ? 'The register features in the list below start switched off. Nothing is deleted, and anything switched on here comes back when you switch to a register.'
        : 'This device gets every register feature back: the till, the card reader, the drawer and the rest.',
      next === 'companion' ? 'Become a companion' : 'Become a register',
    );
    if (ok && (await requireStepUp('mode'))) patch({ appMode: next });
  };

  const setFeature = async (id: FeatureId, on: boolean) => { if (await requireStepUp('mode')) patch({ registerFeatures: { ...resolveFeatures('companion', s.registerFeatures), [id]: on } }); };
  const setMinutes = async (key: 'autoLockMinutes' | 'stepUpMinutes', v: number) => { if (await requireStepUp('mode')) patch({ [key]: v }); };

  return (
    <Page title="Device mode" onBack={nav.pop} helpId="device-mode">
      <View style={{ padding: 16, gap: 4 }}>
        <Txt weight="600">{mode === 'companion' ? 'This device is a companion' : 'This device is a register'}</Txt>
        <Txt size={13} sub>
          {mode === 'companion'
            ? 'It keeps browsing, the assistant, notifications and Settings, and has the register features you switch on below.'
            : 'It has every feature: the till, the card reader, the cash drawer and the rest.'}
        </Txt>
      </View>

      <Section>
        <Row title="Open the setup checklist" sub="Connect Shopify, the owner PIN and the rest, with each one ticked off." spot={SPOT.deviceModeSetup} onPress={() => nav.push('setup', { again: true })} last />
      </Section>

      <Section title="Companion features" footer={practice ? 'Training is on, so nothing here can be changed.' : undefined}>
        {FEATURE_GROUPS.map((g, i) => (
          <View key={g.id} style={{ paddingBottom: i === FEATURE_GROUPS.length - 1 ? 0 : 8 }}>
            <Spot id={featureSpot(g.id)}>
              <Toggle label={g.title} sub={g.summary} value={features[g.id]} disabled={practice} onChange={v => { void setFeature(g.id, v); }} />
            </Spot>
            <Txt size={12} sub style={{ marginHorizontal: 16 }}>{g.items.join(' · ')}</Txt>
          </View>
        ))}
      </Section>

      {mode === 'companion' ? (
        <Section title="Locking" footer="The app asks for a PIN when it opens and locks itself when it has been idle or away. Changing the shop asks for your PIN again if you have not typed it recently.">
          <View style={{ padding: 14, gap: 6 }}>
            <Txt weight="600">Lock after being idle</Txt>
            <Segmented value={s.autoLockMinutes} options={AUTO_LOCK_CHOICES.map(v => ({ v, label: v === 0 ? 'Never' : `${v} min` }))} onChange={v => { void setMinutes('autoLockMinutes', v); }} />
            <Txt weight="600" style={{ marginTop: 12 }}>Ask for my PIN again after</Txt>
            <Segmented value={s.stepUpMinutes} options={STEP_UP_CHOICES.map(v => ({ v, label: v === 0 ? 'Every time' : `${v} min` }))} onChange={v => { void setMinutes('stepUpMinutes', v); }} />
          </View>
        </Section>
      ) : null}

      <View style={{ padding: 16, gap: 10 }}>
        {mode === 'companion'
          ? <Btn title="Switch this device to Register mode" icon="storefront-outline" kind="secondary" spot={SPOT.deviceModeRegister} disabled={practice} onPress={() => void setMode('register')} />
          : <Btn title="Switch this device to Companion mode" icon="phone-portrait-outline" kind="secondary" spot={SPOT.deviceModeCompanion} disabled={practice} onPress={() => void setMode('companion')} />}
        <Txt size={13} sub>A companion is a phone or tablet beside the till. A register is the till itself.</Txt>
      </View>
    </Page>
  );
}
