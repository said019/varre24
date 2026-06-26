import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Star } from "lucide-react";
import type { BookingClient } from "@/types/booking";

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmada",
  waitlist: "Lista de espera",
  checked_in: "Asistida",
  no_show: "No asistió",
  cancelled: "Cancelada",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  confirmed: "default",
  waitlist: "secondary",
  checked_in: "default",
  no_show: "destructive",
  cancelled: "destructive",
};

interface CancellationPolicy {
  enabled: boolean;
  min_hours: number;
  // Nombre nuevo (por membresía). Se conserva `free_cancellations_per_month`
  // por compatibilidad con servidores no migrados.
  free_cancellations_per_membership: number;
  free_cancellations_per_month?: number;
  refund_credit_on_cancel: boolean;
  late_cancel_message: string;
}

interface CancellationQuota {
  used: number;
  free_per_membership: number;
  free_per_month?: number; // alias legacy
  remaining: number;
  membership_id?: string | null;
}

const BookingCard = ({
  booking,
  onCancel,
  onRemoveGuest,
  onReview,
  policy,
}: {
  booking: BookingClient;
  onCancel: (id: string) => void;
  onRemoveGuest: (id: string) => void;
  onReview: (booking: BookingClient) => void;
  policy: CancellationPolicy;
}) => {
  const start = new Date(booking.start_time);
  const now = new Date();
  const isPast = start < now;
  const hoursUntilStart = (start.getTime() - now.getTime()) / 3_600_000;
  const insideWindow = hoursUntilStart >= policy.min_hours;
  const canCancel = policy.enabled && booking.status === "confirmed" && !isPast && insideWindow;
  const canRemoveGuest = !!booking.guest_name && canCancel;
  const showLateMessage = policy.enabled && booking.status === "confirmed" && !isPast && !insideWindow && policy.late_cancel_message;
  const hasReview = Boolean(booking.has_review);
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/60 border border-[#836A5D]/10 p-4" style={{ boxShadow: "0 2px 8px rgba(114,93,81,0.05)" }}>
      <div className="space-y-1">
        <p className="font-medium">{booking.class_type_name}</p>
        <p className="text-sm text-muted-foreground">
          {booking.start_time ? format(safeParse(booking.start_time), "EEEE d MMM · HH:mm", { locale: es }) : "—"}
        </p>
        {booking.instructor_name && (
          <p className="text-xs text-muted-foreground">{booking.instructor_name}</p>
        )}
        {booking.guest_name && (
          <span className="inline-flex items-center gap-1 mt-1.5 rounded-full bg-[#C8B79E]/25 border border-[#836A5D]/20 px-2 py-0.5 text-[10.5px] font-semibold text-[#6C5147]">
            +1 invitada · {booking.guest_name}
          </span>
        )}
        {showLateMessage && (
          <p className="text-[11px] text-amber-700 mt-2 max-w-[260px] leading-snug">{policy.late_cancel_message}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-2">
        <Badge variant={STATUS_VARIANTS[booking.status] ?? "secondary"}>
          {STATUS_LABELS[booking.status] ?? booking.status}
        </Badge>
        {canRemoveGuest && (
          <Button variant="ghost" size="sm" className="text-[#6C5147]" onClick={() => onRemoveGuest(booking.id)}>
            Quitar invitada
          </Button>
        )}
        {canCancel && (
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onCancel(booking.id)}>
            {booking.guest_name ? "Cancelar reserva" : "Cancelar"}
          </Button>
        )}
        {isPast && booking.status === "checked_in" && (
          hasReview ? (
            <Badge
              variant="outline"
              className="border-emerald-300 bg-emerald-50 text-emerald-700"
            >
              Reseña enviada
            </Badge>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onReview(booking)}>
              <Star size={14} className="mr-1" />Reseña
            </Button>
          )
        )}
      </div>
    </div>
  );
};

const MyBookings = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reviewBooking, setReviewBooking] = useState<BookingClient | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const { data: bookingsData, isLoading } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: async () => (await api.get("/bookings/my-bookings")).data,
  });

  // Fetch the studio's cancellation policy (public, no auth required)
  const { data: policyData } = useQuery({
    queryKey: ["public-cancellation-policy"],
    queryFn: async () => (await api.get("/public/settings/cancellation_window")).data,
    staleTime: 1000 * 60 * 5,
  });
  const policyRaw = policyData?.data ?? policyData ?? {};
  const freePerMembership = Number(
    policyRaw.free_cancellations_per_membership ?? policyRaw.free_cancellations_per_month ?? 2
  );
  const policy: CancellationPolicy = {
    enabled: policyRaw.enabled !== false,
    min_hours: Number(policyRaw.min_hours ?? 5),
    free_cancellations_per_membership: freePerMembership,
    free_cancellations_per_month: freePerMembership, // alias legacy
    refund_credit_on_cancel: policyRaw.refund_credit_on_cancel !== false,
    late_cancel_message: String(policyRaw.late_cancel_message ?? ""),
  };

  // Cupo de cancelaciones gratis para la membresía activa del usuario
  // (resuelto en el servidor; soporta llave legacy free_per_month).
  const { data: quotaData, isLoading: loadingQuota } = useQuery({
    queryKey: ["cancellation-quota"],
    queryFn: async () => (await api.get("/bookings/cancellation-quota")).data,
  });
  const quotaRaw: any = quotaData?.data ?? quotaData ?? {};
  const quotaFree = Number(quotaRaw.free_per_membership ?? quotaRaw.free_per_month ?? freePerMembership);
  const quota: CancellationQuota = {
    used: Number(quotaRaw.used ?? 0),
    free_per_membership: quotaFree,
    free_per_month: quotaFree,
    remaining: Number(quotaRaw.remaining ?? Math.max(0, quotaFree - Number(quotaRaw.used ?? 0))),
    membership_id: quotaRaw.membership_id ?? null,
  };

  // Fetch review tags for the review dialog
  const { data: tagsData } = useQuery({
    queryKey: ["public-review-tags"],
    queryFn: async () => (await api.get("/public/review-tags")).data,
    staleTime: 1000 * 60 * 10,
  });
  const reviewTags: { id: string; name: string; color: string }[] = Array.isArray(tagsData?.data) ? tagsData.data : [];

  const bookings: BookingClient[] = Array.isArray(bookingsData?.data) ? bookingsData.data : Array.isArray(bookingsData) ? bookingsData : [];
  const now = new Date();

  const upcoming = bookings.filter((b) =>
    (b.status === "confirmed" || b.status === "waitlist") && new Date(b.start_time) >= now
  );
  const past = bookings.filter((b) =>
    b.status === "checked_in" || b.status === "no_show" || new Date(b.start_time) < now
  );
  const cancelled = bookings.filter((b) => b.status === "cancelled");

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/bookings/${id}`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      qc.invalidateQueries({ queryKey: ["my-membership"] });
      qc.invalidateQueries({ queryKey: ["public-classes"] });
      qc.invalidateQueries({ queryKey: ["cancellation-quota"] });
      const refunded = res?.data?.refunded ?? res?.data?.credit_refunded ?? res?.data?.creditRestored;
      const remaining = res?.data?.free_remaining_in_membership ?? res?.data?.free_remaining_this_month;
      toast({
        title: refunded ? "Reserva cancelada · crédito devuelto" : "Reserva cancelada · clase consumida",
        description: refunded
          ? typeof remaining === "number"
              ? `Te quedan ${remaining} cancelación${remaining === 1 ? "" : "es"} gratis en esta membresía.`
              : "La clase fue devuelta a tu paquete."
          : "Ya usaste tus cancelaciones gratis de esta membresía. La clase se contó como tomada y el cupo quedó libre para alguien en lista de espera.",
      });
      setCancelId(null);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || "No se pudo cancelar la reserva.";
      toast({ title: "No se pudo cancelar", description: msg, variant: "destructive" });
      setCancelId(null);
    },
  });

  // Quitar solo la invitada (sin cancelar la reserva principal).
  const removeGuestMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/bookings/${id}/guest`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      qc.invalidateQueries({ queryKey: ["my-membership"] });
      qc.invalidateQueries({ queryKey: ["public-classes"] });
      qc.invalidateQueries({ queryKey: ["cancellation-quota"] });
      const refunded = res?.data?.refunded;
      toast({
        title: refunded ? "Invitada removida · crédito devuelto" : "Invitada removida",
        description: refunded
          ? "Se liberó 1 lugar y se devolvió 1 crédito a tu paquete."
          : "Se liberó 1 lugar; el crédito no se devolvió (ya usaste tus cancelaciones gratis).",
      });
    },
    onError: (err: any) => {
      toast({
        title: "No se pudo quitar la invitada",
        description: err?.response?.data?.message || "Inténtalo de nuevo",
        variant: "destructive",
      });
    },
  });

  const handleRemoveGuest = (id: string) => {
    const b = bookings.find((x) => x.id === id);
    const guest = b?.guest_name || "tu invitada";
    if (window.confirm(`¿Quitar a ${guest} de esta reserva? Se libera 1 lugar y, si estás dentro de la ventana de cancelación gratis, se devuelve 1 crédito.`)) {
      removeGuestMutation.mutate(id);
    }
  };

  const reviewMutation = useMutation({
    mutationFn: () =>
      api.post("/reviews", { bookingId: reviewBooking?.id, rating, comment, tagIds: selectedTags }),
    onSuccess: () => {
      toast({ title: "¡Gracias por tu reseña!" });
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      setReviewBooking(null);
      setComment("");
      setSelectedTags([]);
      setRating(5);
    },
    onError: (err: any) => {
      if (err?.response?.status === 409) {
        qc.invalidateQueries({ queryKey: ["my-bookings"] });
        setReviewBooking(null);
      }
      const msg = err?.response?.data?.message || "No se pudo enviar la reseña.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-xl font-bold">Mis reservas</h1>
            {policy.enabled && policy.free_cancellations_per_membership > 0 && (
              loadingQuota ? (
                // Gate: evita el flash de "N restantes" con el cupo completo
                // antes de que /bookings/cancellation-quota descuente las usadas.
                <Skeleton className="h-4 w-56" />
              ) : (
                <div className="flex items-center gap-2 text-xs text-[#715B50]">
                  <span>Cancelaciones gratis en esta membresía:</span>
                  <span className="flex gap-1" aria-label={`${quota.remaining} de ${quota.free_per_membership} disponibles`}>
                    {Array.from({ length: quota.free_per_membership }).map((_, i) => (
                      <span
                        key={i}
                        className={`inline-block w-2 h-2 rounded-full ${i < quota.used ? "bg-[#836A5D]/25" : "bg-[#1a6b0a]"}`}
                      />
                    ))}
                  </span>
                  <span className="font-semibold text-[#2d2d2d]">
                    {quota.remaining} restante{quota.remaining === 1 ? "" : "s"}
                  </span>
                </div>
              )
            )}
          </div>
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
          ) : (
            <Tabs defaultValue="upcoming">
              <TabsList>
                <TabsTrigger value="upcoming">Próximas ({upcoming.length})</TabsTrigger>
                <TabsTrigger value="past">Pasadas ({past.length})</TabsTrigger>
                <TabsTrigger value="cancelled">Canceladas ({cancelled.length})</TabsTrigger>
              </TabsList>
              {[
                { key: "upcoming", list: upcoming },
                { key: "past", list: past },
                { key: "cancelled", list: cancelled },
              ].map(({ key, list }) => (
                <TabsContent key={key} value={key} className="space-y-3 mt-4">
                  {list.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay reservas aquí</p>
                  ) : (
                    list.map((b) => (
                      <BookingCard
                        key={b.id}
                        booking={b}
                        policy={policy}
                        onCancel={setCancelId}
                        onRemoveGuest={handleRemoveGuest}
                        onReview={setReviewBooking}
                      />
                    ))
                  )}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>

        {/* Cancel confirm — 3 variantes según ventana + cupo gratis */}
        {(() => {
          const targetBooking = cancelId ? bookings.find((b) => b.id === cancelId) : null;
          const minutesUntil = targetBooking ? (new Date(targetBooking.start_time).getTime() - Date.now()) / 60_000 : 0;
          const insideWindow = minutesUntil >= policy.min_hours * 60;
          const variant: "free" | "penalty" | "blocked" =
            !insideWindow ? "blocked" : quota.remaining > 0 ? "free" : "penalty";
          const willRefund = variant === "free";
          return (
            <AlertDialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {variant === "free" && "🟢 Cancelar reserva"}
                    {variant === "penalty" && "🟡 Cancelar reserva — sin reembolso"}
                    {variant === "blocked" && "🚫 Ya no se puede cancelar"}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-3">
                    {variant === "free" && (
                      <>
                        <span className="block">
                          Estás a más de {policy.min_hours}h de tu clase. Te devolvemos el crédito a tu paquete.
                        </span>
                        <span className="block rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-800 text-xs leading-relaxed">
                          Quedará: <strong>{Math.max(0, quota.remaining - 1)} cancelación{quota.remaining - 1 === 1 ? "" : "es"}</strong> gratis en esta membresía.
                        </span>
                      </>
                    )}
                    {variant === "penalty" && (
                      <span className="block rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800 text-xs leading-relaxed">
                        Ya usaste tus <strong>{policy.free_cancellations_per_membership}</strong> cancelaciones gratis de esta membresía. Si cancelas ahora, <strong>la clase se te contará como tomada</strong> (no se devuelve crédito). El cupo quedará libre para alguien en lista de espera.
                      </span>
                    )}
                    {variant === "blocked" && (
                      <span className="block rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-800 text-xs leading-relaxed">
                        Solo puedes cancelar hasta <strong>{policy.min_hours}h</strong> antes de tu clase. {policy.late_cancel_message || "Si tienes una emergencia, contacta al estudio."}
                      </span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  {variant === "blocked" ? (
                    <AlertDialogCancel>Entendido</AlertDialogCancel>
                  ) : (
                    <>
                      <AlertDialogCancel>Volver</AlertDialogCancel>
                      <AlertDialogAction
                        className={willRefund ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-amber-600 text-white hover:bg-amber-700"}
                        onClick={() => cancelId && cancelMutation.mutate(cancelId)}
                      >
                        {willRefund ? "Cancelar reserva" : "Cancelar de todas formas"}
                      </AlertDialogAction>
                    </>
                  )}
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          );
        })()}

        {/* Review dialog */}
        <Dialog open={!!reviewBooking} onOpenChange={() => { setReviewBooking(null); setSelectedTags([]); setComment(""); setRating(5); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dejar reseña — {reviewBooking?.class_type_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>Calificación</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} onClick={() => setRating(s)}>
                      <Star
                        size={24}
                        className={s <= rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground"}
                      />
                    </button>
                  ))}
                </div>
              </div>
              {reviewTags.length > 0 && (
                <div className="space-y-1">
                  <Label>¿Qué te gustó? (opcional)</Label>
                  <div className="flex flex-wrap gap-2">
                    {reviewTags.map((tag) => {
                      const isSelected = selectedTags.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() =>
                            setSelectedTags((prev) =>
                              isSelected ? prev.filter((t) => t !== tag.id) : [...prev, tag.id]
                            )
                          }
                          className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                            isSelected
                              ? "border-primary bg-primary/20 text-primary font-semibold"
                              : "border-border bg-secondary text-muted-foreground hover:border-primary/50"
                          }`}
                          style={isSelected && tag.color ? { borderColor: tag.color, color: tag.color, backgroundColor: `${tag.color}20` } : undefined}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label>Comentario (opcional)</Label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="¿Cómo fue tu clase?"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => reviewMutation.mutate()} disabled={reviewMutation.isPending}>
                {reviewMutation.isPending ? "Enviando..." : "Enviar reseña"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default MyBookings;
