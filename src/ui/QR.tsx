// Location: src/ui/QR.tsx
import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import qrcode from 'qrcode-generator';

/** QR code on a white tile (always dark-on-white so it scans in dark mode too). Pure JS + react-native-svg: no native module. */
export function QR({ value, size = 240 }: { value: string; size?: number }) {
  const { d, n } = useMemo(() => {
    const q = qrcode(0, 'M'); q.addData(value); q.make(); const n = q.getModuleCount(); let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { d, n };
  }, [value]);
  const quiet = 3; const box = n + quiet * 2;
  return (
    <View style={{ backgroundColor: '#fff', padding: 8, borderRadius: 12, alignSelf: 'center' }} accessibilityLabel="QR code for the receipt">
      <Svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${box} ${box}`}><Path d={d} fill="#000" /></Svg>
    </View>
  );
}
