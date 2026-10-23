import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const CustomerContext = createContext<{ user: User | null; ready: boolean; error: string | null }>({
  user: null,
  ready: false,
  error: null,
});
export const useCustomer = () => useContext(CustomerContext);

export function CustomerAccounts({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    let active = true;
    let authEventVersion = 0;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      authEventVersion += 1;
      if (active) {
        setUser(session?.user ?? null);
        setReady(true);
        setError(null);
      }
      if (session?.user) sessionStorage.removeItem("pf-oauth-return");
      if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) return;
      void router.invalidate();
      if (event === "SIGNED_OUT") queryClient.clear();
      else void queryClient.invalidateQueries();
    });
    const initialAuthEventVersion = authEventVersion;
    void (async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (!active || authEventVersion !== initialAuthEventVersion) return;
        if (sessionError) throw sessionError;
        if (!session) {
          setUser(null);
          setReady(true);
          setError(null);
          return;
        }

        const verificationEventVersion = authEventVersion;
        const { data, error: authError } = await supabase.auth.getUser();
        if (!active || authEventVersion !== verificationEventVersion) return;
        if (authError) {
          console.error("Could not verify the restored Supabase session.", authError);
          setUser(null);
          setReady(true);
          setError(
            "We could not verify your account right now. You can still try signing in again.",
          );
          return;
        }
        setUser(data.user);
        setReady(true);
      } catch (authError) {
        if (!active || authEventVersion !== initialAuthEventVersion) return;
        console.error("Could not restore the Supabase session.", authError);
        setUser(null);
        setReady(true);
        setError("We could not connect to your account. Check your connection and try again.");
      }
    })();
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router, queryClient]);
  return (
    <CustomerContext.Provider value={{ user, ready, error }}>{children}</CustomerContext.Provider>
  );
}
