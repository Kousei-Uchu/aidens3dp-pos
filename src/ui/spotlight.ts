// Location: src/ui/spotlight.ts
// The training spotlight colours for the current theme (see src/lib/trainingPalette.ts). Not in kit.tsx, because kit imports the overlay.
import { useMemo } from 'react';
import { useTheme } from './theme';
import { spotlightPalette, type SpotlightPalette } from '../lib/trainingPalette';

export function useSpotlight(): SpotlightPalette { const { c, dark } = useTheme(); return useMemo(() => spotlightPalette(c, dark), [c.bg, c.card, c.text, c.accent, dark]); } // eslint-disable-line react-hooks/exhaustive-deps
