import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';
import { useApp } from '../state/store';

export type Colors = { bg: string; card: string; line: string; text: string; sub: string; accent: string; onAccent: string; good: string; bad: string; warn: string; tile: string; fill: string; overlay: string };
const light: Colors = { bg: '#F4F4F5', card: '#FFFFFF', line: '#E4E4E7', text: '#111111', sub: '#6B7280', accent: '#111111', onAccent: '#FFFFFF', good: '#15803D', bad: '#DC2626', warn: '#B45309', tile: '#EDEDF0', fill: '#F0F0F2', overlay: 'rgba(0,0,0,0.4)' };
const dark: Colors = { bg: '#0B0B0C', card: '#1A1A1C', line: '#2C2C30', text: '#F4F4F5', sub: '#9CA3AF', accent: '#F4F4F5', onAccent: '#111111', good: '#4ADE80', bad: '#F87171', warn: '#FBBF24', tile: '#26262A', fill: '#222226', overlay: 'rgba(0,0,0,0.6)' };

export const TILE_COLORS = ['#E5E7EB', '#FECACA', '#FED7AA', '#FEF08A', '#BBF7D0', '#BFDBFE', '#DDD6FE', '#FBCFE8'];
const Ctx = createContext<{ c: Colors; dark: boolean }>({ c: light, dark: false });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const sys = useColorScheme(); const { theme, accent } = useApp(s => s.settings);
  const isDark = theme === 'dark' || (theme === 'system' && sys === 'dark');
  const value = useMemo(() => { const base = isDark ? dark : light; return { dark: isDark, c: { ...base, accent: accent && accent !== '#111111' ? accent : base.accent, onAccent: accent && accent !== '#111111' ? '#FFFFFF' : base.onAccent } }; }, [isDark, accent]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);

/** Size class decides phone vs tablet (compact width), not device model – so iPad Split View behaves like a phone. */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  return { width, height, tablet: width >= 700, landscape: width > height };
}
