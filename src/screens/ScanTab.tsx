// Location: src/screens/ScanTab.tsx
// The companion's Scan tab: one big button that opens the camera for a price check or a stock check. The lookup itself is the
// same sheet the checkout grid uses, so the cart is never touched (a companion may not even have one).
import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Btn, Segmented, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { LookupSheet, type LookupMode } from './Lookup';

export default function ScanTab() {
  const { c } = useTheme();
  const [mode, setMode] = useState<LookupMode>('price'); const [open, setOpen] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <Txt size={24} weight="700">Scan</Txt>
      </View>
      <View style={{ flex: 1, padding: 20, gap: 18, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Ionicons name={mode === 'price' ? 'pricetag-outline' : 'layers-outline'} size={56} color={c.sub} />
          <Txt size={13} sub style={{ textAlign: 'center' }}>{mode === 'price' ? 'Shows the price and any deals for an item.' : 'Shows how many are in stock, and the other variations.'}</Txt>
        </View>
        <Segmented value={mode} options={[{ v: 'price', label: 'Price check' }, { v: 'stock', label: 'Stock check' }]} onChange={setMode} />
        <Btn title="Scan an item" icon="barcode-outline" onPress={() => setOpen(true)} />
        <Txt size={12} sub style={{ textAlign: 'center' }}>A Bluetooth scanner works once the check is open. You can also search by name, SKU or barcode there.</Txt>
      </View>
      <LookupSheet mode={mode} visible={open} onClose={() => setOpen(false)} startWithCamera />
    </View>
  );
}
