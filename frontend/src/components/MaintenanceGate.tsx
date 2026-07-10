import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import api from "@/lib/api";

// Rutas siempre accesibles aunque el estudio esté en mantenimiento: el admin
// (para apagarlo) y auth (para iniciar sesión). El resto del sitio público
// muestra la pantalla de mantenimiento cuando general_settings.maintenance_mode
// está activo. Fail-open: si la lectura falla, se muestra el sitio normal.
const EXEMPT_PREFIXES = ["/admin", "/auth"];

function MaintenanceScreen({ studioName }: { studioName: string }) {
  return (
    <div className="min-h-[100dvh] bg-[#F3EFE9] text-[#3B0E1A] flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="font-alilato text-[0.7rem] uppercase tracking-[0.35em] text-[#9C8A8B]">
          {studioName}
        </p>
        <h1 className="font-bebas mt-5 text-[clamp(2.4rem,7vw,3.6rem)] font-light leading-[1.05] tracking-[0.01em] text-[#1A060B]">
          Volvemos en un momento
        </h1>
        <p className="font-alilato mx-auto mt-5 max-w-sm text-sm leading-relaxed text-[#3B0E1A]/70">
          Estamos haciendo unos ajustes al estudio. Las reservas y compras están
          pausadas por ahora — gracias por tu paciencia.
        </p>
        <div className="mx-auto mt-8 h-px w-16 bg-[#C9A5A8]" />
      </div>
    </div>
  );
}

export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const exempt = EXEMPT_PREFIXES.some((p) => location.pathname.startsWith(p));

  const { data } = useQuery({
    queryKey: ["public-general-settings"],
    queryFn: async () => (await api.get("/public/settings/general_settings")).data,
    staleTime: 60_000,
    retry: false,
    enabled: !exempt,
  });

  const gs: Record<string, any> = data?.data ?? {};
  if (!exempt && gs.maintenance_mode === true) {
    return <MaintenanceScreen studioName={String(gs.studio_name || "VARRE24")} />;
  }
  return <>{children}</>;
}
