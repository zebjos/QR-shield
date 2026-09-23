import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { VerdictStatus } from '../verdict/getUrlVerdict';

interface DebugSettingsValue {
  buttonVisible: boolean;
  hideButton: () => void;
  forcedVerdict: VerdictStatus | null;
  setForcedVerdict: (status: VerdictStatus | null) => void;
}

const DebugSettingsContext = createContext<DebugSettingsValue | null>(null);

export function DebugSettingsProvider({ children }: { children: ReactNode }) {
  const [buttonVisible, setButtonVisible] = useState(true);
  const [forcedVerdict, setForcedVerdict] = useState<VerdictStatus | null>(null);

  const value = useMemo<DebugSettingsValue>(
    () => ({
      buttonVisible,
      hideButton: () => setButtonVisible(false),
      forcedVerdict,
      setForcedVerdict,
    }),
    [buttonVisible, forcedVerdict]
  );

  return (
    <DebugSettingsContext.Provider value={value}>
      {children}
    </DebugSettingsContext.Provider>
  );
}

export function useDebugSettings(): DebugSettingsValue {
  const ctx = useContext(DebugSettingsContext);
  if (!ctx) {
    throw new Error('useDebugSettings must be used within a DebugSettingsProvider');
  }
  return ctx;
}
