import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Auth, type Session } from "./api";

type AuthCtx = {
  session: Session | null;
  loading: boolean;
  refresh: () => Promise<Session | null>;
  setSession: (s: Session | null) => void;
};

const Ctx = createContext<AuthCtx>({
  session: null,
  loading: true,
  refresh: async () => null,
  setSession: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await Auth.session();
      setSession(s);
      return s;
    } catch {
      setSession(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Ctx.Provider value={{ session, loading, refresh, setSession }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
