// Location: src/screens/DeviceMode.tsx
// Device mode (Companion plan, patch 0176): what this device is, and, for a companion, which register features it has.
// Open to every signed-in person, because a companion is usually somebody's phone rather than the shop's till.
//
// A register has every feature whatever is stored, so a register shows the mode and nothing to switch. The switches a
// companion had are kept while it is a register, so going back and forth does not lose them. The step-up PIN that
// should guard these changes arrives with patch 0177.
import React from 'react';
import { View } from 'react-native';
import { Btn, Page, Row, Section, Toggle, Txt, confirm } from '../ui/kit';
import { Spot } from '../ui/Spot';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { isTraining } from '../lib/trainingGuard';
import { FEATURE_GROUPS, resolveFeatures, type DeviceMode, type FeatureId } from '../lib/appMode';
import { featureSpot, SPOT } from '../lib/trainingSpots';

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
    if (ok) patch({ appMode: next });
  };

  const setFeature = (id: FeatureId, on: boolean) => patch({ registerFeatures: { ...resolveFeatures('companion', s.registerFeatures), [id]: on } });

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
              <Toggle label={g.title} sub={g.summary} value={features[g.id]} disabled={practice} onChange={v => setFeature(g.id, v)} />
            </Spot>
            <Txt size={12} sub style={{ marginHorizontal: 16 }}>{g.items.join(' · ')}</Txt>
          </View>
        ))}
      </Section>

      <View style={{ padding: 16, gap: 10 }}>
        {mode === 'companion'
          ? <Btn title="Switch this device to Register mode" icon="storefront-outline" kind="secondary" spot={SPOT.deviceModeRegister} disabled={practice} onPress={() => void setMode('register')} />
          : <Btn title="Switch this device to Companion mode" icon="phone-portrait-outline" kind="secondary" spot={SPOT.deviceModeCompanion} disabled={practice} onPress={() => void setMode('companion')} />}
        <Txt size={13} sub>A companion is a phone or tablet beside the till. A register is the till itself.</Txt>
      </View>
    </Page>
  );
}
