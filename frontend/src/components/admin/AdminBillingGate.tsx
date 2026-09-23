import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

const BillingContext = createContext({ locked: false, message: "" });
export const useAdminBilling = () => useContext(BillingContext);

export function AdminBillingGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const qc = useQueryClient();
  const isAdmin = location.pathname.startsWith("/admin");
  const enabled = authenticated && !!user && ["admin", "super_admin", "reception", "instructor"].includes(user.role);
  const status = useQuery({
    queryKey: ["admin-billing-status", user?.id],
    queryFn: async () => (await api.get("/admin/billing-status")).data.data as { locked: boolean; message: string },
    enabled,
    staleTime: 0,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  useEffect(() => {
    const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin-billing-status"] }); };
    window.addEventListener("admin-billing-locked", refresh);
    return () => window.removeEventListener("admin-billing-locked", refresh);
  }, [qc]);

  if (enabled && isAdmin && (status.isPending || status.isError)) {
    return <div className="min-h-screen bg-[#F3EFE9] flex flex-col items-center justify-center gap-4 text-[#3B0E1A]">
      <p>{status.isError ? "No se pudo verificar el acceso al panel." : "Verificando acceso…"}</p>
      {status.isError && <button className="underline" onClick={() => status.refetch()}>Reintentar</button>}
    </div>;
  }
  const value = enabled ? status.data ?? { locked: false, message: "" } : { locked: false, message: "" };
  if (value.locked && (isAdmin || location.pathname.startsWith("/app")) && location.pathname !== "/admin/dashboard") {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function AdminBillingNotice() {
  const { locked, message } = useAdminBilling();
  if (!locked) return null;
  return <section role="status" className="mb-6 flex flex-col gap-4 rounded-[1.35rem] border border-[#C9A5A8] bg-[#F9ECEE] p-5 sm:flex-row sm:items-start sm:p-6">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#3B0E1A] text-[#FFD6E6]"><LockKeyhole size={21} /></span>
    <div className="flex-1">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#754652]">Acceso administrativo limitado</p>
      <h2 className="text-xl font-bold text-[#3B0E1A]">Mensualidad pendiente</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#59333D]">{message}</p>
      <p className="mt-3 text-xs leading-5 text-[#754652]">Puedes consultar tu dashboard. Las acciones y las demás secciones estarán disponibles cuando se confirme tu pago.</p>
    </div>
    <span className="self-start whitespace-nowrap rounded-full border border-[#C9A5A8] px-3 py-1.5 text-[11px] font-semibold text-[#3B0E1A]">Solo lectura</span>
  </section>;
}
