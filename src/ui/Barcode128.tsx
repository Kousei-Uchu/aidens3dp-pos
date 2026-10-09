// Location: src/ui/Barcode128.tsx
import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { code128Path } from '../lib/code128';

/** Code 128 on a white tile (dark on white so it scans in dark mode too). */
export function Barcode128({ value, width = 300, height = 70 }: { value: string; width?: number; height?: number }) {
  const { d, w } = useMemo(() => { const r = code128Path(value); return { d: r.d, w: r.width }; }, [value]);
  return (
    <View style={{ backgroundColor: '#fff', padding: 8, borderRadius: 10, alignSelf: 'center' }} accessibilityLabel="Barcode for the cashier pass">
      <Svg width={width} height={height} viewBox={`0 0 ${w} 1`} preserveAspectRatio="none"><Path d={d} fill="#000" /></Svg>
    </View>
  );
}
