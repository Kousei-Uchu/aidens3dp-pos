// Location: src/ui/TrainingLayer.tsx
// Put inside a native Modal (our Sheet) so the training overlay can be drawn above it. Does nothing when training is off.
import React, { useEffect, useId } from 'react';
import { popLayer, pushLayer } from '../lib/trainingLayers';
import { useTraining } from '../state/trainingSession';
import TrainingOverlay from './TrainingOverlay';

export function TrainingLayer({ visible }: { visible: boolean }) {
  const sandbox = useTraining(s => s.sandbox); const id = useId();
  useEffect(() => { if (visible && sandbox) { pushLayer(id); return () => popLayer(id); } return undefined; }, [visible, sandbox, id]);
  if (!visible || !sandbox) return null;
  return <TrainingOverlay layer={id} />;
}
