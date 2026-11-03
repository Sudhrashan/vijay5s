import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Meta } from "../api/types";

interface CycleCtx { cycle: string; setCycle: (c: string) => void; meta: Meta | undefined; }
const Ctx = createContext<CycleCtx>(null!);

/** The audit month picked in the top bar; every page reads from it. */
export function CycleProvider({ children }: { children: ReactNode }) {
  const { data: meta } = useQuery({ queryKey: ["meta"], queryFn: () => api.get<Meta>("/meta") });
  const [cycle, setCycle] = useState("");
  useEffect(() => { if (meta && !cycle) setCycle(meta.current_cycle); }, [meta, cycle]);
  return <Ctx.Provider value={{ cycle, setCycle, meta }}>{children}</Ctx.Provider>;
}
export const useCycle = () => useContext(Ctx);

/**
 * The server's current audit cycle (YYYY-MM) from GET /api/meta. Used by the auditor and
 * incharge apps instead of the phone's clock, which can be wrong or straddle a month boundary.
 * Undefined until /meta has loaded — gate dependent queries with `enabled: !!cycle`.
 */
export function useServerCycle(): { cycle: string | undefined; isLoading: boolean; error: unknown } {
  const { data, isLoading, error } = useQuery({ queryKey: ["meta"], queryFn: () => api.get<Meta>("/meta") });
  return { cycle: data?.current_cycle, isLoading, error };
}
