// Location: src/ui/RouteTransition.tsx
// Page changes for every pushed page: the new page slides in while the old one drifts away (when it is safe to draw it again, see canLeaveDrawn),
// instead of the old page vanishing the instant the new one starts.
// The change is worked out DURING render (state derived from the route stack), so the new page mounts already knowing it is entering. If it
// worked this out in an effect, the page would be on screen for one frame before it knew to animate.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import type { Route } from './nav';
import { Pane, useReduceMotion } from './Motion';
import { ROUTE_ENTER_MS, canLeaveDrawn, isAnimatedRoute, leavingOnTop, slideDistance, transitionDir, transitionNeeded, type From } from '../lib/motion';

/** `route` is the page that stays drawn while it leaves (null: nothing to keep, or it was a tab screen). `enter` is whether the new page slides in. */
export type RoutePlan = { route: Route | null; dir: From; enter: boolean; id: number };
type Snap = { top: Route | null; depth: number; plan: RoutePlan | null };

/** `plan` is set from the moment the top page changes until the animation has finished; it is null the rest of the time. `route` is the page that is leaving (null when it was a tab screen). */
export function useRouteTransition(stack: Route[], practice?: readonly string[]): { plan: RoutePlan | null } {
  const depth = stack.length; const top = stack[depth - 1] ?? null; const reduce = useReduceMotion(); const seq = useRef(0);
  const [snap, setSnap] = useState<Snap>({ top, depth, plan: null });
  if (snap.top !== top || snap.depth !== depth) {
    // A page that only animated because a course was running (the cart, Pay) does not stay drawn once the course has ended: it would be showing the real till.
    const animate = !reduce && transitionNeeded(snap.top?.name, top?.name, practice);
    setSnap({ top, depth, plan: animate ? { route: canLeaveDrawn(snap.top?.name, practice) ? snap.top : null, dir: transitionDir(snap.top ? { name: snap.top.name, depth: snap.depth } : null, top ? { name: top.name, depth } : null), enter: isAnimatedRoute(top?.name, practice), id: ++seq.current } : null });
  }
  const id = snap.plan?.id;
  useEffect(() => {
    if (id === undefined) return undefined;
    const t = setTimeout(() => setSnap(s => (s.plan?.id === id ? { ...s, plan: null } : s)), ROUTE_ENTER_MS + 80);
    return () => clearTimeout(t);
  }, [id]);
  return { plan: snap.plan };
}

const fill = StyleSheet.absoluteFillObject;
/** The page on top, and the page that is leaving while the plan lasts. Going back the leaving page is drawn above, going forward the new page is. */
export function RouteStage({ stack, plan, render }: { stack: Route[]; plan: RoutePlan | null; render: (r: Route) => React.ReactNode }) {
  const win = useWindowDimensions(); const distance = slideDistance(win.width); const depth = stack.length; const top = stack[depth - 1] ?? null;
  const dir: From = plan?.dir ?? 'none';
  const arriving = top ? <Pane key={`in:${top.name}:${depth}`} mode={plan?.enter ? 'enter' : 'still'} dir={dir} distance={distance} style={fill}>{render(top)}</Pane> : null;
  const leaving = plan?.route ? <Pane key={`out:${plan.id}`} mode="leave" dir={dir} distance={distance} pointerEvents="none" style={fill}>{render(plan.route)}</Pane> : null;
  return <>{plan && leavingOnTop(dir) ? <>{arriving}{leaving}</> : <>{leaving}{arriving}</>}</>;
}
