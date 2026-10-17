// Location: src/screens/ScannerCodes.tsx
// The scanner's setup barcodes (from its manual), drawn from text. Shown inside the Help page settings/scanner-codes.
// Tap one and everything else on the screen goes away: just that barcode and a line saying what it does. Tap anywhere to come back.
import React, { useState } from 'react';
import { Modal, Pressable, StatusBar, View, useWindowDimensions } from 'react-native';
import { Card, Txt } from '../ui/kit';
import { Barcode128 } from '../ui/Barcode128';
import { useTheme } from '../ui/theme';
import { HidScanner } from './Scanner';
import { SCANNER_CODE_GROUPS, type ScannerCode } from '../lib/scannerCodes';

/** One barcode on its own: white screen, the barcode, what it does. Tap anywhere to close. */
/** `scanner` keeps a scan box alive on this screen (the speed test scans the barcode that is showing). `note` is one extra small line, such as the last timing. */
export function BarcodeFullScreen({ code, onClose, scanner, note }: { code: ScannerCode | null; onClose: () => void; scanner?: { onScan: (code: string) => void; onText: (text: string, now: number) => void }; note?: string }) {
  const win = useWindowDimensions();
  return (
    <Modal visible={!!code} animationType="fade" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close barcode" style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <StatusBar hidden />
        {scanner && code ? <HidScanner enabled onScan={scanner.onScan} onText={scanner.onText} /> : null}
        {code ? (
          <View style={{ alignItems: 'center', gap: 22, maxWidth: 900 }}>
            <Barcode128 value={code.text} width={Math.min(win.width - 64, 900)} height={Math.min(win.height * 0.3, 260)} label={`Barcode: ${code.label}`} />
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Txt size={26} weight="700" color="#000" style={{ textAlign: 'center' }}>{code.label}</Txt>
              <Txt size={18} color="#333" style={{ textAlign: 'center' }}>{code.what}</Txt>
              {note ? <Txt size={16} color="#111" weight="600" style={{ marginTop: 8 }}>{note}</Txt> : null}
              <Txt size={13} color="#666" style={{ marginTop: 10 }}>Tap anywhere to close</Txt>
            </View>
          </View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

export default function ScannerCodes() {
  const { c } = useTheme(); const win = useWindowDimensions();
  const [open, setOpen] = useState<ScannerCode | null>(null);
  const preview = Math.min(win.width - 120, 280);
  return (
    <View style={{ width: '100%', gap: 18, marginTop: 6 }}>
      {SCANNER_CODE_GROUPS.map(g => (
        <View key={g.id} style={{ gap: 8 }}>
          <Txt size={13} sub weight="600" style={{ textTransform: 'uppercase' }}>{g.title}</Txt>
          {g.intro ? <Txt size={13} sub>{g.intro}</Txt> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {g.codes.map(k => (
              <Card key={k.id} style={{ flexGrow: 1, flexBasis: 220 }}>
                <Pressable onPress={() => setOpen(k)} accessibilityRole="button" accessibilityLabel={`Show barcode: ${k.label}`} style={({ pressed }) => ({ padding: 12, gap: 8, alignItems: 'center', backgroundColor: pressed ? c.fill : 'transparent' })}>
                  <Barcode128 value={k.text} width={preview} height={54} label={`Barcode: ${k.label}`} />
                  <Txt weight="700" style={{ textAlign: 'center' }}>{k.label}{k.isDefault ? ' (default)' : ''}</Txt>
                  <Txt size={12} sub style={{ textAlign: 'center' }}>{k.what}</Txt>
                  <Txt size={11} sub style={{ fontVariant: ['tabular-nums'] }}>{k.text}</Txt>
                </Pressable>
              </Card>
            ))}
          </View>
        </View>
      ))}
      <BarcodeFullScreen code={open} onClose={() => setOpen(null)} />
    </View>
  );
}
