// Location: src/ui/HelpMenu.tsx
// 0092 (device test T8): the pop-out nested contents menu for Help, like the side menu on a web docs site. Slides in from the left over the page,
// shows the whole page tree with sections that open and close, and highlights the page you are on. Tapping a title opens that page and closes the
// menu; tapping the arrow only opens or closes the section. Sits beside the existing ways round Help (search, trail, lists, links), replacing none of them.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IconBtn, Txt } from './kit';
import { RevealScroll } from './keyboard';
import { useLayout, useTheme } from './theme';
import { useReduceMotion } from './Motion';
import { noteActivity } from '../lib/idle';
import { ROOT_ID, type HelpIndex } from '../lib/helpDocs';
import { openFor, toggled, treeRows } from '../lib/helpTree';

export function HelpMenu({ visible, onClose, index, current, onPick }: { visible: boolean; onClose: () => void; index: HelpIndex; current: string; onPick: (id: string) => void }) {
  const { c } = useTheme(); const { width } = useLayout(); const reduce = useReduceMotion();
  const panelW = Math.min(360, Math.max(260, Math.round(width * 0.86)));
  const [open, setOpen] = useState<Set<string>>(() => openFor(index, current));
  useEffect(() => { if (visible) setOpen(openFor(index, current)); }, [visible, index, current]); // each opening starts with the current page showing
  const x = useRef(new Animated.Value(-panelW)).current; const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    if (reduce) { x.setValue(0); fade.setValue(1); return; }
    x.setValue(-panelW); fade.setValue(0);
    Animated.parallel([Animated.timing(x, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }), Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true })]).start();
  }, [visible, reduce, panelW, x, fade]);
  const rows = useMemo(() => treeRows(index, open, current), [index, open, current]);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View onTouchStart={noteActivity} style={{ flex: 1, flexDirection: 'row' }}>
        <Animated.View style={{ width: panelW, backgroundColor: c.card, paddingTop: 48, paddingBottom: 16, borderTopRightRadius: 20, borderBottomRightRadius: 20, transform: [{ translateX: x }] }} accessibilityViewIsModal>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 }}>
            <Txt size={18} weight="700" style={{ flex: 1 }}>Help contents</Txt><IconBtn icon="close" label="Close contents" onPress={onClose} />
          </View>
          <RevealScroll contentContainerStyle={{ paddingBottom: 24 }}>
            {rows.map(r => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 8 + r.depth * 16, paddingRight: 8, backgroundColor: r.current ? c.fill : 'transparent' }}>
                {r.hasKids ? (
                  <Pressable onPress={() => setOpen(o => toggled(o, r.id))} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${r.open ? 'Close' : 'Open'} ${r.title}`} accessibilityState={{ expanded: r.open }} style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={r.open ? 'chevron-down' : 'chevron-forward'} size={18} color={c.sub} />
                  </Pressable>
                ) : <View style={{ width: 36 }} />}
                <Pressable onPress={() => { onPick(r.id); onClose(); }} accessibilityRole="button" accessibilityLabel={r.title} accessibilityState={{ selected: r.current }} style={({ pressed }) => ({ flex: 1, minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                  <Txt size={15} weight={r.current || r.id === ROOT_ID ? '700' : '400'} color={r.current ? c.accent : undefined} numberOfLines={2}>{r.title}</Txt>
                </Pressable>
              </View>
            ))}
          </RevealScroll>
        </Animated.View>
        <Animated.View style={{ flex: 1, backgroundColor: c.overlay, opacity: fade }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close contents" />
        </Animated.View>
      </View>
    </Modal>
  );
}
