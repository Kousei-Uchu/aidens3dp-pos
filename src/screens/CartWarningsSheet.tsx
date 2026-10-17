// Location: src/screens/CartWarningsSheet.tsx
// Cart warnings prompt: shown by Charge before payment when cart items match configured warnings.
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Btn, Card, Sheet, Txt } from '../ui/kit';
import { SPOT } from '../lib/trainingSpots';
import { useTheme } from '../ui/theme';
import { useApp } from '../state/store';
import { matchCartWarnings, type MatchedCartWarning } from '../lib/cartWarnings';
import { useCatalogue } from '../state/selectors';

export default function CartWarningsSheet({ visible, onClose, onContinue }: { visible: boolean; onClose: () => void; onContinue: () => void }) {
  const { c } = useTheme();
  const settings = useApp(s => s.settings);
  const cat = useCatalogue();
  const cart = useApp(s => s.pos.cart);
  const [page, setPage] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);

  const matched = matchCartWarnings(cart, settings.cartWarnings, {
    variants: cat.variants,
    collectionsOfProduct: cat.collectionsOfProduct,
  });

  const currentWarning = matched[page];
  const totalPages = matched.length;
  const canContinue = !currentWarning || !currentWarning.warning.requireAcknowledgement || acknowledged;
  const allAcknowledged = matched.every(w => !w.warning.requireAcknowledgement);

  // When warnings change, reset page and ack
  const matchedKey = matched.map(w => `${w.warning.id}|${w.matches.map(m => m.lineId).join(',')}`).join('~');
  const [lastKey, setLastKey] = useState(matchedKey);
  if (matchedKey !== lastKey) {
    setPage(0);
    setAcknowledged(false);
    setLastKey(matchedKey);
  }

  if (!visible || matched.length === 0) return null;

  return (
    <Sheet
      visible={true}
      onClose={onClose}
      title={currentWarning ? currentWarning.warning.title : 'Customer Warning'}
      screen="sheet_cart_warnings"
    >
      <Txt sub style={{ marginBottom: 10 }}>
        {totalPages > 1 ? `Warning ${page + 1} of ${totalPages}` : 'Please review this warning before continuing.'}
      </Txt>

      <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 10 }}>
        {currentWarning && (
          <Card style={{ padding: 14, gap: 6 }}>
            <Txt weight="700" numberOfLines={2}>{currentWarning.warning.title}</Txt>
            <Txt size={14} style={{ marginTop: 4 }}>{currentWarning.warning.body}</Txt>
            <Txt size={12} sub style={{ marginTop: 8, color: c.sub }}>
              Triggered by: {currentWarning.matches.map(m => m.title).join(', ')}
            </Txt>
          </Card>
        )}
      </ScrollView>

      {totalPages > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
          <Btn
            spot={SPOT.warningBack}
            title="Back"
            kind="secondary"
            onPress={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          />
          <Btn
            spot={SPOT.warningNext}
            title="Next"
            onPress={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          />
        </View>
      )}

      {currentWarning?.warning.requireAcknowledgement && (
        <View style={{ marginTop: 10 }}>
          <Btn
            spot={SPOT.warningAcknowledge}
            title={acknowledged ? 'Acknowledged ✓' : 'I have read and understood this warning'}
            kind={acknowledged ? 'secondary' : 'primary'}
            onPress={() => setAcknowledged(true)}
          />
        </View>
      )}

      <View style={{ gap: 8, marginTop: 10 }}>
        <Btn
          spot={SPOT.warningContinue}
          title="Continue to payment"
          disabled={!canContinue}
          onPress={onContinue}
        />
        <Btn title="Back to cart" kind="secondary" onPress={onClose} />
      </View>
    </Sheet>
  );
}