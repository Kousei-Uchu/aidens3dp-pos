// Location: src/ui/uiProfile.tsx
// Hands the signed-in person's display mode (text size, tabs, explanations) to every screen.
import React, { createContext, useContext, useMemo } from 'react';
import { useApp } from '../state/store';
import { useTraining } from '../state/trainingSession';
import { getModule } from '../training';
import { STANDARD_PROFILE, isSoleAdmin, resolveUi, type UiProfile } from '../lib/uiMode';

const Ctx = createContext<UiProfile>(STANDARD_PROFILE);
export function UiProvider({ children }: { children: React.ReactNode }) {
  const staff = useApp(s => s.settings.staff); const id = useApp(s => s.staffId);
  const forced = useTraining(s => (s.sandbox && s.run ? getModule(s.run.moduleId)?.flow : undefined)); // training: the module picks which checkout flow it is written for
  const profile = useMemo(() => {
    const m = staff.find(x => x.id === id);
    const p = m ? resolveUi(m.ui, { soleAdmin: isSoleAdmin(staff, m.id) }) : STANDARD_PROFILE;
    return forced ? { ...p, guided: forced === 'guided' } : p;
  }, [staff, id, forced]);
  return <Ctx.Provider value={profile}>{children}</Ctx.Provider>;
}
export const useUi = () => useContext(Ctx);
