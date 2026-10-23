import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Stock = Record<string, number>;
export async function loadStock(): Promise<Stock> {
  const { data, error } = await supabase.from("inventory").select("watch_id, stock");
  if (error) {
    console.error("Could not load inventory.", error);
    throw new Error("Could not load current stock.");
  }
  return Object.fromEntries((data ?? []).map((r) => [r.watch_id, r.stock])) as Stock;
}
export function useStock() {
  const [s, setS] = useState<Stock | null>(null);
  useEffect(() => {
    let on = true;
    void loadStock().then(
      (v) => {
        if (on) setS(v);
      },
      (error: unknown) => {
        if (!on) return;
        console.error("Stock availability is temporarily unknown.", error);
        setS(null);
      },
    );
    return () => {
      on = false;
    };
  }, []);
  return s;
}
export const stockLabel = (n: number | undefined) =>
  n === undefined ? "" : n <= 0 ? "Out of stock" : n <= 3 ? `Only ${n} left` : "In stock";
