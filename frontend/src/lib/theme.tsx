import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Mode = "light" | "dark";
const STORAGE_KEY = "freemail:theme";

function readInitialMode(): Mode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch (_) {}
  if (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

function applyMode(mode: Mode) {
  const root = document.documentElement;
  if (mode === "dark") root.setAttribute("data-mode", "dark");
  else root.removeAttribute("data-mode");
}

type ThemeCtx = { mode: Mode; toggle: () => void; setMode: (m: Mode) => void };
const Ctx = createContext<ThemeCtx>({ mode: "light", toggle: () => {}, setMode: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(readInitialMode);

  useEffect(() => {
    applyMode(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (_) {}
  }, [mode]);

  // 跨标签页同步
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === "light" || e.newValue === "dark")) {
        setModeState(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<ThemeCtx>(
    () => ({
      mode,
      setMode: setModeState,
      toggle: () => setModeState((m) => (m === "dark" ? "light" : "dark")),
    }),
    [mode],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
