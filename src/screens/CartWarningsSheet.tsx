// Location: src/screens/CartWarningsSheet.tsx
// "Customer warning": shown by Charge before payment (normal and guided checkout) when the cart holds an item or category
// that has a warning set in Settings ▸ Cart warnings, or when a warning is set to always show. One page per warning.
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Btn, Card, Sheet, Txt } from '../ui/kit';
import { SPOT } from '../lib/trainingSpots';
import { useTheme } from '../ui/theme';
import { useApp } from '../state/store';
import { useCatalogue } from '../state/selectors';
import { matchCartWarnings, pendingCartWarnings, triggerNames, unacknowledged, warningKey, warningTitle, type MatchedCartWarning } from '../lib/cartWarnings';

/**
 * Charge uses this to decide whether to stop at the warnings first. `pages` is what would be shown right now; `markSeen`
 * remembers the ones the cashier carried on from, so a warning is not asked again on the same sale unless it changes
 * (a warning set to always show is the exception: it comes up on every press of Charge).
 */
export function useCartWarningGate() {
  const cart = useApp(s => s.pos.cart); const warnings = useApp(s => s.settings.cartWarnings); const cat = useCatalogue();
  const [open, setOpen] = useState(false); const [seen, setSeen] = useState<string[]>([]);
  const pages = useMemo(() => pendingCartWarnings(matchCartWarnings(cart, warnings, cat), seen), [cart, warnings, cat, seen]);
  const markSeen = () => setSeen(s => Array.from(new Set([...s, ...pages.map(warningKey)])));
  const reset = () => { setOpen(false); setSeen([]); };
  // A new sale starts with nothing seen.
  const empty = cart.lines.length === 0;
  useEffect(() => { if (empty) setSeen([]); }, [empty]);
  return { pages, open, setOpen, markSeen, reset };
}

export default function CartWarningsSheet({ visible, pages, onClose, onContinue }: { visible: boolean; pages: MatchedCartWarning[]; onClose: () => void; onContinue: () => void }) {
  const { c } = useTheme();
  const [page, setPage] = useState(0); const [ticked, setTicked] = useState<string[]>([]);
  // Each time the window opens it starts on the first warning with nothing ticked.
  useEffect(() => { if (visible) { setPage(0); setTicked([]); } }, [visible]);
  const total = pages.length; const at = Math.min(page, Math.max(0, total - 1)); const cur = pages[at];
  if (!cur) return null;
  const last = at >= total - 1; const need = unacknowledged(pages, ticked); const done = ticked.includes(warningKey(cur));
  const names = triggerNames(cur);
  return (
    <Sheet visible={visible} onClose={onClose} title={warningTitle(cur.warning)} screen="sheet_cart_warnings">
      <Txt sub style={{ marginBottom: 10 }}>{total > 1 ? `Warning ${at + 1} of ${total}. Use Next and Back to read them all.` : 'Please read this before taking payment.'}</Txt>
      <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 10 }}>
        <Card style={{ padding: 14, gap: 6, borderColor: c.warn }}>
          <Txt size={15}>{cur.warning.body}</Txt>
          {names.length ? <Txt size={12} sub style={{ marginTop: 8 }}>For: {names.join(', ')}</Txt> : null}
        </Card>
      </ScrollView>
      {cur.warning.requireAcknowledgement ? (
        <View style={{ marginTop: 10 }}>
          <Btn spot={SPOT.warningAcknowledge} title={done ? 'Read and handled ✓' : 'I have read this and dealt with it'} kind={done ? 'secondary' : 'primary'} onPress={() => setTicked(t => (done ? t.filter(k => k !== warningKey(cur)) : [...t, warningKey(cur)]))} />
        </View>
      ) : null}
      {total > 1 ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Btn spot={SPOT.warningBack} title="Back" kind="secondary" disabled={at === 0} onPress={() => setPage(Math.max(0, at - 1))} style={{ flex: 1 }} />
          <Btn spot={SPOT.warningNext} title="Next" kind={last ? 'secondary' : 'primary'} disabled={last} onPress={() => setPage(Math.min(total - 1, at + 1))} style={{ flex: 1 }} />
        </View>
      ) : null}
      {last && need.length ? <Txt size={13} color={c.warn} weight="600" style={{ marginTop: 10, textAlign: 'center' }}>{need.length === 1 ? 'Tick the box on one warning to carry on.' : `Tick the box on ${need.length} warnings to carry on.`}</Txt> : null}
      <View style={{ gap: 8, marginTop: 10 }}>
        {last ? <Btn spot={SPOT.warningContinue} title="Continue to payment" disabled={need.length > 0} onPress={onContinue} /> : null}
        <Btn title="Back to cart" kind="secondary" onPress={onClose} />
      </View>
    </Sheet>
  );
}
