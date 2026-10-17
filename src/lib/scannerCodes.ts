// Location: src/lib/scannerCodes.ts
// The setup barcodes for the POS-mate PM-BCBT2D-W scanner, from its manual, as plain text. The Help screen draws each one as a Code 128
// barcode (src/lib/code128.ts), so to add or fix a code you only change the `text` here. Pure, no React.

export type ScannerCode = {
  id: string;
  /** What is printed on the button and the full-screen view. */
  label: string;
  /** One short line: what scanning this does. Shown under the barcode when it is full screen. */
  what: string;
  /** The exact text encoded in the barcode. Printable ASCII only. */
  text: string;
  /** The factory setting, as listed in the manual. */
  isDefault?: boolean;
  /** A test code, not a setting: scan it into a text box and read what comes out. */
  test?: boolean;
};
export type ScannerCodeGroup = { id: string; title: string; intro?: string; codes: ScannerCode[] };

export const SCANNER_CODE_GROUPS: ScannerCodeGroup[] = [
  { id: 'pairing', title: 'Pairing', intro: 'Scan this, then pair the scanner in the iPad\'s Settings ▸ Bluetooth. Pair it as a keyboard.', codes: [
    { id: 'pairing-mode', label: 'Pairing mode', what: 'Starts pairing so the scanner shows up in the iPad\'s Bluetooth list.', text: '%%SpecCode99' },
  ] },
  { id: 'vibration', title: 'Vibration', codes: [
    { id: 'vibration-on', label: 'Vibration on', what: 'The scanner buzzes after each good scan.', text: '%%SpecCode77', isDefault: true },
    { id: 'vibration-off', label: 'Vibration off', what: 'The scanner stays silent in the hand after a scan.', text: '%%SpecCode76' },
  ] },
  { id: 'volume', title: 'Volume', codes: [
    { id: 'volume-mute', label: 'Mute', what: 'No beep after a scan.', text: '%%SpecCode94' },
    { id: 'volume-low', label: 'Low volume', what: 'A quiet beep after a scan.', text: '%%SpecCode95' },
    { id: 'volume-high', label: 'High volume', what: 'A loud beep after a scan.', text: '%%SpecCode97', isDefault: true },
  ] },
  { id: 'sleep', title: 'Sleep', intro: 'How long the scanner waits, unused, before it goes to sleep.', codes: [
    { id: 'sleep-5', label: 'Sleep after 5 minutes', what: 'Goes to sleep after 5 minutes unused.', text: '%%SpecCode33', isDefault: true },
    { id: 'sleep-30', label: 'Sleep after 30 minutes', what: 'Goes to sleep after 30 minutes unused.', text: '%%SpecCode35' },
    { id: 'sleep-never', label: 'Never sleep', what: 'Stays awake until the battery runs out.', text: '%%SpecCode36' },
  ] },
  { id: 'scan-mode', title: 'Scanning mode', codes: [
    { id: 'scan-auto', label: 'Auto scan', what: 'Scans by itself when a barcode is put in front of it.', text: 'TRIGPRE' },
    { id: 'scan-manual', label: 'Manual scan', what: 'Scans only while the trigger button is pressed.', text: 'TRIGMAN', isDefault: true },
  ] },
  { id: 'speed', title: 'Data entry speed', intro: 'If barcodes are not entering correctly, scan one of these to set a slower speed. Scan the test code first to find which speed suits.', codes: [
    { id: 'speed-test', label: 'Speed test', what: 'Scan this into a text box and time how long it takes to type. Match the time to the speed table on this page.', text: 'HID_SCANNER_SPEED_TEST', test: true },
    { id: 'speed-fast', label: 'Fast speed', what: 'About 6 codes a second.', text: '%%SpecCodeB0', isDefault: true },
    { id: 'speed-medium', label: 'Medium speed', what: 'About 1 code a second.', text: '%%SpecCodeB1' },
    { id: 'speed-slow', label: 'Slow speed', what: 'About 1.5 seconds a code.', text: '%%SpecCodeB2' },
    { id: 'speed-super-slow', label: 'Super slow speed', what: 'About 6 seconds a code.', text: '%%SpecCodeB3' },
  ] },
];

export const ALL_SCANNER_CODES: ScannerCode[] = SCANNER_CODE_GROUPS.flatMap(g => g.codes);

/** Time between typed characters (milliseconds, from the first character to the last) for each speed setting, and the code that sets it. */
export const SPEED_TABLE = [
  { codeId: 'speed-fast', name: 'Fast', minMs: 3, maxMs: 6 },
  { codeId: 'speed-medium', name: 'Medium', minMs: 17, maxMs: 21 },
  { codeId: 'speed-slow', name: 'Slow', minMs: 42, maxMs: 46 },
  { codeId: 'speed-super-slow', name: 'Super slow', minMs: 150, maxMs: 152 },
] as const;

export type SpeedId = (typeof SPEED_TABLE)[number]['codeId'];
export type SpeedRanges = Record<SpeedId, { minMs: number; maxMs: number }>;
/** The ranges from the manual and the first measurements. A calibration (src/lib/scanSpeed.ts) replaces them. */
export const DEFAULT_SPEED_RANGES: SpeedRanges = Object.fromEntries(SPEED_TABLE.map(s => [s.codeId, { minMs: s.minMs, maxMs: s.maxMs }])) as SpeedRanges;

/**
 * The speed setting whose range is closest to a measured gap between characters (ms per character). Inside a range is distance 0.
 * When two ranges are equally close (or overlap), the nearer centre wins; a dead tie goes to the slower speed, the safer one.
 */
export function speedForInterval(msPerChar: number, ranges: SpeedRanges = DEFAULT_SPEED_RANGES): (typeof SPEED_TABLE)[number] {
  if (!Number.isFinite(msPerChar) || msPerChar < 0) throw new Error('Enter the time per character in milliseconds');
  const dist = (r: { minMs: number; maxMs: number }) => (msPerChar < r.minMs ? r.minMs - msPerChar : msPerChar > r.maxMs ? msPerChar - r.maxMs : 0);
  const centre = (r: { minMs: number; maxMs: number }) => Math.abs(msPerChar - (r.minMs + r.maxMs) / 2);
  let best: (typeof SPEED_TABLE)[number] = SPEED_TABLE[0];
  for (const s of SPEED_TABLE) {
    const a = ranges[s.codeId]; const b = ranges[best.codeId];
    if (dist(a) < dist(b) || (dist(a) === dist(b) && centre(a) <= centre(b))) best = s;
  }
  return best;
}
