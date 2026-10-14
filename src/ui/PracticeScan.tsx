// Location: src/ui/PracticeScan.tsx
// Stands in for the camera while someone practises scanning. A camera cannot scan an item that is not real, so the window draws the practice barcodes
// (see trainingScan.ts) and a button on each plays the part of holding that barcode in front of the camera. It behaves like the real camera window:
// it stays open for as many scans as you like, shows a green message for a scan that worked and a red one for a code the till did not know, and closes with Done.
// Only ever shown during practice.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Btn, Sheet, Txt } from './kit';
import { Spot } from './Spot';
import { useTheme } from './theme';
import { Barcode128 } from './Barcode128';
import { SPOT, scanCardSpot } from '../lib/trainingSpots';
import { PRACTICE_SCANS } from '../lib/trainingScan';

export function PracticeScanSheet({ visible, onClose, onScan, title }: { visible: boolean; onClose: () => void; onScan: (code: string) => string | null | Promise<string | null>; title?: string }) {
  const { c } = useTheme(); const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (!visible) setLast(null); }, [visible]);
  const scan = async (code: string) => { const r = await onScan(code); setLast(r ? { ok: true, text: r } : { ok: false, text: `Not found: ${code}` }); };
  return (
    <Sheet visible={visible} onClose={onClose} title={title ?? 'Scan barcode'} screen="overlay_practice_camera">
      <View style={{ gap: 10 }}>
        <Txt sub>Practice camera. On a real till you would hold each barcode in front of the camera. Here, tap Scan this on a card.</Txt>
        {/* Always there (0119), so a step can point at it before the first scan: it says what the last scan did. */}
        <Spot id={SPOT.scanResult} style={{ backgroundColor: last ? (last.ok ? '#15803D' : '#B91C1C') : c.fill, padding: 12, borderRadius: 14 }}><Txt color={last ? '#fff' : undefined} sub={!last} weight="600" style={{ textAlign: 'center' }}>{last ? last.text : 'Nothing scanned yet'}</Txt></Spot>
        <Btn title="Done" onPress={onClose} spot={SPOT.scanDone} />
        {PRACTICE_SCANS.map(s => (
          <View key={s.key} style={{ borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt size={15} weight="700">{s.title}</Txt>
              <Txt size={12} sub>{s.sub}</Txt>
              <Barcode128 value={s.code} width={150} height={30} label={`Practice barcode: ${s.title}`} />
            </View>
            <Btn title="Scan this" icon="scan-outline" kind="secondary" small onPress={() => void scan(s.code)} spot={scanCardSpot(s.key)} />
          </View>
        ))}
      </View>
    </Sheet>
  );
}
