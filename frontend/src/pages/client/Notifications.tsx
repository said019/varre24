import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCircle, AlertCircle, Clock, AlertTriangle, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

// Mismo criterio que lib/api: sin VITE_API_URL → mismo origen (Express sirve
// dist + API juntos en producción). Evita fetch("undefined/api/...").
const API = String(import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

interface Notification {
  id: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
  type: "success" | "error" | "warning" | "info" | "reminder";
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Ayer";
  if (days < 7) return `Hace ${days} días`;
  return new Date(dateStr).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

const typeIcon: Record<string, typeof Bell> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  reminder: Clock,
};

const typeColor: Record<string, string> = {
  success: "text-green-600",
  error: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
  reminder: "text-[#5B4A3E]",
};

const Notifications = () => {
  const token = localStorage.getItem("token");
  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error al cargar notificaciones");
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 30000,
  });

  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="mx-auto w-full max-w-lg px-1 py-4 sm:py-8 space-y-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-alilato text-[0.68rem] uppercase tracking-[0.28em] text-[#8A8077]">Al día</p>
              <h1 className="mt-2 font-bebas text-[clamp(1.7rem,4vw,2.4rem)] font-light leading-[1.1] tracking-[0.01em] text-[#2A211B]">Notificaciones</h1>
            </div>
            {unreadCount > 0 && (
              <Badge variant="secondary">{unreadCount} nueva{unreadCount !== 1 ? "s" : ""}</Badge>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-xl border bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bell size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No tienes notificaciones</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => {
                const Icon = typeIcon[n.type] || Bell;
                const color = typeColor[n.type] || "text-muted-foreground";
                return (
                  <div
                    key={n.id}
                    className={`flex gap-3 rounded-2xl border p-4 transition-colors ${n.unread ? "border-[#D8C9BC] bg-[#F1EAE0]" : "border-[#E4DACE] bg-[#FBF8F4]"}`}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      <Icon size={16} strokeWidth={1.75} className={n.unread ? color : "text-[#8A8077]"} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className={`font-alilato text-sm font-medium ${n.unread ? "text-[#2A211B]" : "text-[#5B4A3E]/70"}`}>
                        {n.title}
                      </p>
                      <p className="font-alilato text-xs text-muted-foreground">{n.body}</p>
                      <p className="font-alilato text-xs text-muted-foreground/60">{timeAgo(n.time)}</p>
                    </div>
                    {n.unread && <div className="mt-1.5 h-2 w-2 rounded-full bg-[#5B4A3E] flex-shrink-0" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default Notifications;
