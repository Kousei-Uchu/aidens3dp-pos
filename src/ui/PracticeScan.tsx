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
      <View style={{ gap: 12 }}>
        <Txt sub>Practice camera. On a real till you would hold each barcode in front of the camera. Here, tap Scan this on a card.</Txt>
        {last ? <Spot id={SPOT.scanResult} style={{ backgroundColor: last.ok ? '#15803D' : '#B91C1C', padding: 14, borderRadius: 14 }}><Txt color="#fff" weight="600" style={{ textAlign: 'center' }}>{last.text}</Txt></Spot> : null}
        <Btn title="Done" onPress={onClose} spot={SPOT.scanDone} />
        {PRACTICE_SCANS.map(s => (
          <View key={s.key} style={{ borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, padding: 14, gap: 8 }}>
            <Txt size={17} weight="700">{s.title}</Txt>
            <Txt sub>{s.sub}</Txt>
            <Barcode128 value={s.code} width={240} height={48} label={`Practice barcode: ${s.title}`} />
            <Btn title="Scan this" icon="scan-outline" kind="secondary" onPress={() => void scan(s.code)} spot={scanCardSpot(s.key)} />
          </View>
        ))}
      </View>
    </Sheet>
  );
}
