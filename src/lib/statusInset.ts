// Location: src/lib/statusInset.ts
// Pure rule for the app's own status bar (src/ui/AppStatusBar.tsx). No React Native imports, so it runs in the node tests.
//
// The iOS status bar is hidden, so the safe-area top inset is only whatever the device really needs (a notch, or nothing on an iPad).
// If iOS shows its own bar again for a moment (a full-screen window such as the screensaver opening or closing is the usual trigger),
// the inset jumps up by the height of that bar and our bar would be pushed down, leaving a gap and two bars. So the bar keeps the
// smallest inset it has seen for the current orientation and ignores a rise. A rotation starts again, because the notch side really
// does change then.
export type InsetLatch = { key: string; top: number };

/** `key` says which orientation we are in (for example 'portrait'); `inset` is the safe-area top right now. */
export function latchTopInset(prev: InsetLatch | null, key: string, inset: number): InsetLatch {
  const top = Number.isFinite(inset) && inset > 0 ? inset : 0;
  if (!prev || prev.key !== key) return { key, top };
  return top < prev.top ? { key, top } : prev;
}
