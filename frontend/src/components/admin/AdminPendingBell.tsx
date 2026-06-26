import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type PendingOrder = {
  id: string;
  userName?: string;
  planName?: string;
  totalAmount?: number | string;
  createdAt?: string;
};

/**
 * Campanita en el header del admin. Hace polling cada ~25s a las órdenes
 * pendientes de verificación. Si en una pasada aparece una orden que no
 * existía en la pasada anterior: toast + push del navegador (si la admin
 * dio permiso) + prefijo en el título de la pestaña con la cuenta total.
 *
 * Diseñada para que Isabel no se entere por WhatsApp media hora después
 * cuando una alumna sube comprobante o paga con tarjeta y queda pendiente.
 */
export function AdminPendingBell() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const seenIds = useRef<Set<string> | null>(null);
  const baseTitle = useRef<string>(typeof document !== "undefined" ? document.title : "");

  // Pedir permiso para notificaciones del sistema (silencioso, una sola vez).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      // No bloqueamos al usuario: si dice "no", se queda sólo con toast.
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const { data } = useQuery({
    queryKey: ["admin-pending-orders-bell"],
    queryFn: async () =>
      (await api.get("/admin/orders?status=pending_verification&limit=50")).data,
    refetchInterval: 25_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const orders: PendingOrder[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  const count = orders.length;

  useEffect(() => {
    if (seenIds.current == null) {
      // Primer fetch: poblar la baseline sin lanzar avisos.
      seenIds.current = new Set(orders.map((o) => o.id));
    } else {
      const newOnes = orders.filter((o) => !seenIds.current!.has(o.id));
      for (const o of newOnes) {
        const who = o.userName || "Alumna";
        const what = o.planName || "Plan";
        const amount = o.totalAmount != null
          ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(o.totalAmount))
          : null;
        const description = amount
          ? `${who} · ${what} · ${amount}`
          : `${who} · ${what}`;

        toast({
          title: "Nueva orden por verificar",
          description,
        });

        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          try {
            const n = new Notification("Pilates Room — orden por verificar", {
              body: description,
              tag: `pending-${o.id}`,
              icon: "/icon-192.png",
            });
            n.onclick = () => {
              window.focus();
              navigate("/admin/payments");
              n.close();
            };
          } catch { /* algunos navegadores bloquean Notification fuera de https/PWA */ }
        }
      }
      // Mantener el set acotado: sólo los IDs que vimos en la última pasada.
      seenIds.current = new Set(orders.map((o) => o.id));
    }

    // Prefijo en el título de la pestaña.
    if (typeof document !== "undefined") {
      const clean = baseTitle.current || document.title.replace(/^\(\d+\)\s+/, "");
      baseTitle.current = clean;
      document.title = count > 0 ? `(${count}) ${clean}` : clean;
    }
  }, [orders, count, navigate, toast]);

  return (
    <button
      type="button"
      onClick={() => navigate("/admin/payments")}
      aria-label={count > 0 ? `${count} órdenes pendientes por verificar` : "Sin órdenes pendientes"}
      title={count > 0 ? `${count} pendiente${count === 1 ? "" : "s"} por verificar` : "Sin pendientes"}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
        count > 0
          ? "border-[#836A5D]/30 bg-[#836A5D]/8 text-[#836A5D] hover:bg-[#836A5D]/14"
          : "border-[#836A5D]/12 bg-white/45 text-[#836A5D]/55 hover:bg-white/70",
      )}
    >
      <Bell size={16} strokeWidth={2.1} className={count > 0 ? "animate-[wiggle_2.4s_ease-in-out_infinite]" : undefined} />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#b3261e] text-white text-[10px] font-bold leading-none tabular-nums inline-flex items-center justify-center shadow-sm ring-2 ring-[#fbf7ef]"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
