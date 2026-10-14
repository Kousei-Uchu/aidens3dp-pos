// Location: src/ui/TrainingLayer.tsx
// Put inside a native Modal (our Sheet) so the training overlay can be drawn above it. Does nothing when training is off.
// `screen` is the graph screen node this window is (a `sheet_*` screen), so the guidance engine can tell which window
// is open (`topLayer()`); left out, the layer is anonymous and guidance folds the window into the page under it.
import React, { useEffect, useId } from 'react';
import { popLayer, pushLayer } from '../lib/trainingLayers';
import { useTraining } from '../state/trainingSession';
import TrainingOverlay from './TrainingOverlay';

export function TrainingLayer({ visible, screen }: { visible: boolean; screen?: string }) {
  const sandbox = useTraining(s => s.sandbox); const id = useId(); const name = screen ?? id;
  useEffect(() => { if (visible && sandbox) { pushLayer(name); return () => popLayer(name); } return undefined; }, [visible, sandbox, name]);
  if (!visible || !sandbox) return null;
  return <TrainingOverlay layer={name} />;
}
