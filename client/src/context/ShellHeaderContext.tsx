import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ShellHeaderContextValue = {
  rightSlot: ReactNode | null;
  setRightSlot: (node: ReactNode | null) => void;
  leftSlot: ReactNode | null;
  setLeftSlot: (node: ReactNode | null) => void;
};

const ShellHeaderContext = createContext<ShellHeaderContextValue | null>(null);

export function ShellHeaderProvider({ children }: { children: ReactNode }) {
  const [rightSlot, setRightSlotState] = useState<ReactNode | null>(null);
  const [leftSlot, setLeftSlotState] = useState<ReactNode | null>(null);

  const setRightSlot = useCallback((node: ReactNode | null) => {
    setRightSlotState(node);
  }, []);

  const setLeftSlot = useCallback((node: ReactNode | null) => {
    setLeftSlotState(node);
  }, []);

  const value = useMemo(
    () => ({ rightSlot, setRightSlot, leftSlot, setLeftSlot }),
    [rightSlot, setRightSlot, leftSlot, setLeftSlot]
  );

  return <ShellHeaderContext.Provider value={value}>{children}</ShellHeaderContext.Provider>;
}

export function useShellHeader() {
  const ctx = useContext(ShellHeaderContext);
  if (!ctx) {
    throw new Error("useShellHeader must be used within ShellHeaderProvider");
  }
  return ctx;
}
