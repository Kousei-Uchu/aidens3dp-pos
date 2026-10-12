// Location: src/ui/PracticePass.tsx
// Stands in for the camera while someone practises signing in with a cashier pass. A camera cannot scan a pass that is not real,
// so the window draws the practice pass and a button plays the part of holding it under the scanner. Only ever shown during practice.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Btn, Sheet, Txt } from './kit';
import { useTheme } from './theme';
import { Barcode128 } from './Barcode128';
import { SPOT } from '../lib/trainingSpots';
import { practicePass } from '../lib/trainingPass';

export function PracticePassSheet({ visible, onClose, onScan, title }: { visible: boolean; onClose: () => void; onScan: (code: string) => string | null | Promise<string | null>; title?: string }) {
  const { c } = useTheme(); const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (!visible) setLast(null); }, [visible]);
  const pass = practicePass();
  const scan = async () => { const r = await onScan(pass.code); setLast(r ? { ok: true, text: r } : { ok: false, text: 'Not recognised. The pass may have been cancelled or replaced. Close this window and key your PIN instead.' }); };
  return (
    <Sheet visible={visible} onClose={onClose} title={title ?? 'Scan your cashier pass'}>
      <View style={{ gap: 12, alignItems: 'center' }}>
        <Txt sub style={{ textAlign: 'center' }}>Practice pass. On a real till you would hold the pass under the scanner or the camera.</Txt>
        <View style={{ width: '100%', borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, padding: 16, alignItems: 'center', gap: 6, opacity: pass.cancelled ? 0.6 : 1 }}>
          <Txt size={20} weight="700">{pass.name}</Txt>
          <Txt sub>{pass.role}{pass.cancelled ? ' · cancelled' : ''}</Txt>
          <Barcode128 value={pass.code} width={240} height={56} />
        </View>
        {last ? <Txt color={last.ok ? c.good : c.bad} style={{ textAlign: 'center' }}>{last.text}</Txt> : null}
        <Btn title="Scan this pass" icon="scan-outline" onPress={() => void scan()} spot={SPOT.passScan} style={{ width: '100%' }} />
      </View>
    </Sheet>
  );
}
