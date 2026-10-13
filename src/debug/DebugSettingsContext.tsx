import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { DangerReasonCode, VerdictStatus } from '../verdict/getUrlVerdict';

interface DebugSettingsValue {
  buttonVisible: boolean;
  hideButton: () => void;
  forcedVerdict: VerdictStatus | null;
  setForcedVerdict: (status: VerdictStatus | null) => void;
  forcedReasonCode: DangerReasonCode | null;
  setForcedReasonCode: (code: DangerReasonCode | null) => void;
  /** When true, a safe URL opens automatically after a 500 ms flash.
   *  When false, the user has to tap "Open" even on a safe verdict —
   *  reverts to the always-confirm behaviour without a redeploy. */
  safeAutoOpen: boolean;
  setSafeAutoOpen: (v: boolean) => void;
}

const DebugSettingsContext = createContext<DebugSettingsValue | null>(null);

export function DebugSettingsProvider({ children }: { children: ReactNode }) {
  const [buttonVisible, setButtonVisible] = useState(true);
  const [forcedVerdict, setForcedVerdict] = useState<VerdictStatus | null>(null);
  const [forcedReasonCode, setForcedReasonCode] = useState<DangerReasonCode | null>(
    null
  );
  const [safeAutoOpen, setSafeAutoOpen] = useState(true);

  const value = useMemo<DebugSettingsValue>(
    () => ({
      buttonVisible,
      hideButton: () => setButtonVisible(false),
      forcedVerdict,
      setForcedVerdict,
      forcedReasonCode,
      setForcedReasonCode,
      safeAutoOpen,
      setSafeAutoOpen,
    }),
    [buttonVisible, forcedVerdict, forcedReasonCode, safeAutoOpen]
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
