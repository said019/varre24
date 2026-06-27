import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Upload, Clock, CheckCircle, XCircle, AlertTriangle, ShoppingBag, CreditCard, Loader2, Ban } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; icon: any; className: string }> = {
  pending_payment:      { label: "Pago pendiente",     icon: Upload,        className: "border-amber-500/50 text-amber-700 bg-amber-50" },
  pending_verification: { label: "En revisión",        icon: Clock,         className: "border-blue-500/50 text-blue-700 bg-blue-50" },
  approved:             { label: "Aprobada",           icon: CheckCircle,   className: "border-green-500/50 text-green-700 bg-green-50" },
  rejected:             { label: "Rechazada",          icon: XCircle,       className: "border-red-500/50 text-red-700 bg-red-50" },
  expired:              { label: "Expirada",           icon: AlertTriangle, className: "border-gray-400/50 text-gray-500 bg-gray-50" },
  cancelled:            { label: "Cancelada",          icon: XCircle,       className: "border-gray-400/50 text-gray-500 bg-gray-50" },
};

const paymentMethodLabel = (m: string) =>
  m === "card" ? "Tarjeta (en línea)" : m === "cash" ? "Tarjeta (en estudio)" : m === "transfer" ? "Transferencia" : m;

const MyOrders = () => {
  const [searchParams] = useSearchParams();
  const checkoutResult = searchParams.get("checkout"); // 'success' | 'failure' | 'pending' | null
  const checkoutOrderId = searchParams.get("order");
  const qc = useQueryClient();
  const { toast } = useToast();
  const [cancelOrder, setCancelOrder] = useState<any | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => (await api.get("/orders")).data,
    // Tras volver de MercadoPago el webhook tarda unos segundos: refrescar
    // mientras la orden de tarjeta siga pendiente de pago.
    refetchInterval: (query) => {
      const rows: any[] = Array.isArray((query.state.data as any)?.data) ? (query.state.data as any).data : [];
      const pendingCard = rows.find(
        (o) => o.payment_method === "card" && o.status === "pending_payment" &&
          (!checkoutOrderId || o.id === checkoutOrderId)
      );
      return (checkoutResult === "success" || checkoutResult === "pending") && pendingCard ? 3000 : false;
    },
  });

  const orders: any[] = Array.isArray(data?.data) ? data.data : [];

  const retryCardPayment = async (orderId: string) => {
    try {
      const res = await api.post(`/orders/${orderId}/pay-with-card`);
      const url = res.data?.data?.mp_checkout_url ?? res.data?.mp_checkout_url;
      if (url) window.location.href = url;
    } catch (_e) {
      // silencioso — el usuario puede reintentar
    }
  };

  const confirmCancel = async () => {
    if (!cancelOrder) return;
    setCancelling(true);
    try {
      await api.post(`/orders/${cancelOrder.id}/cancel`);
      await qc.invalidateQueries({ queryKey: ["my-orders"] });
      toast({ title: "Orden cancelada" });
      setCancelOrder(null);
    } catch (e: any) {
      toast({
        title: "No se pudo cancelar",
        description: e?.response?.data?.message ?? "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="mx-auto w-full max-w-3xl px-1 py-4 sm:py-8 space-y-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-alilato text-[0.68rem] uppercase tracking-[0.28em] text-[#9C8A8B]">Tus compras</p>
              <h1 className="mt-2 font-bebas text-[clamp(1.7rem,4vw,2.4rem)] font-light leading-[1.1] tracking-[0.01em] text-[#1A060B]">Mis órdenes</h1>
            </div>
            <Button asChild size="sm" variant="outline" className="rounded-full border-[#E8D7D6] font-alilato text-xs">
              <Link to="/app/checkout"><ShoppingBag size={14} className="mr-2" />Nueva orden</Link>
            </Button>
          </div>

          {checkoutResult === "success" && (
            <div className="flex items-start gap-3 rounded-xl border border-blue-500/30 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" />
              <p>Estamos confirmando tu pago con MercadoPago. Tu membresía se activará en unos segundos — esta página se actualiza sola.</p>
            </div>
          )}
          {checkoutResult === "failure" && (
            <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-800">
              <XCircle size={16} className="mt-0.5 shrink-0" />
              <p>El pago no se completó. Puedes reintentarlo desde la orden pendiente más abajo.</p>
            </div>
          )}
          {checkoutResult === "pending" && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Clock size={16} className="mt-0.5 shrink-0" />
              <p>Tu pago está en proceso. Te avisaremos cuando se confirme; esta página se actualiza sola.</p>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <ShoppingBag size={40} className="mx-auto text-[#3B0E1A]/30" />
              <p className="text-sm text-[#320C16]">No tienes órdenes aún</p>
              <Button asChild size="sm">
                <Link to="/app/checkout">Adquirir membresía</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => {
                const cfg = STATUS_CONFIG[o.status] || STATUS_CONFIG.cancelled;
                const Icon = cfg.icon;
                const isCard = o.payment_method === "card";
                return (
                  <div
                    key={o.id}
                    className="rounded-2xl border border-[#E8D7D6] bg-[#FCF8F7] p-4 transition-colors hover:border-[#3B0E1A]/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <p className="font-alilato font-medium text-sm text-[#1A060B]">{o.plan_name}</p>
                        <p className="text-xs text-[#320C16]">
                          ${Number(o.total_amount).toLocaleString("es-MX")} MXN
                          {" · "}
                          {paymentMethodLabel(o.payment_method)}
                        </p>
                        <p className="text-[11px] text-[#3B0E1A]">
                          {o.order_number && <span className="font-mono">{o.order_number} · </span>}
                          {o.created_at && format(new Date(o.created_at), "d MMM yyyy · HH:mm", { locale: es })}
                        </p>
                      </div>
                      <Badge variant="outline" className={cfg.className}>
                        <Icon size={11} className="mr-1" />
                        {cfg.label}
                      </Badge>
                      {o.status === "approved" && o.auto_approval_expires_at && new Date(o.auto_approval_expires_at) > new Date() && (
                        <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                          Verificación pendiente · {formatDistanceToNow(new Date(o.auto_approval_expires_at), { addSuffix: true, locale: es })}
                        </span>
                      )}
                    </div>

                    {o.status === "pending_payment" && isCard && (
                      <Button onClick={() => retryCardPayment(o.id)} size="sm" className="mt-3 w-full sm:w-auto">
                        <CreditCard size={14} className="mr-2" />Pagar con tarjeta
                      </Button>
                    )}

                    {o.status === "pending_payment" && !isCard && (
                      <Button asChild size="sm" className="mt-3 w-full sm:w-auto">
                        <Link to={`/app/checkout?orderId=${o.id}`}>
                          <Upload size={14} className="mr-2" />Subir comprobante
                        </Link>
                      </Button>
                    )}

                    {o.status === "pending_payment" && (
                      <Button
                        onClick={() => setCancelOrder(o)}
                        size="sm"
                        variant="ghost"
                        className="mt-2 w-full sm:w-auto sm:ml-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Ban size={14} className="mr-2" />Cancelar orden
                      </Button>
                    )}

                    {o.status === "pending_verification" && (
                      <p className="text-xs text-blue-700 mt-3 bg-blue-50 rounded-lg px-3 py-2">
                        {o.payment_method === "cash"
                          ? "Acércate a recepción para completar tu pago."
                          : "Tu comprobante está siendo revisado. Te notificaremos cuando se apruebe."}
                      </p>
                    )}

                    {o.status === "rejected" && o.rejection_reason && (
                      <p className="text-xs text-red-700 mt-3 bg-red-50 rounded-lg px-3 py-2">
                        Motivo: {o.rejection_reason}
                      </p>
                    )}

                    {o.auto_reverted_at && (
                      <p className="text-xs text-red-700 mt-3 bg-red-50 rounded-lg px-3 py-2">
                        Tu pago no se confirmó a tiempo y la membresía se desactivó. Si ya pagaste, contacta al estudio para validar el comprobante.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <AlertDialog open={!!cancelOrder} onOpenChange={(open) => !open && setCancelOrder(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar orden</AlertDialogTitle>
              <AlertDialogDescription>
                ¿Seguro que quieres cancelar la orden{" "}
                <strong>{cancelOrder?.plan_name}</strong>
                {cancelOrder?.order_number ? ` (${cancelOrder.order_number})` : ""}? Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelling}>Volver</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); confirmCancel(); }}
                disabled={cancelling}
                className="bg-red-600 hover:bg-red-700"
              >
                {cancelling ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
                Sí, cancelar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default MyOrders;
