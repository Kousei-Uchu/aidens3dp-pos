// Location: src/screens/ScannerSpeed.tsx
// Settings ▸ Hardware: the scanner test, the speed test (the app times the scan itself) and, for managers and owners, the Calibrate menu.
import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, Row, Section, Sheet, Txt, alertMsg, confirm } from '../ui/kit';
import { useApp } from '../state/store';
import { HidScanner, nowMs } from './Scanner';
import { BarcodeFullScreen } from './ScannerCodes';
import { saveScannerCalibration } from '../lib/sync';
import { actingRole } from '../lib/adjustPerms';
import { ALL_SCANNER_CODES, DEFAULT_SPEED_RANGES, SPEED_TABLE, speedForInterval, type ScannerCode, type SpeedId } from '../lib/scannerCodes';
import { MAX_SAMPLES, MIN_SAMPLES, SPEED_IDS, SPEED_NAME, SPEED_TEST_TEXT, calibrationProblems, canCalibrate, describeRange, effectiveRanges, measure, newTiming, noteChange, rangeFromSamples, withRange, type Measurement } from '../lib/scanSpeed';

const codeById = (id: string): ScannerCode => ALL_SCANNER_CODES.find(c => c.id === id)!;
const testCode = codeById('speed-test');
const ms = (n: number) => `${n.toFixed(1)} ms`;

export function HardwareTest() {
  const cal = useApp(s => s.settings.scannerCal); const ranges = effectiveRanges(cal);
  const role = useApp(s => actingRole(s.settings.requirePin, s.settings.staff, s.staffId)); const admin = canCalibrate(role);
  const [scans, setScans] = useState<{ code: string; m: Measurement | null }[]>([]);
  const [test, setTest] = useState<Measurement | null>(null);
  const [full, setFull] = useState<ScannerCode | null>(null); const [calOpen, setCalOpen] = useState(false);
  const timing = useRef(newTiming()); const onSample = useRef<((m: Measurement) => void) | null>(null);
  const onText = (t: string, now: number) => { timing.current = noteChange(timing.current, t, now); };
  const onScan = (code: string) => {
    const m = measure(timing.current, code); timing.current = newTiming();
    setScans(l => [{ code, m }, ...l].slice(0, 8));
    if (code === SPEED_TEST_TEXT && m) { setTest(m); onSample.current?.(m); }
  };
  const scanner = { onScan, onText };
  const got = test ? speedForInterval(test.msPerChar, ranges) : null;
  const slower = got ? SPEED_TABLE[SPEED_TABLE.findIndex(s => s.codeId === got.codeId) + 1] : undefined;

  return (
    <View style={{ padding: 16, gap: 10 }}>
      <Txt>Pair your Bluetooth scanner in iOS Settings (HID keyboard mode), then scan any barcode:</Txt>
      <HidScanner enabled={!full && !calOpen} onScan={onScan} onText={onText} />
      <Card>{scans.length ? scans.map((x, i) => <Row key={i} title={x.code} sub={x.m ? `${ms(x.m.msPerChar)} per character` : undefined} last={i === scans.length - 1} />) : <Row title="Waiting for a scan…" last />}</Card>
      <Txt size={12} sub>Scans here only test the scanner - nothing is added to the cart.</Txt>

      <Section title="Speed test" footer={cal ? `Using the calibration saved by ${cal.updatedBy || 'a manager'}.` : 'Using the speed ranges from the scanner manual. A manager or owner can calibrate them for this shop.'}>
        <View style={{ padding: 16, gap: 10 }}>
          <Txt size={14}>If scanned barcodes come in wrong, find out how fast the scanner types. Show the test barcode, scan it with the scanner, and the app times it.</Txt>
          <Btn title="Show the speed test barcode" kind="secondary" icon="barcode-outline" onPress={() => setFull(testCode)} />
          {test && got ? (
            <View style={{ gap: 6 }}>
              <Txt weight="700">{ms(test.msPerChar)} per character</Txt>
              <Txt size={13} sub>{test.chars} characters in {ms(test.totalMs)}. That matches {SPEED_NAME[got.codeId]} speed ({describeRange(ranges[got.codeId])}).</Txt>
              {slower ? <><Txt size={13} sub>If barcodes still come in with missing or wrong characters, set the next slower speed.</Txt>
                <Btn small kind="secondary" title={`Show ${SPEED_NAME[slower.codeId]} speed barcode`} onPress={() => setFull(codeById(slower.codeId))} /></> : <Txt size={13} sub>This is the slowest speed there is.</Txt>}
            </View>
          ) : <Txt size={13} sub>No speed test scanned yet.</Txt>}
        </View>
      </Section>

      {admin ? (
        <Section title="Admin" footer="Calibrating changes what every register thinks each speed measures as. Only managers and owners see this.">
          <Row icon="options-outline" title="Calibrate" sub={cal ? `Calibrated ${cal.updatedAt ? new Date(cal.updatedAt).toLocaleDateString() : ''}` : 'Using the manual’s ranges'} last onPress={() => setCalOpen(true)} />
        </Section>
      ) : null}

      <BarcodeFullScreen code={full} onClose={() => setFull(null)} scanner={full?.id === 'speed-test' ? scanner : undefined} note={full?.id === 'speed-test' && test ? `Last scan: ${ms(test.msPerChar)} per character` : undefined} />
      {admin ? <CalibrateSheet visible={calOpen} onClose={() => setCalOpen(false)} scanner={scanner} onSample={onSample} /> : null}
    </View>
  );
}

function CalibrateSheet({ visible, onClose, scanner, onSample }: { visible: boolean; onClose: () => void; scanner: { onScan: (c: string) => void; onText: (t: string, n: number) => void }; onSample: React.MutableRefObject<((m: Measurement) => void) | null> }) {
  const cal = useApp(s => s.settings.scannerCal); const ranges = effectiveRanges(cal);
  const who = useApp(s => s.settings.staff.find(m => m.id === s.staffId)?.name ?? s.settings.registerName);
  const [pick, setPick] = useState<SpeedId | null>(null); const [samples, setSamples] = useState<number[]>([]); const [full, setFull] = useState<ScannerCode | null>(null);
  // While this window is open, a scan of the test code adds a sample for the speed being calibrated.
  onSample.current = visible && pick ? m => setSamples(s => (s.length >= MAX_SAMPLES ? s : [...s, Math.round(m.msPerChar * 10) / 10])) : null;
  const choose = (id: SpeedId | null) => { setPick(id); setSamples([]); };
  const save = async () => {
    if (!pick) return;
    try {
      const next = { version: 1 as const, ranges: withRange(ranges, pick, rangeFromSamples(samples)), updatedBy: who, updatedAt: new Date().toISOString() };
      const problems = calibrationProblems(next.ranges);
      if (problems.length) return alertMsg('Cannot save this calibration', problems.join('\n'), 'settings/scanner-codes');
      await saveScannerCalibration(next).catch(() => alertMsg('Saved on this register only', 'Shopify could not be reached. It will be shared with the other registers when the connection is back.'));
      choose(null);
    } catch (e: any) { alertMsg('Cannot save', e.message, 'settings/scanner-codes'); }
  };
  const reset = async () => {
    if (!await confirm('Go back to the manual’s ranges?', 'This removes the calibration on every register.', 'Reset', true)) return;
    await saveScannerCalibration(null).catch(() => {}); choose(null);
  };
  const speed = pick ? codeById(pick) : null;
  return (
    <Sheet visible={visible} onClose={() => { choose(null); onClose(); }} title={pick ? `Calibrate ${SPEED_NAME[pick]}` : 'Calibrate scanner speed'} full>
      {visible && !full ? <HidScanner enabled onScan={scanner.onScan} onText={scanner.onText} /> : null}
      {!pick ? (
        <View style={{ gap: 12 }}>
          <Txt size={14}>The app measures the scanner for you. Pick a speed, set the scanner to it, then scan the test barcode a few times. Do this for all four speeds. The result is shared with every register.</Txt>
          <Card>{SPEED_IDS.map((id, i) => <Row key={id} title={`${SPEED_NAME[id]} speed`} sub={`${describeRange(ranges[id])}${cal ? '' : ' (manual)'}`} last={i === SPEED_IDS.length - 1} onPress={() => choose(id)} />)}</Card>
          <Btn kind="ghost" title="Reset to the manual’s ranges" disabled={!cal} onPress={() => void reset()} />
          <Txt size={12} sub>The manual’s ranges are {SPEED_IDS.map(id => `${SPEED_NAME[id]} ${describeRange(DEFAULT_SPEED_RANGES[id])}`).join(', ')}.</Txt>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Txt weight="700">1. Set the scanner to {SPEED_NAME[pick]} speed</Txt>
          <Btn kind="secondary" icon="barcode-outline" title={`Show the ${SPEED_NAME[pick]} speed barcode`} onPress={() => setFull(speed)} />
          <Txt weight="700">2. Scan the test barcode {MIN_SAMPLES} to {MAX_SAMPLES} times</Txt>
          <Btn kind="secondary" icon="barcode-outline" title="Show the speed test barcode" onPress={() => setFull(testCode)} />
          <Txt weight="700">3. Save</Txt>
          <Card>{samples.length ? samples.map((n, i) => <Row key={i} title={`Scan ${i + 1}`} sub={`${ms(n)} per character`} last={i === samples.length - 1} />) : <Row title="No test scans yet" last />}</Card>
          <Btn title={samples.length >= MIN_SAMPLES ? `Save ${SPEED_NAME[pick]} range` : `Need ${MIN_SAMPLES - samples.length} more scan${MIN_SAMPLES - samples.length === 1 ? '' : 's'}`} disabled={samples.length < MIN_SAMPLES} onPress={() => void save()} />
          <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Btn kind="ghost" title="Clear scans" disabled={!samples.length} onPress={() => setSamples([])} /></View><View style={{ flex: 1 }}><Btn kind="ghost" title="Back" onPress={() => choose(null)} /></View></View>
        </View>
      )}
      <BarcodeFullScreen code={full} onClose={() => setFull(null)} scanner={full?.id === 'speed-test' ? scanner : undefined}
        note={full?.id === 'speed-test' ? `${samples.length} of ${MIN_SAMPLES}+ scans${samples.length ? ` · last ${ms(samples[samples.length - 1])}` : ''}` : undefined} />
    </Sheet>
  );
}
