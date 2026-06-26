import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { BroadcastDialog } from "@/components/admin/BroadcastDialog";
import { BirthdaysWidget } from "@/components/admin/BirthdaysWidget";
import { CalendarDays, Users, DollarSign, AlertCircle, ArrowRight, Send } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Esperando pago",
  pending_verification: "Por verificar",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  active: "Activa",
  expired: "Expirada",
  frozen: "Congelada",
};

interface Stats {
  classesToday: number;
  activeMembers: number;
  monthlyRevenue: number;
  pendingAlerts: number;
  recentMemberships: { id: string; userName: string; planName: string; status: string; createdAt: string }[];
  pendingOrders: { id: string; userName: string; totalAmount?: number; total_amount?: number; amount?: number; status: string }[];
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["admin-stats"],
    queryFn: async () => (await api.get("/admin/stats")).data,
  });

  const { data: memberships } = useQuery<{ data: Stats["recentMemberships"] }>({
    queryKey: ["memberships-recent"],
    queryFn: async () => (await api.get("/memberships?limit=5")).data,
  });

  // Mismo criterio que la pestaña "Pendientes" de Pagos: por verificar +
  // esperando pago en efectivo. Antes solo pedía pending_verification y el
  // widget salía vacío aunque hubiera órdenes pendientes reales.
  const { data: pendingOrdersRaw } = useQuery<{ data: (Stats["pendingOrders"][number] & { payment_method?: string; paymentMethod?: string })[] }>({
    queryKey: ["orders-pending"],
    queryFn: async () => (await api.get("/admin/orders?status=pending_verification,pending_payment&limit=20")).data,
  });
  const pendingOrders = {
    data: (Array.isArray(pendingOrdersRaw?.data) ? pendingOrdersRaw.data : [])
      .filter((o) =>
        o.status === "pending_verification" ||
        (o.payment_method ?? o.paymentMethod) === "cash"
      )
      .slice(0, 6),
  };

  // Feature de complementos/consultas retirada.

  const metric = (label: string, value: number | undefined, icon: React.ReactNode, prefix = "", accent = "#D5C4B8") => (
    <Card className="group overflow-hidden border-t-2 transition-all hover:-translate-y-0.5" style={{ borderTopColor: accent }}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="font-alilato text-sm font-semibold text-[#3A2F26]/70">{label}</CardTitle>
        <span className="rounded-xl bg-[#5B4A3E]/[0.07] p-2 transition-transform group-hover:scale-105" style={{ color: accent }}>
          {icon}
        </span>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-9 w-24 rounded-xl" />
        ) : (
          <p className="tabular text-3xl font-bold tracking-[-0.01em] text-[#2A211B]">
            {prefix}{value ?? 0}
          </p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <AuthGuard requiredRoles={["admin", "instructor"]}>
      <AdminLayout>
        <div className="admin-page max-w-6xl">
          <section className="mb-6 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-[1.35rem] border border-[#5B4A3E]/15 bg-[#2A211B] p-5 text-[#F6F2EB] shadow-[0_28px_70px_-45px_rgba(47,40,35,0.9)] sm:p-6">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#D5C4B8]">
                Panel administrativo
              </p>
              <h1 className="font-alilato text-3xl font-bold leading-none tracking-[0] text-[#F6F2EB] sm:text-4xl">
                Dashboard
              </h1>
              <p className="mt-3 max-w-[58ch] text-sm leading-6 text-[#E8DED4]/70">
                Operación diaria, membresías, ingresos y pendientes críticos del estudio.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => setBroadcastOpen(true)}
                  className="bg-[#D5C4B8] hover:bg-[#D5C4B8] text-[#2A211B] font-semibold"
                >
                  <Send size={13} className="mr-1.5" />Enviar comunicado
                </Button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/admin/classes")}
              className="group flex min-h-[9.5rem] flex-col justify-between rounded-[1.35rem] border border-[#5B4A3E]/15 bg-white/65 p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_20px_54px_-38px_rgba(84,67,49,0.48)] backdrop-blur sm:p-6"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5B4A3E]/10 text-[#5B4A3E]">
                <CalendarDays size={18} />
              </span>
              <span>
                <span className="block text-sm font-semibold text-[#2A211B]">Abrir calendario</span>
                <span className="mt-1 flex items-center gap-1 text-xs text-[#5B4A3E]/70">
                  Ver clases y reservas <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </button>
          </section>

          <BroadcastDialog open={broadcastOpen} onOpenChange={setBroadcastOpen} />

          {/* Metric cards */}
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metric("Clases de hoy", stats?.classesToday, <CalendarDays size={18} />, "", "#D5C4B8")}
            {metric("Membresías activas", stats?.activeMembers, <Users size={18} />, "", "#5B4A3E")}
            {metric("Ingresos del mes", stats?.monthlyRevenue, <DollarSign size={18} />, "$", "#8A8077")}
            {metric("Alertas pendientes", stats?.pendingAlerts, <AlertCircle size={18} />, "", "#F97316")}
          </div>

          {/* Widget de consultas eliminado — feature de complementos retirada */}

          {/* Birthdays */}
          <div className="mb-6">
            <BirthdaysWidget />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent memberships */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Últimas membresías</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading
                  ? Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
                  : (Array.isArray(memberships?.data) ? memberships.data : []).map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium">{m.userName}</p>
                          <p className="text-muted-foreground text-xs">{m.planName}</p>
                        </div>
                        <Badge
                          variant={m.status === "active" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {STATUS_LABEL[m.status] ?? m.status}
                        </Badge>
                      </div>
                    ))}
                {(!memberships?.data || memberships.data.length === 0) && !isLoading && (
                  <p className="text-sm text-muted-foreground">Sin membresías recientes.</p>
                )}
              </CardContent>
            </Card>

            {/* Pending orders */}
            <Card
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => navigate("/admin/payments?tab=pending")}
            >
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  Órdenes pendientes
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-normal">
                    Ver <ArrowRight size={12} />
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading
                  ? Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
                  : (Array.isArray(pendingOrders?.data) ? pendingOrders.data : []).map((o) => (
                      <div key={o.id} className="flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium">{o.userName}</p>
                          <p className="text-muted-foreground text-xs">${Number(o.totalAmount ?? o.total_amount ?? o.amount ?? 0).toFixed(2)} MXN</p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {STATUS_LABEL[o.status] ?? o.status}
                        </Badge>
                      </div>
                    ))}
                {(!pendingOrders?.data || pendingOrders.data.length === 0) && !isLoading && (
                  <p className="text-sm text-muted-foreground">Sin órdenes pendientes.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default Dashboard;
