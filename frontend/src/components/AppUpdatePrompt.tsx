import { useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type AppVersionResponse = { asset?: string | null };

function currentBundleAsset(): string | null {
  const script = Array.from(document.scripts).find((item) => /\/assets\/index-[^/]+\.js$/.test(new URL(item.src, window.location.origin).pathname));
  return script ? new URL(script.src, window.location.origin).pathname : null;
}

/**
 * Avisa sin interrumpir la sesión cuando Railway publica un bundle nuevo.
 * La versión se obtiene del asset real servido por Express, por lo que no hay
 * números de versión manuales que se puedan desincronizar.
 */
export function AppUpdatePrompt() {
  const currentAsset = useRef<string | null>(null);
  const dismissedAsset = useRef<string | null>(null);
  const [availableAsset, setAvailableAsset] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;

    currentAsset.current = currentBundleAsset();
    if (!currentAsset.current) return;

    let active = true;
    const checkForUpdate = async () => {
      try {
        const response = await fetch(`/api/app-version?ts=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as AppVersionResponse;
        const nextAsset = payload.asset ?? null;
        if (!active || !nextAsset || nextAsset === currentAsset.current || nextAsset === dismissedAsset.current) return;
        setAvailableAsset(nextAsset);
      } catch {
        // Una falla de red no debe interrumpir la sesión ni mostrar alertas.
      }
    };

    void checkForUpdate();
    const interval = window.setInterval(checkForUpdate, 60_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void checkForUpdate(); };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.update()));
      }
    } catch {
      // La recarga sigue siendo válida aunque no se pueda actualizar el SW.
    }
    window.location.reload();
  };

  return (
    <Dialog open={Boolean(availableAsset)} onOpenChange={(open) => {
      if (!open && availableAsset) {
        dismissedAsset.current = availableAsset;
        setAvailableAsset(null);
      }
    }}>
      <DialogContent className="max-w-sm border-[#E8D7D6] bg-[#FCF8F7]">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#3B0E1A] text-[#FFD6E6]">
            <Sparkles size={18} />
          </div>
          <DialogTitle className="text-[#1A060B]">Hay una nueva versión</DialogTitle>
          <DialogDescription className="leading-relaxed text-[#1A060B]/60">
            Actualiza para usar las mejoras más recientes. Tus datos y tu sesión se conservarán.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2 gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => {
            if (availableAsset) dismissedAsset.current = availableAsset;
            setAvailableAsset(null);
          }}>
            Más tarde
          </Button>
          <Button className="bg-[#3B0E1A] hover:bg-[#320C16]" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? "mr-1.5 animate-spin" : "mr-1.5"} />
            Actualizar ahora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
